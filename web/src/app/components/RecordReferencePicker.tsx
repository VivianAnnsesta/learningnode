"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ActionButton } from "./ui";
import { readRecordJson, recordKindLabels, type RecordChoice, type RecordSnapshot } from "./recordDiscoveryTypes";

type Results = { knowledgePoints: RecordChoice[]; page: { total: number; nextOffset: number | null } };

export function RecordReferencePicker({ pointId, selected, disabled, onAdd }: {
  pointId: string;
  selected: RecordSnapshot[];
  disabled: boolean;
  onAdd: (source: RecordSnapshot) => void;
}) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [records, setRecords] = useState<RecordChoice[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef({ value: 0 });
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

  const selectedKeys = new Set(selected.map(source => `${source.knowledgePointId}:${source.revisionId}`));
  return <div className="space-y-3">
    <label className="block">查找要引用的个人记录
      <input aria-label="搜索要引用的记录" className="workshop-input mt-2 w-full" value={search} onChange={event => setSearch(event.target.value)} placeholder="按标题或正文查找，可以继续读取更早的记录" />
    </label>
    <p className="text-sm">选择后先加入当前编辑草稿，点击“确认保存新修订”才会保存引用。引用保留所选版本的原文。</p>
    {error && <div role="alert"><p>{error}</p><ActionButton variant="secondary" onClick={() => void load()}>重试查找引用记录</ActionButton></div>}
    <div className="max-h-96 space-y-3 overflow-y-auto">
      {records.filter(record => record.id !== pointId).map(record => {
        const alreadySelected = selectedKeys.has(`${record.id}:${record.currentRevisionId}`);
        return <article key={record.id} className="rounded-lg border p-3">
          <p className="font-medium">{record.title} <span className="text-sm font-normal">· {recordKindLabels[record.kind] || record.kind}</span></p>
          <p className="whitespace-pre-wrap text-sm">{record.body.slice(0, 180)}</p>
          <ActionButton variant="secondary" disabled={disabled || !record.currentRevisionId || alreadySelected} onClick={() => {
            if (record.currentRevisionId) onAdd({ kind: "record", knowledgePointId: record.id, revisionId: record.currentRevisionId, title: record.title, body: record.body, sourceType: record.sourceType });
          }}>{alreadySelected ? `已加入“${record.title}”` : `引用“${record.title}”`}</ActionButton>
          {!record.currentRevisionId && <p className="text-sm">旧记录尚无可引用修订，可先打开并保存个人修订。</p>}
        </article>;
      })}
    </div>
    {!loading && !error && !records.some(record => record.id !== pointId) && <p>没有找到其他符合条件的记录。</p>}
    {loading && <p role="status">正在查找引用记录…</p>}
    <p className="text-sm">符合查询的记录共 {total} 条，当前记录不在可引用列表中。</p>
    {nextOffset !== null && <ActionButton variant="secondary" disabled={loading} onClick={() => void load(nextOffset)}>继续查找更早的记录</ActionButton>}
  </div>;
}
