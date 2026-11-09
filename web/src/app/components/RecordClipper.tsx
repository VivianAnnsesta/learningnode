"use client";

import { useEffect, useRef, useState } from "react";
import { isRecordClipDraftSource, isRecordClipPreview, makeRecordClipDraftSource, parseRecordClipRequest, recordClipSelectedText, recordClipSourceKey, type RecordClipDraftSource, type RecordClipPreview, type RecordClipRequest } from "../../lib/learning/recordClipContracts";
import type { RecordTemplateDraftPreview, RecordTemplateInsertionController } from "./useRecordTemplateInsertion";
import { RecordClipSourceCards } from "./RecordClipSourceCards";
import { ActionButton } from "./ui";

type LocatedClip = { source: RecordClipDraftSource; insertion: RecordTemplateDraftPreview };

export function RecordClipper({ editor, sources, onSourcesChange, disabled = false, replacementLocked = false }: { editor: RecordTemplateInsertionController; sources: unknown[]; onSourcesChange: (sources: unknown[]) => void; disabled?: boolean; replacementLocked?: boolean }) {
  const [mode, setMode] = useState<"web" | "pasted">("web");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [preview, setPreview] = useState<RecordClipPreview | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [located, setLocated] = useState<LocatedClip | null>(null);
  const [replacement, setReplacement] = useState<RecordClipDraftSource | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [, setExpirationVersion] = useState(0);
  const generation = useRef({ value: 0 });
  const active = useRef<AbortController | null>(null);
  const latest = useRef({ baseKey: editor.baseKey, disabled, replacementLocked, sources });
  latest.current = { baseKey: editor.baseKey, disabled, replacementLocked, sources };
  useEffect(() => {
    const counter = generation.current;
    setPreview(null); setLocated(null); setReplacement(null); setSelected([]); setReading(false); setError(""); setNotice("");
    return () => { counter.value++; active.current?.abort(); };
  }, [editor.baseKey]);
  useEffect(() => {
    if (!preview) return;
    const timer = window.setTimeout(() => setExpirationVersion(value => value + 1), Math.max(0, Date.parse(preview.expiresAt) - Date.now()) + 1);
    return () => window.clearTimeout(timer);
  }, [preview]);
  const editInput = () => { generation.current.value++; active.current?.abort(); setReading(false); setPreview(null); setLocated(null); setSelected([]); setNotice(""); setError(""); };
  const read = async (request: RecordClipRequest, replace: RecordClipDraftSource | null = null) => {
    const key = ++generation.current.value, baseKey = editor.baseKey;
    active.current?.abort(); const controller = new AbortController(); active.current = controller;
    setReading(true); setError(""); setNotice(""); setPreview(null); setLocated(null); setSelected([]); setReplacement(replace);
    try {
      const response = await fetch("/api/knowledge-points/clip-preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request), signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "剪藏预览读取失败，请检查输入后重试。");
      if (!isRecordClipPreview(data.preview)) throw new Error("剪藏预览格式不可读取，请重试；草稿没有改变。");
      if (key !== generation.current.value || baseKey !== latest.current.baseKey) return;
      const capture: RecordClipPreview = data.preview;
      setPreview(capture);
      setSelected(replace ? capture.fragments.filter(fragment => replace.fragmentIds.includes(fragment.id)).map(fragment => fragment.id) : []);
    } catch (cause) { if (key === generation.current.value && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : "剪藏预览读取失败。"); }
    finally { if (key === generation.current.value) setReading(false); }
  };
  const reread = (source: RecordClipDraftSource) => {
    const capture = source.preview;
    const request: RecordClipRequest = capture.mode === "web" ? { mode: "web", url: capture.requestedUrl! } : { mode: "pasted", text: capture.text, title: capture.title, ...(capture.requestedUrl ? { url: capture.requestedUrl } : {}) };
    setMode(capture.mode); setUrl(capture.requestedUrl || ""); setTitle(capture.title); setText(capture.mode === "pasted" ? capture.text : "");
    void read(request, source);
  };
  const makeSource = () => {
    if (!preview) throw new Error("请先读取剪藏预览。");
    if (Date.parse(preview.expiresAt) <= Date.now()) throw new Error("剪藏预览已过期，请重新读取；正文和来源草稿保留。");
    return makeRecordClipDraftSource(preview, selected);
  };
  const blocked = disabled || replacementLocked;
  const expired = !!preview && Date.parse(preview.expiresAt) <= Date.now();
  const position = located?.insertion.plan.position;
  return <section aria-label="剪藏到正文草稿" className="my-4 space-y-3 rounded-lg border border-slate-300 p-3">
    <h3 className="text-lg font-semibold">剪藏到正文草稿</h3>
    <p className="text-sm">读取与选择不保存记录。选片后预览插入位置，再把纯文字和来源一起插入；最后仍需确认保存。</p>
    {replacementLocked && <p role="status">上次剪藏保存结果尚未核对。请先核对原保存命令，再采用新的捕获或继续保存。</p>}
    <label className="block">剪藏读取方式 <select aria-label="剪藏读取方式" className="workshop-input" value={mode} disabled={disabled || reading} onChange={event => { editInput(); setMode(event.target.value as "web" | "pasted"); }}><option value="web">公开网页 HTML</option><option value="pasted">本人提供文字</option></select></label>
    <label className="block">剪藏网址{mode === "pasted" ? "（可选，仅声明来源）" : "（HTTPS）"}<input aria-label="剪藏网址" className="workshop-input w-full" disabled={disabled || reading} value={url} onChange={event => { editInput(); setUrl(event.target.value); }} /></label>
    {mode === "pasted" && <>
      <label className="block">本人提供的剪藏标题（可选）<input aria-label="本人提供的剪藏标题" className="workshop-input w-full" disabled={disabled || reading} value={title} onChange={event => { editInput(); setTitle(event.target.value); }} /></label>
      <label className="block">本人提供的剪藏文字<textarea aria-label="本人提供的剪藏文字" className="workshop-input min-h-32 w-full" disabled={disabled || reading} value={text} onChange={event => { editInput(); setText(event.target.value); }} /></label>
    </>}
    <ActionButton variant="secondary" disabled={disabled || reading} onClick={() => { try { void read(parseRecordClipRequest(mode === "web" ? { mode, url } : { mode, text, ...(title ? { title } : {}), ...(url ? { url } : {}) }), replacement); } catch (cause) { setError(cause instanceof Error ? cause.message : "剪藏输入无效。"); } }}>读取剪藏预览</ActionButton>
    {replacement && <ActionButton variant="secondary" disabled={disabled || reading} onClick={() => { setReplacement(null); setPreview(null); setLocated(null); setSelected([]); setNotice("已取消替换，原待保存来源与正文保留；可重新读取另一份剪藏。"); }}>取消来源替换</ActionButton>}
    {reading && <p role="status">正在读取固定剪藏预览…</p>}
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {preview && <div role="region" aria-label="固定剪藏预览" className="space-y-2">
      <h4 className="font-semibold">{preview.title}</h4>
      <p>{preview.mode === "web" ? "系统读取的公开网页文字，内容未经核实。读取时间" : "本人提供的文字，未从声明网址抓取。提供时间"}：{preview.capturedAt}</p>
      <p className="text-sm">有效至 {preview.expiresAt}。{expired ? "预览已过期，请重新读取。" : "不会自动续期。"}</p>
      {preview.limitations.map((limitation, index) => <p className="text-sm" key={index}>{limitation}</p>)}
      <div className="max-h-80 space-y-2 overflow-y-auto">{preview.fragments.map((fragment, index) => <label key={fragment.id} className="block rounded border bg-slate-50 p-2"><input type="checkbox" aria-label={`选择剪藏片段 ${index + 1}`} checked={selected.includes(fragment.id)} disabled={disabled} onChange={event => { const ids = event.target.checked ? [...selected, fragment.id] : selected.filter(id => id !== fragment.id); setSelected(preview.fragments.filter(item => ids.includes(item.id)).map(item => item.id)); setLocated(null); }} /> {fragment.location}<pre className="whitespace-pre-wrap break-words font-sans">{fragment.text}</pre></label>)}</div>
      {replacement ? <>
        <p>正在重读待保存来源。比较后明确采用；正文中的旧文字保留供合并，不会再插入。</p>
        <details><summary>比较原待保存片段</summary><pre className="whitespace-pre-wrap break-words">{recordClipSelectedText(replacement.preview, replacement.fragmentIds)}</pre></details>
        <ActionButton variant="secondary" disabled={blocked || expired || !selected.length || !sources.includes(replacement)} onClick={() => { try { const next = makeSource(); const current = latest.current; if (current.disabled || current.replacementLocked || !current.sources.includes(replacement)) return; onSourcesChange(current.sources.map(source => source === replacement ? next : source)); setReplacement(null); setLocated(null); setNotice("已明确采用新预览替换待保存来源；正文保留，请自行合并后确认保存。"); } catch (cause) { setError(cause instanceof Error ? cause.message : "无法采用新来源。"); } }}>采用新预览替换待保存来源</ActionButton>
      </> : <>
        <ActionButton variant="secondary" disabled={blocked || expired || !selected.length} onClick={() => { try { const source = makeSource(); if (sources.length >= 30) throw new Error("一份记录最多保存30个来源，请先移除不需要的待保存来源。"); if (sources.some(value => isRecordClipDraftSource(value) && recordClipSourceKey(value) === recordClipSourceKey(source))) throw new Error("这些剪藏片段已在草稿中，请选择其他片段或先移除原来源。"); setLocated({ source, insertion: editor.capture(recordClipSelectedText(source.preview, source.fragmentIds)) }); setError(""); } catch (cause) { setError(cause instanceof Error ? cause.message : "无法预览插入位置。"); } }}>预览所选片段的插入位置</ActionButton>
        {located && <div role="region" aria-label="剪藏插入预览" className="rounded border p-2"><p>插入位置：{position === "caret" ? "正文光标处" : position === "after_selection" ? "选区后，选中文字保留" : "正文末尾"}。{located.insertion.plan.fallback && "原定位与当前正文不一致，已明确预览末尾插入；可重新定位后再预览。"}</p><pre aria-label="剪藏插入后的正文预览" className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-sans">{located.insertion.plan.after}</pre><ActionButton disabled={blocked || expired || !editor.isCurrent(located.insertion)} onClick={() => { if (Date.parse(located.source.preview.expiresAt) <= Date.now()) { setError("剪藏预览已过期，请重新读取；正文和来源草稿保留。"); return; } if (editor.insertClip(located.insertion, located.source)) { setLocated(null); setNotice("剪藏片段与来源已一起插入草稿，尚未保存。"); } else setError("草稿或来源已变化，请重新预览插入位置；没有插入任何内容。"); }}>插入剪藏片段和来源到草稿</ActionButton>{!editor.isCurrent(located.insertion) && <p>草稿、来源或位置已变化，请重新预览。</p>}</div>}
      </>}
    </div>}
    <ActionButton variant="secondary" disabled={blocked || !editor.canUndoClip} onClick={editor.undoClip}>撤销最近一次剪藏插入</ActionButton>
    {editor.clipNotice && <p role="status">{editor.clipNotice}</p>}
    <RecordClipSourceCards sources={sources} pendingOnly disabled={blocked || reading} onReread={reread} onRemove={source => { onSourcesChange(sources.filter(value => value !== source)); setNotice("已移除待保存来源；正文保留供自行整理，尚未保存。"); }} />
  </section>;
}
