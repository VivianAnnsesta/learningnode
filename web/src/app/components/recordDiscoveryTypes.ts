import { isRecordReferenceSnapshot, paragraphSelectorInput, referenceParagraphs, type RecordReferenceSnapshot } from "../../lib/learning/recordReferences";
import { recordAliases } from "../../lib/learning/recordNames";
import type { AssignedRecordDate } from "../../lib/learning/recordDateContracts";

export type RecordSnapshot = RecordReferenceSnapshot;
export { recordReferenceKey, recordReferenceQuote } from "../../lib/learning/recordReferences";

export type RecordChoice = {
  id: string;
  title: string;
  body: string;
  kind: string;
  currentRevisionId: string | null;
  sourceType: string;
  aliases?: string[];
  matchedAliases?: string[];
  recordDate?: AssignedRecordDate | null;
  recordDateUnavailableReason?: string;
};

/** Form input is one display name per line; matching and normalization belong to the API. */
export function recordAliasesInput(text: string): string[] {
  const aliases = text.split(/\r\n|\r|\n/).map(alias => alias.trim()).filter(Boolean);
  recordAliases(aliases);
  return aliases;
}

export function recordAliasSummary(record: Pick<RecordChoice, "aliases" | "matchedAliases">): string | null {
  if (record.matchedAliases?.length) return `匹配别名：${record.matchedAliases.join("、")}`;
  return record.aliases?.length ? `别名：${record.aliases.join("、")}` : null;
}

export const recordKindLabels: Record<string, string> = {
  note: "笔记", question: "疑问", understanding: "理解",
  example: "例子", experience: "经验", excerpt: "摘录"
};

export const relationKindLabels: Record<string, string> = {
  related: "相关", analogy: "类比", contrast: "对比", cause: "因果",
  derive: "推导", application: "应用", prerequisite: "前置", boundary: "边界"
};

export const recordSourceLabels: Record<string, string> = {
  user: "本人记录", accepted_ai: "本人接受的 AI 内容", excerpt: "来源摘录", legacy_unknown: "历史来源未注明",
  legacy_user: "历史本人记录", legacy_ai_or_unknown: "历史 AI 或来源未明"
};

export function isRecordSnapshot(value: unknown): value is RecordSnapshot {
  return isRecordReferenceSnapshot(value);
}

export function recordReferenceLabel(source: RecordSnapshot): string {
  if (!source.selector) return "全文";
  const index = referenceParagraphs(source.body).findIndex(paragraph => paragraph.start === source.selector?.start && paragraph.end === source.selector?.end);
  return index >= 0 ? `第${index + 1}段` : "固定段落";
}

export function sameRecordSource(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  return JSON.stringify(left) === JSON.stringify(right);
}

export function recordSourceInputs(draftSources: unknown[], savedSources: unknown[]) {
  return draftSources.map(source => {
    const sourceIndex = savedSources.findIndex(saved => sameRecordSource(saved, source));
    if (sourceIndex >= 0) return { kind: "retained" as const, sourceIndex };
    if (isRecordSnapshot(source)) return {
      kind: "record" as const, knowledgePointId: source.knowledgePointId, revisionId: source.revisionId,
      ...(source.selector ? { selector: paragraphSelectorInput(source.selector) } : {})
    };
    throw new Error("原始来源已变化，请回看最新保存版本后合并引用。");
  });
}

export async function readRecordJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "无法读取个人记录，请重试。");
  return data as T;
}
