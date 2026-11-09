export type ParagraphSelector = {
  type: "paragraph-v1";
  start: number;
  end: number;
  quoteHash: string;
};

export type ParagraphSnapshotSelector = ParagraphSelector & { quote: string };

export type RecordReferenceSnapshot = {
  kind: "record";
  knowledgePointId: string;
  revisionId: string;
  title: string;
  body: string;
  sourceType: string;
  selector?: ParagraphSnapshotSelector;
};

export type ReferenceParagraph = { start: number; end: number; quote: string };

/** Offsets always refer to the unchanged source string, including its line endings. */
export function referenceParagraphs(body: string): ReferenceParagraph[] {
  const paragraphs: ReferenceParagraph[] = [];
  let cursor = 0, start: number | null = null, lastTextEnd = 0;
  while (cursor < body.length) {
    let end = cursor;
    while (end < body.length && body[end] !== "\r" && body[end] !== "\n") end++;
    if (body.slice(cursor, end).trim()) {
      if (start === null) start = cursor;
      lastTextEnd = end;
    } else if (start !== null) {
      paragraphs.push({ start, end: lastTextEnd, quote: body.slice(start, lastTextEnd) });
      start = null;
    }
    cursor = end + (body[end] === "\r" && body[end + 1] === "\n" ? 2 : 1);
  }
  if (start !== null) paragraphs.push({ start, end: lastTextEnd, quote: body.slice(start, lastTextEnd) });
  return paragraphs;
}

function splitsSurrogate(body: string, offset: number) {
  const left = body.charCodeAt(offset - 1), right = body.charCodeAt(offset);
  return left >= 0xd800 && left <= 0xdbff && right >= 0xdc00 && right <= 0xdfff;
}

function paragraphAt(body: string, start: number, end: number): ReferenceParagraph {
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > body.length)
    throw new Error("段落引用范围无效。");
  if (splitsSurrogate(body, start) || splitsSurrogate(body, end)) throw new Error("段落引用不能切开 Unicode 字符。");
  const paragraph = referenceParagraphs(body).find(part => part.start === start && part.end === end);
  if (!paragraph) throw new Error("请选择指定修订中的一个完整段落。");
  return paragraph;
}

async function quoteHash(quote: string): Promise<string> {
  const bytes = new TextEncoder().encode(quote);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function paragraphSelector(body: string, start: number, end: number): Promise<ParagraphSelector> {
  const paragraph = paragraphAt(body, start, end);
  return { type: "paragraph-v1", start, end, quoteHash: await quoteHash(paragraph.quote) };
}

function selectorShape(value: unknown): value is ParagraphSelector {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const selector = value as Record<string, unknown>;
  return selector.type === "paragraph-v1" && typeof selector.start === "number" && Number.isSafeInteger(selector.start) && selector.start >= 0 &&
    typeof selector.end === "number" && Number.isSafeInteger(selector.end) && selector.end > selector.start &&
    typeof selector.quoteHash === "string" && selector.quoteHash.length === 64 && /^[0-9a-f]{64}$/.test(selector.quoteHash);
}

/** Client-supplied quote/title/body never replace text from the selected revision. */
export async function verifyParagraphSelector(body: string, value: unknown): Promise<ParagraphSnapshotSelector> {
  if (!selectorShape(value)) throw new Error("段落选择器类型或字段无效。");
  const paragraph = paragraphAt(body, value.start, value.end);
  if (await quoteHash(paragraph.quote) !== value.quoteHash) throw new Error("段落原文校验不匹配，请重新选择指定修订。");
  return { ...paragraphSelectorInput(value), quote: paragraph.quote };
}

export function paragraphSelectorInput(selector: ParagraphSelector): ParagraphSelector {
  return { type: selector.type, start: selector.start, end: selector.end, quoteHash: selector.quoteHash };
}

export function isRecordReferenceSnapshot(value: unknown): value is RecordReferenceSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const source = value as Record<string, unknown>;
  if (source.kind !== "record" || !["knowledgePointId", "revisionId", "title", "body", "sourceType"].every(key => typeof source[key] === "string")) return false;
  if (source.selector === undefined) return true;
  return selectorShape(source.selector) && typeof (source.selector as ParagraphSnapshotSelector).quote === "string";
}

export function recordReferenceKey(source: { knowledgePointId: string; revisionId: string; selector?: ParagraphSelector }): string {
  const selection = source.selector;
  return JSON.stringify([source.knowledgePointId, source.revisionId, selection?.type ?? "whole", selection?.start ?? null, selection?.end ?? null, selection?.quoteHash ?? null]);
}

export function recordReferenceQuote(source: Pick<RecordReferenceSnapshot, "body" | "selector">): string {
  return source.selector ? source.selector.quote : source.body;
}
