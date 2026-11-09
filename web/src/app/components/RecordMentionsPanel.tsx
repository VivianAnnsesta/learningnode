"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActionButton, SectionPanel } from "./ui";
import { readRecordJson } from "./recordDiscoveryTypes";
import { knowledgeRecordHref, PERSONAL_KNOWLEDGE_PATH } from "./knowledgeNavigation";

type RecordMentions = {
  target: { id: string; title: string; revisionId: string | null; names: string[] };
  mentions: {
    items: { id: string; title: string; revisionId: string; matchedNames: string[]; context: { start: number; end: number; quote: string } }[];
    page: { offset: number; limit: number; total: number; nextOffset: number | null };
  };
  unavailableReason?: string;
};

export function RecordMentionsPanel({ pointId, revisionId, refresh, returnTo = PERSONAL_KNOWLEDGE_PATH }: {
  pointId: string;
  revisionId: string | null;
  refresh: number;
  returnTo?: string;
}) {
  const [data, setData] = useState<RecordMentions | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef({ value: 0 });
  const activeRequest = useRef<AbortController | null>(null);
  const loadedRevision = useRef<string | null>(null);

  const load = useCallback(async (offset = 0) => {
    const request = ++generation.current.value;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setError("");
    try {
      const base = `/api/knowledge-points/${encodeURIComponent(pointId)}/mentions`;
      let pageOffset = offset;
      let result = await readRecordJson<RecordMentions>(`${base}?offset=${pageOffset}&limit=20`, controller.signal);
      if (request !== generation.current.value) return;
      if (pageOffset && loadedRevision.current !== result.target.revisionId) {
        pageOffset = 0;
        result = await readRecordJson<RecordMentions>(`${base}?offset=0&limit=20`, controller.signal);
      }
      if (request !== generation.current.value) return;
      loadedRevision.current = result.target.revisionId;
      setData(previous => pageOffset && previous ? {
        ...result,
        mentions: { ...result.mentions, items: [...previous.mentions.items, ...result.mentions.items.filter(item => !previous.mentions.items.some(old => old.id === item.id))] }
      } : result);
    } catch (cause) {
      if (request === generation.current.value && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : "无法读取未引用提及。");
    } finally {
      if (request === generation.current.value) setLoading(false);
    }
  }, [pointId]);

  useEffect(() => {
    const counter = generation.current;
    loadedRevision.current = null;
    setData(null);
    void load();
    return () => { counter.value++; activeRequest.current?.abort(); };
  }, [load, refresh, revisionId]);

  return <SectionPanel aria-label="提到此名称但尚未引用的记录">
    <h2 className="text-xl">提到此名称但尚未引用的记录</h2>
    <p className="text-sm">只查找其他记录当前正文中的名称提及。文字相同不代表含义相同，这里不会自动建立引用或知识联系。</p>
    {error && <div role="alert"><p>{error}</p><ActionButton variant="secondary" disabled={loading} onClick={() => void load()}>重试读取未引用提及</ActionButton></div>}
    {loading && <p role="status">正在查找未引用提及…</p>}
    {data && <>
      <p>查找目标：{data.target.title}</p>
      {!!data.target.names.length && <p className="text-sm">使用当前已保存名称：{data.target.names.join("、")}</p>}
      {data.unavailableReason ? <p role="status">{data.unavailableReason}</p> : <>
        <p className="text-sm">符合条件的来源记录共 {data.mentions.page.total} 条，已读取 {data.mentions.items.length} 条。</p>
        {data.mentions.items.map(item => <article key={item.id} aria-label={`未引用提及：${item.title}`} className="space-y-3 rounded-lg border p-3">
          <h3 className="font-medium">{item.title}</h3>
          <p className="text-sm">命中名称：{item.matchedNames.join("、")}</p>
          <details open><summary>命中的完整原文段落</summary><p className="max-h-80 overflow-y-auto whitespace-pre-wrap break-words">{item.context.quote}</p></details>
          <p className="text-sm">打开来源记录后，在“添加记录引用”中查找“{data.target.title}”或上面的名称，选择全文或段落，再确认保存新修订。</p>
          <Link className="inline-block underline" href={knowledgeRecordHref(item.id, returnTo)}>打开“{item.title}”并选择引用</Link>
        </article>)}
        {!data.mentions.items.length && !loading && <p>当前没有找到尚未引用的来源记录。</p>}
        {data.mentions.page.nextOffset !== null && <ActionButton variant="secondary" disabled={loading} onClick={() => void load(data.mentions.page.nextOffset!)}>继续查看未引用提及</ActionButton>}
      </>}
    </>}
  </SectionPanel>;
}
