"use client";

import { useEffect, useRef, useState } from "react";
import { KNOWLEDGE_EXPORT_TIMEOUT_MS, type KnowledgeExportRequest } from "../../lib/learning/knowledgeExportContracts";
import { readKnowledgeExportDownload } from "./knowledgeExportDownload";

type ActiveExport = { controller: AbortController; timer: ReturnType<typeof setTimeout>; reason: "cancelled" | "timeout" | "scope" | null };

export function useKnowledgeExportDownload(request: KnowledgeExportRequest | null, scopeKey: string) {
  const requestKey = request ? JSON.stringify(request) : `unavailable:${scopeKey}`;
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const lifecycle = useRef<{ generation: number; active: ActiveExport | null }>({ generation: 0, active: null });
  const latest = useRef({ requestKey, request });
  latest.current = { requestKey, request };
  const objectUrls = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const state = lifecycle.current;
    const interrupted = !!state.active;
    state.active = null; setBusy(false); setError(""); setNotice(interrupted ? "导出范围已变化，已取消准备；请按当前范围重新导出。" : "");
    return () => { state.generation++; if (state.active) { state.active.reason = "scope"; clearTimeout(state.active.timer); state.active.controller.abort(); } };
  }, [requestKey]);
  useEffect(() => {
    const urls = objectUrls.current;
    return () => { for (const [url, timer] of urls) { clearTimeout(timer); URL.revokeObjectURL(url); } urls.clear(); };
  }, []);

  const cancel = () => {
    const state = lifecycle.current, active = state.active;
    if (!active) return;
    state.generation++; active.reason = "cancelled"; clearTimeout(active.timer); active.controller.abort(); state.active = null;
    setBusy(false); setError(""); setNotice("已取消准备导出；记录草稿和检索条件保持原样。");
  };
  const start = async () => {
    const state = lifecycle.current;
    if (!request || latest.current.requestKey !== requestKey || state.active) return;
    const generation = ++state.generation, controller = new AbortController();
    const active: ActiveExport = { controller, reason: null, timer: setTimeout(() => { active.reason = "timeout"; controller.abort(); }, KNOWLEDGE_EXPORT_TIMEOUT_MS) };
    state.active = active; setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/knowledge-points/export", { method: "POST", headers: { "Content-Type": "application/json" }, body: requestKey, signal: controller.signal });
      const archive = await readKnowledgeExportDownload(response, controller.signal);
      if (generation !== state.generation || controller.signal.aborted || latest.current.requestKey !== requestKey) return;
      const url = URL.createObjectURL(new Blob([archive.bytes], { type: "application/zip" }));
      const link = document.createElement("a");
      link.href = url; link.download = archive.metadata.filename; link.hidden = true;
      try { document.body.append(link); link.click(); }
      catch (cause) { URL.revokeObjectURL(url); throw cause; }
      finally { link.remove(); }
      const timer = setTimeout(() => { URL.revokeObjectURL(url); objectUrls.current.delete(url); }, 60000);
      objectUrls.current.set(url, timer);
      setNotice(`已请求下载${archive.metadata.recordCount}条记录（${archive.metadata.revisionCount}份修订）。请在浏览器或桌面下载界面确认保存位置与结果。`);
    } catch (cause) {
      if (generation !== state.generation || latest.current.requestKey !== requestKey) return;
      if (active.reason === "timeout") setError("准备导出超时，未请求下载；请缩小范围或关闭历史修订后重试。");
      else if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "准备导出失败，未请求下载，请重试。");
    } finally {
      clearTimeout(active.timer);
      if (generation === state.generation) { state.active = null; setBusy(false); }
    }
  };
  return { busy, error, notice, start, cancel };
}
