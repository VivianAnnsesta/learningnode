import { KNOWLEDGE_EXPORT_MAX_BYTES, parseKnowledgeExportDownloadHeaders, type KnowledgeExportDownloadMetadata } from "../../lib/learning/knowledgeExportContracts";

const abortError = () => new DOMException("导出准备已取消。", "AbortError");
function checkAbort(signal: AbortSignal) { if (signal.aborted) throw abortError(); }

async function responseError(response: Response, signal: AbortSignal) {
  const fallback = `导出失败（HTTP ${response.status}），请检查范围或稍后重试。`;
  const reader = response.body?.getReader();
  if (!reader) return fallback;
  const chunks: Uint8Array[] = [];
  let count = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    for (;;) {
      checkAbort(signal);
      const next = await reader.read();
      checkAbort(signal);
      if (next.done) break;
      count += next.value.byteLength;
      if (count > 8192) return fallback;
      chunks.push(next.value);
    }
    const bytes = new Uint8Array(count);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try {
      const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
      if (value && typeof value === "object" && "error" in value && typeof value.error === "string" && value.error.trim()) return value.error.slice(0, 1000);
    } catch { /* Non-JSON failures are not downloaded or rendered as HTML. */ }
    return fallback;
  } finally { signal.removeEventListener("abort", cancel); cancel(); reader.releaseLock(); }
}

/** The byte header describes the decoded archive; Content-Length may describe HTTP compression. */
export async function readKnowledgeExportDownload(response: Response, signal: AbortSignal): Promise<{ bytes: Uint8Array; metadata: KnowledgeExportDownloadMetadata }> {
  checkAbort(signal);
  if (!response.ok) throw new Error(await responseError(response, signal));
  let metadata: KnowledgeExportDownloadMetadata;
  try { metadata = parseKnowledgeExportDownloadHeaders(response.headers); }
  catch (error) { void response.body?.cancel().catch(() => {}); throw error; }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("导出响应没有可读取的ZIP正文，未请求下载。");
  const bytes = new Uint8Array(metadata.bytes);
  let offset = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  try {
    for (;;) {
      checkAbort(signal);
      const next = await reader.read();
      checkAbort(signal);
      if (next.done) break;
      if (next.value.byteLength > KNOWLEDGE_EXPORT_MAX_BYTES - offset || next.value.byteLength > metadata.bytes - offset) throw new Error("导出响应超过声明大小或64 MiB限制，未请求下载；请缩小范围或关闭历史修订。");
      bytes.set(next.value, offset); offset += next.value.byteLength;
    }
    if (offset !== metadata.bytes) throw new Error("导出响应不完整，未请求下载，请重试。");
    checkAbort(signal);
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    checkAbort(signal);
    const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
    if (hash !== metadata.sha256) throw new Error("导出文件摘要不一致，未请求下载，请重试。");
    return { bytes, metadata };
  } finally { signal.removeEventListener("abort", cancel); cancel(); reader.releaseLock(); }
}
