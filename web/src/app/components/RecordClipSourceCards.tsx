"use client";

import { isRecordClipDraftSource, isRecordClipSnapshot, parseRecordClipUrl, recordClipSelectedText, type RecordClipDraftSource } from "../../lib/learning/recordClipContracts";
import { ActionButton } from "./ui";

function SafeClipLink({ value }: { value: string | null }) {
  if (!value) return null;
  try { const href = parseRecordClipUrl(value); return <a className="break-all underline" href={href} target="_blank" rel="noreferrer noopener">{href}</a>; }
  catch { return <span>原始网址不可用</span>; }
}

export function RecordClipSourceCards({ sources, pendingOnly = false, history = false, disabled = false, onReread, onRemove }: { sources: unknown[]; pendingOnly?: boolean; history?: boolean; disabled?: boolean; onReread?: (source: RecordClipDraftSource) => void; onRemove?: (source: RecordClipDraftSource) => void }) {
  return <div className="space-y-3">{sources.map((source, index) => {
    const pending = isRecordClipDraftSource(source);
    if (!pending && (pendingOnly || !isRecordClipSnapshot(source))) return null;
    // The guards above keep unknown historical shapes in their existing raw reader.
    const metadata = pending ? source.preview : isRecordClipSnapshot(source) ? source : null;
    if (!metadata) return null;
    const fragments = pending ? source.preview.fragments.filter(fragment => source.fragmentIds.includes(fragment.id)) : isRecordClipSnapshot(source) ? source.fragments : [];
    const text = pending ? recordClipSelectedText(source.preview, source.fragmentIds) : fragments.map((fragment, at) => `${at && fragments[at - 1].end !== fragment.start ? "\n\n[…片段间原文未保存…]\n\n" : ""}${fragment.text}`).join("");
    return <article key={index} aria-label={`${pending ? "待保存" : history ? "历史" : "已保存"}剪藏来源：${metadata.title}`} className="rounded-lg border border-slate-300 bg-slate-50 p-3 text-sm">
      <h3 className="font-semibold">{metadata.title} · {pending ? "待保存剪藏" : "固定剪藏快照"}</h3>
      <p>{metadata.mode === "web" ? "系统读取的公开网页文字；内容未经核实。" : "本人提供的文字；系统未从声明网址取得这些文字。"}</p>
      <p>{metadata.mode === "web" ? "读取时间" : "提供时间"}：<time dateTime={metadata.capturedAt}>{metadata.capturedAt}</time></p>
      {metadata.requestedUrl && <p>声明／请求网址：<SafeClipLink value={metadata.requestedUrl} /></p>}
      {metadata.finalUrl && <p>最终读取网址：<SafeClipLink value={metadata.finalUrl} /></p>}
      {pending && <p>临时预览有效至：{source.preview.expiresAt}；过期或重启后需重读并明确采用，正文草稿保留。</p>}
      <pre aria-label="剪藏来源固定文字" className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded bg-white p-2 font-sans">{text}</pre>
      {metadata.truncated && <p>预览提取或可选片段已截取，未声称保存完整网页。</p>}
      {!!metadata.limitations.length && <details><summary>取得范围与限制</summary><ul className="list-inside list-disc">{metadata.limitations.map((limitation, at) => <li key={at}>{limitation}</li>)}</ul></details>}
      {pending && <div className="mt-2 flex flex-wrap gap-2">
        {onReread && <ActionButton variant="secondary" disabled={disabled} onClick={() => onReread(source)}>重新读取这个剪藏来源</ActionButton>}
        {onRemove && <ActionButton variant="secondary" disabled={disabled} onClick={() => onRemove(source)}>取消待保存剪藏来源“{metadata.title}”</ActionButton>}
      </div>}
    </article>;
  })}</div>;
}
