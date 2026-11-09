"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActionButton, SectionPanel } from "./ui";
import { readRecordJson, recordReferenceKey, recordReferenceLabel, type RecordSnapshot } from "./recordDiscoveryTypes";
import { RecordReferencePreview } from "./RecordReferencePreview";
import { knowledgeRecordHref, PERSONAL_KNOWLEDGE_PATH } from "./knowledgeNavigation";

type Context = {
  outgoing: RecordSnapshot[];
  backlinks: {
    items: { id: string; title: string; body: string; revisionId: string; sources: RecordSnapshot[] }[];
    page: { offset: number; limit: number; total: number; nextOffset: number | null };
  };
};

export function RecordContextPanel({ pointId, refresh, returnTo = PERSONAL_KNOWLEDGE_PATH }: { pointId: string; refresh: number; returnTo?: string }) {
  const [context, setContext] = useState<Context | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const generation = useRef({ value: 0 });
  const activeRequest = useRef<AbortController | null>(null);
  const load = useCallback(async (offset = 0) => {
    const request = ++generation.current.value;
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setLoading(true);
    setError("");
    try {
      const result = await readRecordJson<Context>(`/api/knowledge-points/${encodeURIComponent(pointId)}/context?offset=${offset}&limit=20`, controller.signal);
      if (request !== generation.current.value) return;
      setContext(previous => offset && previous ? { ...result, backlinks: { ...result.backlinks, items: [...previous.backlinks.items, ...result.backlinks.items.filter(item => !previous.backlinks.items.some(old => old.id === item.id))] } } : result);
    } catch (cause) {
      if (request === generation.current.value && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : "无法读取引用上下文。");
    } finally {
      if (request === generation.current.value) setLoading(false);
    }
  }, [pointId]);

  useEffect(() => {
    const counter = generation.current;
    setContext(null);
    void load();
    return () => { counter.value++; activeRequest.current?.abort(); };
  }, [load, refresh]);

  return <SectionPanel aria-label="记录引用与反向引用">
    <h2 className="text-xl">记录引用与反向引用</h2>
    <p className="text-sm">引用保存当时的修订原文；这里显示当前修订的引用，旧引用仍可在修订历史中回看。</p>
    {error && <div role="alert"><p>{error}</p><ActionButton variant="secondary" onClick={() => void load()}>重试读取引用</ActionButton></div>}
    {loading && <p role="status">正在读取引用上下文…</p>}
    {context && <>
      <h3 className="font-semibold">这条记录引用了什么 · {context.outgoing.length}</h3>
      {context.outgoing.length === 0 && <p>当前修订尚未引用其他个人记录。</p>}
      {context.outgoing.map(source => <article aria-label={`已保存引用：${source.title} · ${recordReferenceLabel(source)}`} className="rounded-lg border p-3" key={recordReferenceKey(source)}>
        <p className="font-medium">{source.title}</p>
        {source.selector ? <RecordReferencePreview source={source} /> : <details><summary>展开引用时的原文</summary><RecordReferencePreview source={source} /></details>}
        <Link className="underline" href={knowledgeRecordHref(source.knowledgePointId, returnTo)}>查看“{source.title}”当前版本</Link>
      </article>)}
      <h3 className="font-semibold">哪些记录引用了这里 · {context.backlinks.page.total}</h3>
      {context.backlinks.items.length === 0 && <p>还没有其他记录的当前修订引用这里。</p>}
      {context.backlinks.items.map(item => <article className="rounded-lg border p-3" key={item.id}>
        <Link className="font-medium underline" href={knowledgeRecordHref(item.id, returnTo)}>{item.title}</Link>
        <p className="whitespace-pre-wrap text-sm">{item.body}</p>
        {item.sources.map(source => <details key={recordReferenceKey(source)}>
          <summary>对方引用的本记录版本：{source.title}{source.selector ? ` · ${recordReferenceLabel(source)}` : ""}</summary>
          <RecordReferencePreview source={source} />
        </details>)}
      </article>)}
      {context.backlinks.page.nextOffset !== null && <ActionButton variant="secondary" disabled={loading} onClick={() => void load(context.backlinks.page.nextOffset!)}>继续查看反向引用</ActionButton>}
    </>}
  </SectionPanel>;
}
