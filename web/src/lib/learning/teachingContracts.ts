import { NodeTeachingError, teachingObject, teachingText } from "./nodeTeaching";
import type { CourseContentQuestion, KnowledgeBoundary, ConceptLearningUnit } from "./roadmapPlanningTypes";
import { dimensions, type DimensionKey } from "./teachingDimensions";
import { parsePrerequisitePlan, parsePrerequisiteSupport } from "./teachingPrerequisites";
export { dimensions, type DimensionKey } from "./teachingDimensions";
export { NodeTeachingError, teachingObject, teachingText, parseTeachingBinding } from "./nodeTeaching";

export const segmentLabels = { encounter: "遇见问题", concept: "形成概念", use: "完成一次使用", discriminate: "辨别与选择", integrate: "回到完整问题" } as const;
export type SegmentKey = keyof typeof segmentLabels;
export const segmentKeys = Object.keys(segmentLabels) as SegmentKey[];
export type SourceFragment = { id: string; title: string; url: string; location: string; text: string; contentHash: string };
export type TeachingContextV2 = {
  knowledgeBoundary?: KnowledgeBoundary;
  relatedConcepts?: { key: string; nodeId: string; title: string; newKnowledge: string; purpose: string }[];
  contentQuestions?: CourseContentQuestion[];
  domain: Record<string, string>;
  node: { title: string; objective: string; keyQuestion: string; scope: string; aliases: string[]; problemRole: string; commonMistake: string; learningUnit?: ConceptLearningUnit };
  stage: { title: string; goal: string; moduleTitle: string; outcomes: string[]; contentRequirements?: string[]; problem: string; process: string[] };
  prerequisites: { nodeId: string; title: string; explanation: string; userUnderstanding: string | null;
    scope?: string; learningUnit?: ConceptLearningUnit;
    learningEvidence?: { sessionId: string | null; lessonVersion: number | null; status: string;
      steps: { segmentId: string; stepKey: string; summary: string; viewed: boolean }[]; skipped: string[]; unresolved: string[] } }[];
  sources: SourceFragment[]; warnings: string[];
};
export type TeachingFramework = {
  prerequisitePlan?: TeachingPrerequisite[];
  contentQuestions?: CourseContentQuestion[];
  schemaVersion: 2; concept: string; scope: string; definition: string; runningCase: string;
  prerequisites: string[]; limitations: string[];
  dimensions: { key: DimensionKey; points: string[]; segmentKeys: SegmentKey[] }[];
  segments: { key: SegmentKey; goal: string; dimensionKeys: DimensionKey[]; steps: { key: string; goal: string; contentAssignments?: {contentQuestionKey:string;dimensionKeys:DimensionKey[]}[] }[] }[];
};
export type TeachingPrerequisite = { key: string; knowledge: string; requiredFor: string; source: "foundation" | "node" | "step" | "inline"; sourceKey: string | null; useStepKeys: string[]; support: string };
export type TeachingPrerequisiteSupport = { prerequisiteKey: string; explanation: string };
export type TeachingActivity = { key: string; kind: "observe" | "predict" | "explain" | "discriminate" | "choose" | "transfer"; prompt: string; answer: string; criteria: string[]; hints: string[] };
export type TeachingMaterial = {
  key: SegmentKey; summary: string; limitations: string[];
  steps: { key: string; prerequisiteSupport?: TeachingPrerequisiteSupport[]; contentQuestionKeys?: string[]; dimensionKeys: DimensionKey[]; explanation: string; example: string; summary: string; terms: string[];
    basis: "source" | "derivation" | "analogy" | "unverified"; sourceIds: string[]; activities: TeachingActivity[] }[];
};
export type TeachingProgressV2 = {
  segmentKey: SegmentKey; stepKey: string; segmentId: string | null;
  returnPosition: { segmentId: string; stepKey: string; interactionId: string } | null;
  understandingDraft: string;
  drafts: Record<string, string>; support: Record<string, { hints: number; solution: boolean }>;
  skipped: string[]; visited: string[]; visitedSteps: string[]; unresolved: string[];
};
export const initialProgress = (): TeachingProgressV2 => ({ segmentKey: "encounter", stepKey: "", segmentId: null, returnPosition: null, understandingDraft: "", drafts: {}, support: {}, skipped: [], visited: [], visitedSteps: [], unresolved: [] });
export type TeachingAction = { type: "explain" | "example" | "contrast" | "boundary" | "prerequisite" | "continue"; dimensionKeys: DimensionKey[]; stepKey: string | null; nodeId: string | null; reason: string };
export type TeachingReplyV2 = { text: string; action: TeachingAction; observation: string; unresolved: string | null; verdict?: "correct" | "partial" | "needs_work" | "uncertain" };
export type InteractionV2 = { id: string; requestId: string; kind: string; input: string; exerciseKey: string; segmentId: string | null; segmentKey: string | null; stepKey: string | null; materialVersion: number | null; assistance: number; status: string; response: TeachingReplyV2 | null; error: string | null };
export type PublicActivity = Omit<TeachingActivity, "answer" | "criteria" | "hints"> & { hintCount: number; visibleHints: string[]; solution: string | null };
export type PublicMaterial = Omit<TeachingMaterial, "steps"> & { steps: (Omit<TeachingMaterial["steps"][number], "activities"> & { activities: PublicActivity[] })[] };
export type TeachingPreparationRequest = { concern: string; reprepare: boolean; sourceMaterialId?: string };
export type TeachingKnowledgeRequest = { requestId: string; concern: string; status: "pending" | "complete" | "failed" };
export type SegmentView = { id: string; requestId: string; key: SegmentKey; version: number; status: string; material: PublicMaterial | null; error: string | null; staleSources: boolean; sources: SourceFragment[]; request?: TeachingPreparationRequest; review: { findings: string[]; limitation: string } | null };
export type TeachingView = {
  id: string; revision: number; lessonVersion: number; status: string; stale: boolean; error: string | null;
  historical?: boolean;
  history?: {id:string;lessonVersion:number;status:string}[];
  context: TeachingContextV2; framework: TeachingFramework | null; segments: SegmentView[];
  progress: TeachingProgressV2; interactions: InteractionV2[];
  summary: TeachingSummary;
  knowledge?: { status: "unverified" | "checked" | "uncertain" | "checking" | "needs_correction"; uncertainCount: number; correctedFromVersion?: number; request?: TeachingKnowledgeRequest };
};
export type TeachingSummary = {
  taught: { segmentId: string; stepKey: string; summary: string; terms: string[] }[];
  observations: { interactionId: string; text: string }[];
  unresolved: { interactionId: string; text: string }[];
};
export const emptySummary = (): TeachingSummary => ({taught:[], observations:[], unresolved:[]});
export function list(value: unknown, label: string, max = 30): unknown[] {
  if (!Array.isArray(value) || value.length > max) throw new NodeTeachingError(`${label}格式或长度不合法。`);
  return value;
}
export function strings(value: unknown, label: string, max = 30): string[] { return list(value, label, max).map(x => teachingText(x, label, 4000)); }
export function safeKey(value: unknown): string {
  const key = teachingText(value, "标识", 100);
  if (!/^[a-zA-Z0-9_-]+$/.test(key) || key in Object.prototype) throw new NodeTeachingError("标识不合法。");
  return key;
}
/** Recognize a literal transport wrapper; all inner content still must pass
 * its normal validator. Never use this for learner requests or persistence. */
export function unwrapTeachingAiResponse(value: unknown): unknown {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const wrapped = value as Record<string,unknown>;
    if (wrapped.type === "json_object" && Object.keys(wrapped).length === 2 && "content" in wrapped
      && wrapped.content && typeof wrapped.content === "object" && !Array.isArray(wrapped.content)) return wrapped.content;
  }
  return value;
}
function members<T extends string>(value: unknown, allowed: readonly T[], label: string): T[] {
  const items = strings(value, label);
  if (items.some(key => !allowed.includes(key as T)) || new Set(items).size !== items.length) throw new NodeTeachingError(`${label}存在重复或未知引用；当前允许：${allowed.join("、") || "无"}。`);
  return items as T[];
}
const dimensionKeys = Object.keys(dimensions) as DimensionKey[];
export function validateFramework(value: unknown, contentQuestions?: CourseContentQuestion[], context?: TeachingContextV2): TeachingFramework {
  const data = teachingObject(unwrapTeachingAiResponse(value));
  const mapped = list(data.dimensions, "九维", 9).map(raw => {
    const d = teachingObject(raw); const key = teachingText(d.key, "维度") as DimensionKey;
    return { key, points: strings(d.points, "维度要点", 8), segmentKeys: members(d.segmentKeys, segmentKeys, "教学段落") };
  });
  if (mapped.length !== 9 || new Set(mapped.map(d => d.key)).size !== 9 || mapped.some(d => !dimensionKeys.includes(d.key) || !d.points.length || !d.segmentKeys.length)) throw new NodeTeachingError("框架必须完整安排九个维度。");
  const scoped = contentQuestions?.some(q => q.requirementIndices !== undefined);
  const seen = new Set<string>();
  const segments = list(data.segments, "五段教学", 5).map((raw, index) => {
    const s = teachingObject(raw);
    if (s.key !== segmentKeys[index]) throw new NodeTeachingError("框架需要按顺序安排五段教学。");
    const dims = members(s.dimensionKeys, dimensionKeys, "维度");
    const steps = list(s.steps, "教学步骤", 6).map(rawStep => {
      const step = teachingObject(rawStep); const key = safeKey(step.key);
      if (seen.has(key)) throw new NodeTeachingError("教学步骤标识重复。"); seen.add(key);
      const contentAssignments = scoped ? list(step.contentAssignments, "步骤内容分工", 100).map(rawAssignment => {
        const assignment = teachingObject(rawAssignment);
        const question = contentQuestions!.find(q => q.key === assignment.contentQuestionKey);
        if (!question) throw new NodeTeachingError("步骤引用了本节点未承担的内容问题。");
        const assigned = members(assignment.dimensionKeys, dimensionKeys, `步骤 ${key} 的问题 ${question.key} 维度`);
        if (!assigned.length || assigned.some(d => !dims.includes(d))) throw new NodeTeachingError(`步骤 ${key} 的分工维度必须属于本段；当前允许：${dims.join("、")}。`);
        // This is coverage metadata, not a limit on the nine-dimensional lesson.
        // Keep supplementary teaching intact; only the confirmed contribution counts.
        // Both the raw candidate and normalized result are retained by the AI log.
        return { contentQuestionKey: question.key, dimensionKeys: assigned.filter(d => question.dimensionKeys.includes(d)) };
      }) : undefined;
      if (contentAssignments && new Set(contentAssignments.map(a => a.contentQuestionKey)).size !== contentAssignments.length) throw new NodeTeachingError("同一步骤的内容问题分工不能重复。");
      return { key, goal: teachingText(step.goal, "本步目标", 1500), ...(contentAssignments ? {contentAssignments: contentAssignments.filter(a => a.dimensionKeys.length)} : {}) };
    });
    if (!steps.length) throw new NodeTeachingError("教学段落缺少步骤。");
    if (!dims.length || mapped.some(d => d.segmentKeys.includes(s.key as SegmentKey) !== dims.includes(d.key))) throw new NodeTeachingError("九维安排与段落引用不一致。");
    return { key: s.key as SegmentKey, goal: teachingText(s.goal, "段落目标", 1500), dimensionKeys: dims, steps };
  });
  if (segments.length !== 5) throw new NodeTeachingError("框架缺少教学段落。");
  if (scoped) for (const question of contentQuestions || []) {
    const assigned = segments.flatMap(s => s.steps.flatMap(step => step.contentAssignments || [])).filter(a => a.contentQuestionKey === question.key).flatMap(a => a.dimensionKeys);
    const missing = question.dimensionKeys.filter(d => !assigned.includes(d));
    if (missing.length) {
      const placements = missing.map(d => `${d} → ${segments.filter(s => s.dimensionKeys.includes(d)).map(s => s.key).join("、")}`);
      const message = `框架尚未安排本节点内容问题 ${question.key} 的维度：${missing.join("、")}。请在实际教授该内容的步骤 contentAssignments 中补充该问题及维度；可安排的段落：${placements.join("；")}。已安排：${[...new Set(assigned)].join("、") || "无"}。不能用其他维度替代。`;
      throw Object.assign(new NodeTeachingError(message), { issues: [{code:"missing_content_assignment",path:"segments.steps.contentAssignments",message,contentQuestionKey:question.key,missingDimensionKeys:missing}] });
    }
  }
  const prerequisitePlan = context || data.prerequisitePlan !== undefined ? parsePrerequisitePlan(data.prerequisitePlan, segments.flatMap(s => s.steps.map(step => step.key)), context) : undefined;
  return { schemaVersion: 2, ...(prerequisitePlan ? {prerequisitePlan} : {}), ...(contentQuestions?.length ? {contentQuestions} : {}), concept: teachingText(data.concept, "教学单元", 300), scope: teachingText(data.scope, "范围", 2000), definition: teachingText(data.definition, "核心解释", 3000), runningCase: teachingText(data.runningCase, "贯穿案例", 4000), prerequisites: strings(data.prerequisites, "前置"), limitations: strings(data.limitations, "局限"), dimensions: mapped, segments };
}
export function validateMaterial(value: unknown, framework: TeachingFramework, key: SegmentKey, sources: SourceFragment[]): TeachingMaterial {
  const data = teachingObject(unwrapTeachingAiResponse(value)); const planned = framework.segments.find(s => s.key === key)!;
  if (data.key !== key) throw new NodeTeachingError("返回了错误的教学段落。");
  const allowedStepKeys = planned.steps.map(step => step.key);
  const actualStepKeys = Array.isArray(data.steps) ? data.steps.map(step => String(teachingObject(step).key || "")) : [];
  if (!Array.isArray(data.steps) || JSON.stringify(actualStepKeys) !== JSON.stringify(allowedStepKeys)) {
    const message = `本段正文必须且只能包含 ${allowedStepKeys.length} 个步骤，按此顺序返回：${allowedStepKeys.join("、")}；不能新增、遗漏、重排或带入其他段步骤。实际收到：${actualStepKeys.join("、") || "无步骤数组"}。`;
    throw Object.assign(new NodeTeachingError(message), { issues: [{ code: "segment_step_mismatch", path: "steps", message, actualReferenceKeys: actualStepKeys, allowedReferenceKeys: allowedStepKeys }] });
  }
  const seenActivities = new Set<string>();
  const steps = list(data.steps, "正文步骤", 6).map((raw, i) => {
    const step = teachingObject(raw);
    if (step.key !== planned.steps[i]?.key) throw new NodeTeachingError("正文必须沿用框架步骤。");
    const dims = members(step.dimensionKeys, planned.dimensionKeys, "维度");
    // Supplementary explanation may reference a known question; it does not
    // replace that question's required dimension coverage below.
    const contentQuestionKeys=framework.contentQuestions?.length ? members(step.contentQuestionKeys || [],framework.contentQuestions.map(q=>q.key),"内容问题引用") : [];
    const sourceIds = members(step.sourceIds, sources.map(s => s.id), "来源片段");
    if (!["source", "derivation", "analogy", "unverified"].includes(String(step.basis)) || (step.basis === "source" && !sourceIds.length)) throw new NodeTeachingError("依据类型或资料引用无效。");
    const activities = list(step.activities, "思考任务", 3).map(rawActivity => {
      const a = teachingObject(rawActivity); const activityKey = safeKey(a.key);
      if (activityKey === "question" || seenActivities.has(activityKey)) throw new NodeTeachingError("思考任务标识重复或使用保留名称。"); seenActivities.add(activityKey);
      if (!Array.isArray(a.criteria) || !a.criteria.length || !Array.isArray(a.hints) || !a.hints.length) throw new NodeTeachingError("思考任务缺少回应依据或补充解释提示。");
      if (!["observe", "predict", "explain", "discriminate", "choose", "transfer"].includes(String(a.kind))) throw new NodeTeachingError("思考任务类型无效。");
      return { key: activityKey, kind: a.kind as TeachingActivity["kind"], prompt: teachingText(a.prompt, "思考任务"), answer: teachingText(a.answer, "参考解答"), criteria: strings(a.criteria, "回应依据", 8), hints: strings(a.hints, "提示", 4) };
    });
    const prerequisiteSupport = framework.prerequisitePlan ? parsePrerequisiteSupport(step.prerequisiteSupport ?? [], String(step.key), framework.prerequisitePlan) : undefined;
    return { key: step.key as string, ...(prerequisiteSupport ? {prerequisiteSupport} : {}), ...(framework.contentQuestions?.length ? {contentQuestionKeys} : {}), dimensionKeys: dims, summary:teachingText(step.summary,"本步结论",800),terms:strings(step.terms,"本步术语",8), explanation: teachingText(step.explanation, "讲解", 10000), example: teachingText(step.example, "示范", 8000, true), basis: step.basis as TeachingMaterial["steps"][number]["basis"], sourceIds, activities };
  });
  const missingDimensions = planned.dimensionKeys.filter(d => !steps.some(s => s.dimensionKeys.includes(d)));
  if (missingDimensions.length) {
    const message = `段落 ${key} 的正文缺少教学维度：${missingDimensions.join("、")}。请在实际讲解这些内容的现有步骤 dimensionKeys 中标注并补足讲解；本段步骤：${allowedStepKeys.join("、")}。段落教学维度独立于内容问题分工，不能只保留 contentAssignments 中的维度，也不能新增步骤。`;
    throw Object.assign(new NodeTeachingError(message), {issues:[{code:"missing_segment_dimensions",path:"steps.dimensionKeys",message,missingDimensionKeys:missingDimensions,allowedReferenceKeys:allowedStepKeys}]});
  }
  if (framework.contentQuestions?.some(q => q.requirementIndices !== undefined)) {
    for (const [index, step] of planned.steps.entries()) for (const assignment of step.contentAssignments || []) {
      if (!steps[index].contentQuestionKeys?.includes(assignment.contentQuestionKey) || assignment.dimensionKeys.some(d => !steps[index].dimensionKeys.includes(d))) throw new NodeTeachingError(`正文步骤 ${step.key} 尚未覆盖其安排的内容问题 ${assignment.contentQuestionKey} 与维度。`);
    }
  } else for(const q of framework.contentQuestions || []) {
    const required=q.dimensionKeys.filter(d=>planned.dimensionKeys.includes(d));
    if(required.some(d=>!steps.some(s=>s.contentQuestionKeys?.includes(q.key)&&s.dimensionKeys.includes(d)))) throw new NodeTeachingError(`正文需要将内容问题 ${q.key} 定位到相应维度的具体讲解步骤。`);
  }
  if (!steps.some(s => s.activities.length)) throw new NodeTeachingError("每段须准备至少一个可跳过的思考任务。");
  if (key === "use" && !steps.some(s => s.example)) throw new NodeTeachingError("使用段落需要完整的示范过程。");
  return { key, summary: teachingText(data.summary, "教学摘要", 2500), limitations: strings(data.limitations, "局限"), steps };
}
export const activityBinding = (segmentId: string, stepKey: string, activityKey: string) => `${segmentId}:${stepKey}:${activityKey}`;
export function publicMaterial(material: TeachingMaterial, id: string, progress: TeachingProgressV2): PublicMaterial {
  return { ...material, steps: material.steps.map(step => ({ ...step, activities: step.activities.map(a => {
    const support = progress.support[activityBinding(id, step.key, a.key)];
    return { key: a.key, kind: a.kind, prompt: a.prompt, hintCount: a.hints.length, visibleHints: a.hints.slice(0, support?.hints || 0), solution: support?.solution ? a.answer : null };
  }) })) };
}
export function validateReply(value: unknown, framework: TeachingFramework, context: TeachingContextV2, answering: boolean): TeachingReplyV2 {
  const d = teachingObject(unwrapTeachingAiResponse(value)); const a = teachingObject(d.action);
  if (!["explain", "example", "contrast", "boundary", "prerequisite", "continue"].includes(String(a.type))) throw new NodeTeachingError("教学动作无效。");
  const stepKey = a.stepKey ? safeKey(a.stepKey) : null;
  const nodeId = typeof a.nodeId === "string" && a.nodeId ? a.nodeId : null;
  if (stepKey && !framework.segments.some(s => s.steps.some(step => step.key === stepKey))) throw new NodeTeachingError("动作引用未知步骤。");
  if (nodeId && !context.prerequisites.some(p => p.nodeId === nodeId)) throw new NodeTeachingError("动作引用未知前置概念。");
  if (answering && !["correct", "partial", "needs_work", "uncertain"].includes(String(d.verdict))) throw new NodeTeachingError("缺少有效反馈判断。");
  return { text: teachingText(d.text, "反馈", 10000), observation: teachingText(d.observation, "本次观察", 1500, true), unresolved: d.unresolved ? teachingText(d.unresolved, "待解疑问", 1500) : null,
    ...(answering ? { verdict: d.verdict as TeachingReplyV2["verdict"] } : {}), action: { type: a.type as TeachingAction["type"], stepKey, nodeId, dimensionKeys: members(a.dimensionKeys, dimensionKeys, "动作维度"), reason: teachingText(a.reason, "动作理由", 1500) } };
}
