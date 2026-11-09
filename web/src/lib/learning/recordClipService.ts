import { randomBytes } from "node:crypto";
import nodeProcess from "node:process";
import { fetchRecordClipPublicHtml, RecordClipPublicHtmlError } from "../security/recordClipPublicHtml";
import { NodeTeachingError } from "./nodeTeaching";
import {
  buildRecordClipPreview, parseRecordClipRequest, parseRecordClipSourceInput, recordClipSnapshot,
  RECORD_CLIP_ENTRY_BYTES, RECORD_CLIP_RECEIPT_TTL_MS, RECORD_CLIP_STORE_BYTES, RECORD_CLIP_STORE_ENTRIES,
  type RecordClipPreview, type RecordClipSnapshot
} from "./recordClipContracts";

const storeKey = Symbol.for("englishnode.recordClipStore.v1");
type Entry = { preview: RecordClipPreview; expiresAt: number; bytes: number };
type Store = { entries: Map<string, Entry>; bytes: number };
const processState = nodeProcess as typeof nodeProcess & { [key: symbol]: unknown };
function store(): Store {
  if (!processState[storeKey]) processState[storeKey] = { entries: new Map(), bytes: 0 } satisfies Store;
  return processState[storeKey] as Store;
}
function remove(cache: Store, id: string) {
  const entry = cache.entries.get(id);
  if (entry) { cache.entries.delete(id); cache.bytes -= entry.bytes; }
}
function expire(cache: Store, now: number) {
  for (const [id, entry] of cache.entries) if (entry.expiresAt <= now) remove(cache, id);
}
function cancelled(signal?: AbortSignal) {
  if (signal?.aborted) throw new NodeTeachingError("剪藏预览已取消，原记录草稿保留。", 499);
}
function invalid(error: unknown): never {
  throw new NodeTeachingError(error instanceof Error ? error.message : "剪藏输入无效。");
}

export async function previewRecordClip(value: unknown, options: { signal?: AbortSignal } = {}) {
  let input: ReturnType<typeof parseRecordClipRequest>;
  try { input = parseRecordClipRequest(value); } catch (error) { invalid(error); }
  cancelled(options.signal);
  let capture;
  if (input.mode === "web") {
    try { capture = await fetchRecordClipPublicHtml(input.url, { signal: options.signal }); }
    catch (error) {
      if (error instanceof RecordClipPublicHtmlError) throw new NodeTeachingError(error.message, error.status);
      throw new NodeTeachingError("公开网页取得失败，请重试或明确选择本人提供文字。", 502);
    }
  }
  cancelled(options.signal);
  const issuedAt = Date.now(), receiptId = randomBytes(32).toString("base64url"), expiresAt = issuedAt + RECORD_CLIP_RECEIPT_TTL_MS;
  const preview = await buildRecordClipPreview({
    mode: input.mode, title: capture?.title || (input.mode === "pasted" ? input.title || "本人提供的文字" : "公开网页文字"),
    text: capture ? capture.text : input.mode === "pasted" ? input.text : "",
    requestedUrl: capture ? capture.requestedUrl : input.mode === "pasted" ? input.url || null : null,
    finalUrl: capture?.finalUrl || null,
    capturedAt: capture?.capturedAt || new Date(issuedAt).toISOString(),
    extractionVersion: input.mode === "web" ? "html-text-v1" : "pasted-text-v1",
    truncated: capture?.truncated || false,
    limitations: capture?.limitations || ["本人提供的文字，系统未从声明网址取得或核验正文。", "记录的是系统收到该文字的时间，不是网页取得时间；选文范围由本人提供。"],
    receiptId, expiresAt: new Date(expiresAt).toISOString()
  });
  cancelled(options.signal);
  const bytes = Buffer.byteLength(JSON.stringify(preview), "utf8");
  if (bytes > RECORD_CLIP_ENTRY_BYTES || bytes > RECORD_CLIP_STORE_BYTES) throw new NodeTeachingError("剪藏预览超过临时容量，请缩短本人提供的文字后重试。", 413);
  const cache = store(); expire(cache, Date.now());
  if (Date.now() >= expiresAt) throw new NodeTeachingError("剪藏预览已过期，请重新预览；原草稿保留。", 410);
  while (cache.entries.size >= RECORD_CLIP_STORE_ENTRIES || cache.bytes + bytes > RECORD_CLIP_STORE_BYTES) remove(cache, cache.entries.keys().next().value!);
  cache.entries.set(receiptId, { preview: structuredClone(preview), expiresAt, bytes }); cache.bytes += bytes;
  return { preview };
}

export function resolveRecordClipSource(value: unknown): RecordClipSnapshot {
  let input: ReturnType<typeof parseRecordClipSourceInput>;
  try { input = parseRecordClipSourceInput(value); } catch (error) { invalid(error); }
  const cache = store(); expire(cache, Date.now());
  const entry = cache.entries.get(input.receiptId);
  if (!entry) throw new NodeTeachingError("剪藏凭据已过期或不再可用，请重新预览；原草稿保留。", 410);
  if (entry.preview.snapshotKey !== input.snapshotKey) throw new NodeTeachingError("剪藏来源身份与凭据不一致，请回看所选预览。");
  try { return recordClipSnapshot(entry.preview, input.fragmentIds); } catch (error) { invalid(error); }
}
