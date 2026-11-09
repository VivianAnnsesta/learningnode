export type TextareaPosition = { value: string; start: number; end: number };
export type TemplateInsertionPlan = { before: string; after: string; offset: number; caret: number; position: "caret" | "after_selection" | "end"; fallback: boolean };

export function textareaText(body: string) { return body.replace(/\r\n?/g, "\n"); }

function unicodeBoundary(text: string, offset: number) {
  const before = text.charCodeAt(offset - 1), after = text.charCodeAt(offset);
  return !(before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff);
}

function rawOffset(body: string, normalizedOffset: number) {
  let raw = 0, normalized = 0;
  while (normalized < normalizedOffset) {
    if (body[raw] === "\r" && body[raw + 1] === "\n") raw++;
    raw++; normalized++;
  }
  return raw;
}

export function planTemplateInsertion(body: string, text: string, selection: TextareaPosition | null): TemplateInsertionPlan {
  if (!text.trim() || text.length > 24000) throw new Error("模板预览为空或超过24000个字符，不能插入。");
  if (body.length + text.length > 24000) throw new Error("插入后正文超过24000个字符，请先精简正文或模板；内容不会被截断。");
  const normalized = textareaText(body);
  const valid = !!selection && selection.value === normalized && Number.isSafeInteger(selection.start) && Number.isSafeInteger(selection.end)
    && selection.start >= 0 && selection.end >= selection.start && selection.end <= normalized.length
    && unicodeBoundary(normalized, selection.start) && unicodeBoundary(normalized, selection.end);
  const offset = valid ? rawOffset(body, selection.end) : body.length;
  if (!unicodeBoundary(body, offset)) throw new Error("插入位置切断了完整字符，请重新定位正文光标。");
  const prefix = body.slice(0, offset) + text;
  return { before: body, after: prefix + body.slice(offset), offset, caret: textareaText(prefix).length,
    position: valid ? selection.start === selection.end ? "caret" : "after_selection" : "end", fallback: !!selection && !valid };
}

export type TemplateUndo = { baseKey: string; epoch: number; before: string; after: string; caret: number };
export function canUndoTemplateInsertion(undo: TemplateUndo | null, current: { baseKey: string; epoch: number; body: string }) {
  return !!undo && undo.baseKey === current.baseKey && undo.epoch === current.epoch && undo.after === current.body;
}

/** A combined insertion may undo only while its exact resulting sources are still current. */
export function canUndoRecordSourceInsertion(undo: (TemplateUndo & { sourcesAfter: unknown[] }) | null, current: { baseKey: string; epoch: number; body: string; sources: unknown[] }) {
  return !!undo && undo.sourcesAfter === current.sources && canUndoTemplateInsertion(undo, current);
}
