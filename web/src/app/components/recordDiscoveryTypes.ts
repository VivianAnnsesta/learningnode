export type RecordSnapshot = {
  kind: "record";
  knowledgePointId: string;
  revisionId: string;
  title: string;
  body: string;
  sourceType: string;
};

export type RecordChoice = {
  id: string;
  title: string;
  body: string;
  kind: string;
  currentRevisionId: string | null;
  sourceType: string;
};

export const recordKindLabels: Record<string, string> = {
  note: "笔记", question: "疑问", understanding: "理解",
  example: "例子", experience: "经验", excerpt: "摘录"
};

export const relationKindLabels: Record<string, string> = {
  related: "相关", analogy: "类比", contrast: "对比", cause: "因果",
  derive: "推导", application: "应用", prerequisite: "前置", boundary: "边界"
};

export function isRecordSnapshot(value: unknown): value is RecordSnapshot {
  if (!value || typeof value !== "object") return false;
  const source = value as Record<string, unknown>;
  return source.kind === "record" && ["knowledgePointId", "revisionId", "title", "body", "sourceType"]
    .every(key => typeof source[key] === "string");
}

export function sameRecordSource(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  return JSON.stringify(left) === JSON.stringify(right);
}

export function recordSourceInputs(draftSources: unknown[], savedSources: unknown[]) {
  return draftSources.map(source => {
    const sourceIndex = savedSources.findIndex(saved => sameRecordSource(saved, source));
    if (sourceIndex >= 0) return { kind: "retained" as const, sourceIndex };
    if (isRecordSnapshot(source)) return { kind: "record" as const, knowledgePointId: source.knowledgePointId, revisionId: source.revisionId };
    throw new Error("原始来源已变化，请回看最新保存版本后合并引用。");
  });
}

export async function readRecordJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "无法读取个人记录，请重试。");
  return data as T;
}
