import { referenceParagraphs } from "./recordReferences";

export const RECORD_CLIP_TEXT_LIMIT = 32000;
export const RECORD_CLIP_FRAGMENT_LIMIT = 160;
export const RECORD_CLIP_FRAGMENT_CHARS = 1800;
export const RECORD_CLIP_RECEIPT_TTL_MS = 15 * 60 * 1000;
export const RECORD_CLIP_ENTRY_BYTES = 256 * 1024;
export const RECORD_CLIP_STORE_ENTRIES = 64;
export const RECORD_CLIP_STORE_BYTES = 16 * 1024 * 1024;

export type RecordClipRequest = { mode: "web"; url: string } | { mode: "pasted"; text: string; title?: string; url?: string };
export type RecordClipFragment = { id: string; start: number; end: number; text: string; textHash: string; location: string };
export type RecordClipMetadata = {
  schemaVersion: 1; snapshotKey: string; mode: "web" | "pasted"; obtained: boolean;
  title: string; requestedUrl: string | null; finalUrl: string | null; capturedAt: string;
  contentHash: string; textLength: number; extractionVersion: "html-text-v1" | "pasted-text-v1";
  truncated: boolean; limitations: string[];
};
export type RecordClipPreview = RecordClipMetadata & { receiptId: string; expiresAt: string; text: string; fragments: RecordClipFragment[] };
export type RecordClipSourceInput = { kind: "clip"; snapshotKey: string; receiptId: string; fragmentIds: string[] };
export type RecordClipSnapshot = RecordClipMetadata & { kind: "clip"; fragments: RecordClipFragment[] };
export type RecordClipDraftSource = { kind: "clip-draft"; preview: RecordClipPreview; fragmentIds: string[] };

const hashPattern = /^[0-9a-f]{64}$/;
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v));
const ownKeys = (v: Record<string, unknown>, keys: string[]) => Object.keys(v).every(key => keys.includes(key));
const isoDate = (v: unknown): v is string => typeof v === "string" && Number.isFinite(Date.parse(v)) && new Date(v).toISOString() === v;
const receipt = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{20,160}$/.test(v);

export function parseRecordClipUrl(value: unknown): string {
  if (typeof value !== "string" || !value || value.length > 2000 || value !== value.trim() || /[\u0000-\u0020\u007f-\u009f]/u.test(value)) throw new Error("剪藏网址需为不含空白或凭据的HTTPS地址。");
  let url: URL;
  try { url = new URL(value); } catch { throw new Error("剪藏网址需为有效HTTPS地址。"); }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password) throw new Error("剪藏只接受不含凭据的HTTPS地址。");
  return url.href;
}

export function parseRecordClipRequest(value: unknown): RecordClipRequest {
  if (!object(value)) throw new Error("请提供剪藏读取方式。");
  if (value.mode === "web") {
    if (!ownKeys(value, ["mode", "url"])) throw new Error("网页剪藏只接受网址。");
    return { mode: "web", url: parseRecordClipUrl(value.url) };
  }
  if (value.mode !== "pasted" || !ownKeys(value, ["mode", "text", "title", "url"])) throw new Error("剪藏读取方式无效。");
  if (typeof value.text !== "string" || !value.text.trim() || value.text.length > RECORD_CLIP_TEXT_LIMIT) throw new Error(`本人提供的文字需为1至${RECORD_CLIP_TEXT_LIMIT}个字符。`);
  let title: string | undefined;
  if (value.title !== undefined) {
    if (typeof value.title !== "string" || !value.title.trim() || value.title.trim().length > 500 || /\p{Cc}/u.test(value.title)) throw new Error("剪藏标题需为1至500个字符且不含控制字符。");
    title = value.title.trim();
  }
  return { mode: "pasted", text: value.text, ...(title ? { title } : {}), ...(value.url === undefined ? {} : { url: parseRecordClipUrl(value.url) }) };
}

export function parseRecordClipSourceInput(value: unknown): RecordClipSourceInput {
  if (!object(value) || value.kind !== "clip" || !ownKeys(value, ["kind", "snapshotKey", "receiptId", "fragmentIds"]) || typeof value.snapshotKey !== "string" || !hashPattern.test(value.snapshotKey) || !receipt(value.receiptId)) throw new Error("剪藏来源身份无效，请重新预览。");
  if (!Array.isArray(value.fragmentIds) || !value.fragmentIds.length || value.fragmentIds.length > RECORD_CLIP_FRAGMENT_LIMIT || value.fragmentIds.some(id => typeof id !== "string" || !/^clip-fragment-[0-9]+-[0-9]+-[0-9a-f]{64}$/.test(id)) || new Set(value.fragmentIds).size !== value.fragmentIds.length) throw new Error("请选择有效且不重复的剪藏片段。");
  return { kind: "clip", snapshotKey: value.snapshotKey, receiptId: value.receiptId, fragmentIds: [...value.fragmentIds] as string[] };
}

async function fingerprint(value: string) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
}

export async function buildRecordClipPreview(input: Omit<RecordClipMetadata, "schemaVersion" | "snapshotKey" | "obtained" | "contentHash" | "textLength"> & { text: string; receiptId: string; expiresAt: string }): Promise<RecordClipPreview> {
  if (!input.text.trim() || input.text.length > RECORD_CLIP_TEXT_LIMIT || !receipt(input.receiptId) || !isoDate(input.capturedAt) || !isoDate(input.expiresAt) || Date.parse(input.expiresAt) <= Date.parse(input.capturedAt)) throw new Error("剪藏预览内容或时间无效。");
  const fragments: RecordClipFragment[] = [];
  let fragmentTruncated = false;
  for (const paragraph of referenceParagraphs(input.text)) {
    for (let start = paragraph.start; start < paragraph.end;) {
      if (fragments.length === RECORD_CLIP_FRAGMENT_LIMIT) { fragmentTruncated = true; break; }
      let end = Math.min(start + RECORD_CLIP_FRAGMENT_CHARS, paragraph.end);
      const left = input.text.charCodeAt(end - 1), right = input.text.charCodeAt(end);
      if (left >= 0xd800 && left <= 0xdbff && right >= 0xdc00 && right <= 0xdfff) end--;
      const text = input.text.slice(start, end), textHash = await fingerprint(text);
      fragments.push({ id: `clip-fragment-${start}-${end}-${textHash}`, start, end, text, textHash, location: `${input.mode === "web" ? "提取文字" : "本人提供文字"}片段 ${fragments.length + 1}` });
      start = end;
    }
    if (fragmentTruncated) break;
  }
  if (!fragments.length) throw new Error("没有可选择的剪藏文字。");
  const metadata = {
    schemaVersion: 1 as const, mode: input.mode, obtained: input.mode === "web", title: input.title,
    requestedUrl: input.requestedUrl, finalUrl: input.finalUrl, capturedAt: input.capturedAt,
    contentHash: await fingerprint(input.text), textLength: input.text.length, extractionVersion: input.extractionVersion,
    truncated: input.truncated || fragmentTruncated,
    limitations: [...input.limitations, ...(fragmentTruncated ? ["可选片段达到上限，后续文字未列入选择。"] : [])]
  };
  const snapshotKey = await fingerprint(JSON.stringify({ ...metadata, fragments }));
  const preview: RecordClipPreview = { ...metadata, snapshotKey, receiptId: input.receiptId, expiresAt: input.expiresAt, text: input.text, fragments };
  if (!isRecordClipPreview(preview)) throw new Error("剪藏预览元数据无效。");
  return preview;
}

function metadataShape(v: Record<string, unknown>) {
  if (v.schemaVersion !== 1 || typeof v.snapshotKey !== "string" || !hashPattern.test(v.snapshotKey) || (v.mode !== "web" && v.mode !== "pasted") || v.obtained !== (v.mode === "web") || typeof v.title !== "string" || !v.title.trim() || v.title.length > 500 || !isoDate(v.capturedAt) || typeof v.contentHash !== "string" || !hashPattern.test(v.contentHash) || !Number.isSafeInteger(v.textLength) || (v.textLength as number) < 1 || (v.textLength as number) > RECORD_CLIP_TEXT_LIMIT || v.extractionVersion !== (v.mode === "web" ? "html-text-v1" : "pasted-text-v1") || typeof v.truncated !== "boolean" || !Array.isArray(v.limitations) || v.limitations.length > 10 || v.limitations.some(s => typeof s !== "string" || !s || s.length > 1500)) return false;
  try {
    if (v.requestedUrl !== null) parseRecordClipUrl(v.requestedUrl);
    if (v.mode === "web") { parseRecordClipUrl(v.finalUrl); if (v.requestedUrl === null) return false; }
    else if (v.finalUrl !== null) return false;
  } catch { return false; }
  return true;
}

function fragmentsShape(value: unknown, textLength: number): value is RecordClipFragment[] {
  if (!Array.isArray(value) || !value.length || value.length > RECORD_CLIP_FRAGMENT_LIMIT) return false;
  let previousEnd = -1;
  const ids = new Set<string>();
  return value.every(fragment => {
    if (!object(fragment) || typeof fragment.id !== "string" || typeof fragment.textHash !== "string" || !hashPattern.test(fragment.textHash) || !Number.isSafeInteger(fragment.start) || !Number.isSafeInteger(fragment.end) || (fragment.start as number) < previousEnd || (fragment.start as number) < 0 || (fragment.end as number) <= (fragment.start as number) || (fragment.end as number) > textLength || typeof fragment.text !== "string" || fragment.text.length !== (fragment.end as number) - (fragment.start as number) || fragment.text.length > RECORD_CLIP_FRAGMENT_CHARS || fragment.id !== `clip-fragment-${fragment.start}-${fragment.end}-${fragment.textHash}` || typeof fragment.location !== "string" || !fragment.location || fragment.location.length > 200 || ids.has(fragment.id)) return false;
    previousEnd = fragment.end as number; ids.add(fragment.id); return true;
  });
}

export function isRecordClipPreview(value: unknown): value is RecordClipPreview {
  return object(value) && metadataShape(value) && receipt(value.receiptId) && isoDate(value.expiresAt) && Date.parse(value.expiresAt) > Date.parse(value.capturedAt as string) && typeof value.text === "string" && value.text.length === value.textLength && fragmentsShape(value.fragments, value.textLength as number) && value.fragments.every(fragment => value.text === undefined || (value.text as string).slice(fragment.start, fragment.end) === fragment.text);
}
export function isRecordClipSnapshot(value: unknown): value is RecordClipSnapshot {
  return object(value) && value.kind === "clip" && metadataShape(value) && fragmentsShape(value.fragments, value.textLength as number) && !Object.prototype.hasOwnProperty.call(value, "receiptId");
}

export function selectedRecordClipFragments(preview: RecordClipPreview, fragmentIds: string[]) {
  const input = parseRecordClipSourceInput({ kind: "clip", snapshotKey: preview.snapshotKey, receiptId: preview.receiptId, fragmentIds });
  const selected = preview.fragments.filter(fragment => input.fragmentIds.includes(fragment.id));
  if (selected.length !== input.fragmentIds.length || selected.some((fragment, index) => fragment.id !== input.fragmentIds[index])) throw new Error("剪藏片段不属于该预览或顺序已变化，请重新选择。");
  return selected;
}
export function recordClipSelectedText(preview: RecordClipPreview, fragmentIds: string[]) {
  const selected = selectedRecordClipFragments(preview, fragmentIds);
  return selected.map((fragment, index) => {
    if (!index) return fragment.text;
    const gap = preview.text.slice(selected[index - 1].end, fragment.start);
    return (!gap.trim() ? gap : "\n\n[…未选取的原文…]\n\n") + fragment.text;
  }).join("");
}
export function recordClipSourceInput(source: RecordClipDraftSource): RecordClipSourceInput {
  return parseRecordClipSourceInput({ kind: "clip", snapshotKey: source.preview.snapshotKey, receiptId: source.preview.receiptId, fragmentIds: source.fragmentIds });
}
export function makeRecordClipDraftSource(preview: RecordClipPreview, fragmentIds: string[]): RecordClipDraftSource {
  if (!isRecordClipPreview(preview)) throw new Error("剪藏预览不可读取，请重新预览。");
  selectedRecordClipFragments(preview, fragmentIds);
  return { kind: "clip-draft", preview, fragmentIds: [...fragmentIds] };
}
export function isRecordClipDraftSource(value: unknown): value is RecordClipDraftSource {
  if (!object(value) || value.kind !== "clip-draft" || !isRecordClipPreview(value.preview) || !Array.isArray(value.fragmentIds)) return false;
  try { selectedRecordClipFragments(value.preview, value.fragmentIds); return true; } catch { return false; }
}
export function recordClipSourceKey(source: RecordClipDraftSource | RecordClipSnapshot) {
  return JSON.stringify([source.kind === "clip-draft" ? source.preview.snapshotKey : source.snapshotKey, source.kind === "clip-draft" ? source.fragmentIds : source.fragments.map(f => f.id)]);
}
export function recordClipSnapshot(preview: RecordClipPreview, fragmentIds: string[]): RecordClipSnapshot {
  const { receiptId: _receiptId, expiresAt: _expiresAt, text: _text, fragments: _fragments, ...metadata } = preview;
  void _receiptId; void _expiresAt; void _text; void _fragments;
  return { ...metadata, kind: "clip", fragments: selectedRecordClipFragments(preview, fragmentIds).map(f => ({ ...f })), limitations: [...metadata.limitations] };
}
