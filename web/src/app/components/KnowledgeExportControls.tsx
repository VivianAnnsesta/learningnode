"use client";

import { useState } from "react";
import { parseKnowledgeExportRequest, type KnowledgeExportRequest, type KnowledgeExportScope } from "../../lib/learning/knowledgeExportContracts";
import { useKnowledgeExportDownload } from "./useKnowledgeExportDownload";
import { ActionButton } from "./ui";

export function KnowledgeExportControls({ mode, scope, scopeKey, disabledReason }: { mode: "view" | "record"; scope: KnowledgeExportScope | null; scopeKey: string; disabledReason?: string }) {
  const [includeHistory, setIncludeHistory] = useState(true);
  let request: KnowledgeExportRequest | null = null, validation = "";
  if (scope && !disabledReason) {
    try { request = parseKnowledgeExportRequest({ scope, includeHistory }); }
    catch (cause) { validation = cause instanceof Error ? cause.message : "导出范围不可用，请重新读取。"; }
  }
  const download = useKnowledgeExportDownload(request, scopeKey);
  const reason = disabledReason || validation || (!scope ? "请先读取已保存内容，再准备导出。" : "");
  return <section aria-label="个人记录导出" data-knowledge-export-scope={mode} className="space-y-3 rounded-lg border border-slate-300 p-3">
    <h3 className="text-lg font-semibold">导出已保存的个人记录</h3>
    <p className="text-sm">{mode === "view" ? "导出整个已应用检索结果，包含尚未加载的记录；显示字段与浏览月份不限制导出内容。" : "导出这条记录在服务器读取时的已保存内容。"}编辑草稿不包含在内，也不会被保存或清空。</p>
    <label className="flex items-center gap-2"><input type="checkbox" aria-label="包含全部历史修订" checked={includeHistory} disabled={download.busy} onChange={event => setIncludeHistory(event.target.checked)} />包含全部历史修订</label>
    <p className="text-sm">{includeHistory ? "包含所选记录的所有历史修订。" : "只导出当前已保存版本。"}两种选择都会保留其中已有的固定来源快照。文件为 Markdown 和版本化清单组成的 ZIP，最多64 MiB；不会自动包含来源指向的其他整条记录。</p>
    {scope?.mode === "view" && scope.observedDateWindow && <p className="text-sm">导出使用页面已显示日期窗口：{scope.observedDateWindow.from || "不限起日"} 至 {scope.observedDateWindow.to || "不限止日"} · {scope.observedDateWindow.timeZone}。</p>}
    {reason && <p role="status">{reason}</p>}
    <div className="flex flex-wrap gap-2"><ActionButton variant="secondary" disabled={download.busy || !request} onClick={() => void download.start()}>{mode === "view" ? "导出整个检索结果" : "导出这条已保存记录"}</ActionButton>{download.busy && <ActionButton variant="secondary" onClick={download.cancel}>取消准备导出</ActionButton>}</div>
    {download.busy && <p role="status">正在准备并校验完整 ZIP，尚未请求下载…</p>}
    {download.error && <p role="alert">{download.error}</p>}
    {download.notice && <p role="status">{download.notice}</p>}
  </section>;
}
