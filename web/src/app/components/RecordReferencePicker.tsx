"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActionButton } from "./ui";
import { readRecordJson, recordAliasSummary, recordKindLabels, recordReferenceKey, type RecordChoice, type RecordSnapshot } from "./recordDiscoveryTypes";
import { paragraphSelector, referenceParagraphs, type ReferenceParagraph } from "../../lib/learning/recordReferences";

type Results = { knowledgePoints: RecordChoice[]; page: { total: number; nextOffset: number | null } };

function ParagraphChoices({ record, selected, disabled, pendingKey, onSelect }: {
  record: RecordChoice;
  selected: RecordSnapshot[];
  disabled: boolean;
  pendingKey: string | null;
  onSelect: (record: RecordChoice, paragraph: ReferenceParagraph) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const paragraphs = useMemo(() => open ? referenceParagraphs(record.body) : [], [record.body, open]);
  const selectedKeys = new Set(selected.map(recordReferenceKey));
  return <details onToggle={event => setOpen(event.currentTarget.open)}>
    <summary>选择“{record.title}”的段落</summary>
    {open && <div className="mt-3 space-y-3">
      <p className="text-sm">空行分隔不同段落，段内换行和长段落完整保留。可以选择多个段落，之后统一确认保存。</p>
      {paragraphs.map((paragraph, index) => {
        const existing = selected.find(source => source.knowledgePointId === record.id && source.revisionId === record.currentRevisionId && source.selector?.start === paragraph.start && source.selector.end === paragraph.end);
        const alreadySelected = existing ? selectedKeys.has(recordReferenceKey(existing)) : false;
        const key = JSON.stringify([record.id, record.currentRevisionId, paragraph.start, paragraph.end]);
        return <article key={key} aria-label={`${record.title} · 第${index + 1}段`} className="rounded-lg border p-3">
          <p className="font-medium">第{index + 1}段</p>
          <p className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words text-sm">{paragraph.quote}</p>
          <ActionButton variant="secondary" disabled={disabled || !!pendingKey || !record.currentRevisionId || alreadySelected} onClick={() => void onSelect(record, paragraph)}>{alreadySelected ? `已加入“${record.title}”的第${index + 1}段` : `引用“${record.title}”的第${index + 1}段`}</ActionButton>
          {pendingKey === key && <p role="status">正在准备这段原文的固定引用…</p>}
        </article>;
      })}
      {!paragraphs.length && <p>这条记录没有可引用的非空段落。</p>}
    </div>}
  </details>;
}

export function RecordReferencePicker({ pointId, selected, disabled, onAdd, onPendingChange }: {
  pointId: string;
  selected: RecordSnapshot[];
  disabled: boolean;
  onAdd: (source: RecordSnapshot) => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [records, setRecords] = useState<RecordChoice[]>([]);
  const [loadedQuery, setLoadedQuery] = useState<string | null>(null);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectionError, setSelectionError] = useState("");
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const generation = useRef({ value: 0 });
  const selectionGeneration = useRef({ value: 0 });
  const selectionContext = useRef({ pointId, search, disabled });
  selectionContext.current = { pointId, search, disabled };
  const activeRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 180);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async (offset = 0) => {
    const request = ++generation.current.value;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ q: query, limit: "50", offset: String(offset) });
      const result = await readRecordJson<Results>(`/api/knowledge-points?${params}`, controller.signal);
      if (request !== generation.current.value) return;
      setRecords(previous => offset ? [...previous, ...result.knowledgePoints.filter(record => !previous.some(old => old.id === record.id))] : result.knowledgePoints);
      setLoadedQuery(query);
      setTotal(result.page.total);
      setNextOffset(result.page.nextOffset);
    } catch (cause) {
      if (request === generation.current.value && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : "无法查找引用记录。");
    } finally {
      if (request === generation.current.value) setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    const counter = generation.current;
    setRecords([]);
    setNextOffset(null);
    void load();
    return () => { counter.value++; activeRequest.current?.abort(); };
  }, [load]);

  useEffect(() => {
    const counter = selectionGeneration.current;
    setPendingKey(null);
    setSelectionError("");
    onPendingChange?.(false);
    return () => { counter.value++; onPendingChange?.(false); };
  }, [pointId, search, onPendingChange]);

  const selectParagraph = async (record: RecordChoice, paragraph: ReferenceParagraph) => {
    if (!record.currentRevisionId || disabled || pendingKey) return;
    const request = ++selectionGeneration.current.value;
    const expected = selectionContext.current;
    setSelectionError("");
    setPendingKey(JSON.stringify([record.id, record.currentRevisionId, paragraph.start, paragraph.end]));
    onPendingChange?.(true);
    try {
      const selector = await paragraphSelector(record.body, paragraph.start, paragraph.end);
      if (request !== selectionGeneration.current.value || selectionContext.current.pointId !== expected.pointId || selectionContext.current.search !== expected.search || selectionContext.current.disabled) return;
      onAdd({ kind: "record", knowledgePointId: record.id, revisionId: record.currentRevisionId, title: record.title, body: record.body, sourceType: record.sourceType, selector: { ...selector, quote: paragraph.quote } });
    } catch (cause) {
      if (request === selectionGeneration.current.value) setSelectionError(cause instanceof Error ? cause.message : "无法准备段落引用，请重试。");
    } finally {
      if (request === selectionGeneration.current.value) { setPendingKey(null); onPendingChange?.(false); }
    }
  };

  const selectedKeys = new Set(selected.map(recordReferenceKey));
  const selectionDisabled = disabled || loading || query !== search.trim();
  const shownRecords = loadedQuery === search.trim() ? records : [];
  return <div className="space-y-3">
    <label className="block">查找要引用的个人记录
      <input aria-label="搜索要引用的记录" className="workshop-input mt-2 w-full" value={search} onChange={event => setSearch(event.target.value)} placeholder="按标题、正文或别名查找，可以继续读取更早的记录" />
    </label>
    <p className="text-sm">选择后先加入当前编辑草稿，点击“确认保存新修订”才会保存引用。引用保留所选版本的原文。</p>
    {error && <div role="alert"><p>{error}</p><ActionButton variant="secondary" onClick={() => void load()}>重试查找引用记录</ActionButton></div>}
    {selectionError && <p role="alert">{selectionError}</p>}
    <div className="max-h-96 space-y-3 overflow-y-auto">
      {shownRecords.filter(record => record.id !== pointId).map(record => {
        const alreadySelected = !!record.currentRevisionId && selectedKeys.has(recordReferenceKey({ knowledgePointId: record.id, revisionId: record.currentRevisionId }));
        return <article key={record.id} className="rounded-lg border p-3">
          <p className="font-medium">{record.title} <span className="text-sm font-normal">· {recordKindLabels[record.kind] || record.kind}</span></p>
          {recordAliasSummary(record) && <p className="text-sm">{recordAliasSummary(record)}</p>}
          <p className="whitespace-pre-wrap text-sm">{record.body.slice(0, 180)}</p>
          <ActionButton variant="secondary" disabled={selectionDisabled || !!pendingKey || !record.currentRevisionId || alreadySelected} onClick={() => {
            if (record.currentRevisionId) onAdd({ kind: "record", knowledgePointId: record.id, revisionId: record.currentRevisionId, title: record.title, body: record.body, sourceType: record.sourceType });
          }}>{alreadySelected ? `已加入“${record.title}”` : `引用“${record.title}”`}</ActionButton>
          {record.currentRevisionId && <ParagraphChoices key={`${record.id}:${record.currentRevisionId}`} record={record} selected={selected} disabled={selectionDisabled} pendingKey={pendingKey} onSelect={selectParagraph} />}
          {!record.currentRevisionId && <p className="text-sm">这条历史记录没有可引用的当前修订，引用选择暂不可用。</p>}
        </article>;
      })}
    </div>
    {!loading && !error && loadedQuery === search.trim() && !shownRecords.some(record => record.id !== pointId) && <p>没有找到其他符合条件的记录。</p>}
    {(loading || (!error && loadedQuery !== search.trim())) && <p role="status">正在查找引用记录…</p>}
    {loadedQuery === search.trim() && <p className="text-sm">符合查询的记录共 {total} 条，当前记录不在可引用列表中。</p>}
    {loadedQuery === search.trim() && nextOffset !== null && <ActionButton variant="secondary" disabled={loading} onClick={() => void load(nextOffset)}>继续查找更早的记录</ActionButton>}
  </div>;
}
