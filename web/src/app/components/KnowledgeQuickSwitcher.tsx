"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type SearchResult = { id: string; title: string; body: string; kind: string };

export function KnowledgeQuickSwitcher() {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const close = useCallback(() => { dialog.current?.close(); setOpen(false); }, []);
  const show = useCallback(() => {
    if (dialog.current?.open) return;
    dialog.current?.showModal();
    setOpen(true);
    input.current?.focus();
  }, []);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        show();
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [show]);

  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setItems([]);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/knowledge-points?q=${encodeURIComponent(query)}&limit=20`, { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw Error(data.error || "无法查找记录，请重试。");
        if (!controller.signal.aborted) setItems(data.knowledgePoints || []);
      } catch (cause) {
        if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "无法查找记录，请重试。");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, open, retry]);

  return <>
    <button type="button" className="underline" onClick={show}>查找记录 <kbd>Ctrl K</kbd></button>
    <dialog ref={dialog} aria-labelledby="knowledge-switcher-title" onClose={() => setOpen(false)} className="m-auto w-[min(42rem,95vw)] rounded-xl border bg-white p-5 text-[color:var(--ink)] shadow-xl backdrop:bg-black/30">
      <div className="flex items-center justify-between gap-4">
        <h2 id="knowledge-switcher-title" className="text-lg font-semibold">快速查找个人记录</h2>
        <button type="button" className="underline" onClick={close}>关闭查找</button>
      </div>
      <input ref={input} aria-label="快速查找关键词" placeholder="搜索标题与正文，留空查看最近记录" className="workshop-input my-4 w-full" value={query} onChange={event => setQuery(event.target.value)} />
      {loading && <p role="status">正在查找…</p>}
      {error && <p role="alert">{error} <button type="button" className="underline" onClick={() => setRetry(value => value + 1)}>重试查找</button></p>}
      <ul className="max-h-[55vh] overflow-y-auto">
        {items.map(item => <li key={item.id} className="border-t py-3">
          <Link onClick={close} className="block underline" href={`/learning/knowledge/${encodeURIComponent(item.id)}`}>{item.title}</Link>
          <p className="mt-1 whitespace-pre-wrap text-sm">{item.body.slice(0, 160)}</p>
        </li>)}
      </ul>
      {!loading && !error && !items.length && <p>没有匹配的记录，可尝试其他关键词。</p>}
      <Link onClick={close} className="mt-4 inline-block underline" href={`/learning/knowledge?q=${encodeURIComponent(query)}`}>在个人网络中查看全部结果</Link>
    </dialog>
  </>;
}
