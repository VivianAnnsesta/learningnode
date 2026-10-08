import { dimensions, segmentKeys, validateFramework, type TeachingContextV2, type TeachingFramework, type TeachingMaterial } from "../learning/teachingContracts";
import { frameworkKnowledgeTargets, validateKnowledgeReview } from "./teachingKnowledgeReview";

export const knowledgeContextFixture: TeachingContextV2 = {
  domain: { name: "微积分", goal: "理解函数" }, node: { title: "函数", objective: "理解定义域", keyQuestion: "如何判断两个函数是否相同", scope: "一元实函数", aliases: [], problemRole: "确定对象", commonMistake: "只比较式子" },
  stage: { title: "函数基础", goal: "确定对象", moduleTitle: "函数", outcomes: [], problem: "比较函数", process: [] }, prerequisites: [], sources: [], warnings: []
};
export const falseFunctionGoal = "比较 f(x)=1/(x-2) 与 g(x)=(x-2)/(x-2)^2：定义域不同，因此不是同一个函数。";
export const correctFunctionGoal = "比较 f(x)=1/(x-2) 与 g(x)=(x-2)/(x-2)^2：定义域都是 x≠2，且各点取值相同，因此是同一个函数。";
export const badKnowledgeFramework = validateFramework({ concept: "函数", scope: "一元实函数", definition: "定义域中的每个实数输入唯一对应一个实数输出。", runningCase: "f(x)=1/(x-2)，自然实数定义域为 x≠2。", prerequisites: ["高中代数"], limitations: [],
  dimensions: Object.keys(dimensions).map(key => ({ key, points: ["安排本概念讲解。"], segmentKeys: key === "definition" ? segmentKeys : ["concept"] })),
  segments: segmentKeys.map(key => ({ key, goal: "安排本段教学。", dimensionKeys: key === "concept" ? Object.keys(dimensions) : ["definition"], steps: [{ key: `${key}-step`, goal: key === "discriminate" ? falseFunctionGoal : "讲解并示范。" }] })) });
export const correctedKnowledgeFramework: TeachingFramework = { ...structuredClone(badKnowledgeFramework), segments: badKnowledgeFramework.segments.map(s => s.key === "discriminate" ? { ...s, steps: [{ key: "discriminate-step", goal: correctFunctionGoal }] } : structuredClone(s)) };
export const correctKnowledgeMaterial: TeachingMaterial = { key: "encounter", summary: "先判断定义域和对应法则。", limitations: [], steps: [{ key: "encounter-step", dimensionKeys: ["definition"], contentQuestionKeys: [], explanation: "两个分母都仅在 x=2 为零，定义域相同；x≠2时约分后表达式相同，二者是同一个函数。", example: "x=3 时二者都为1；这是例子，结论还须对整个定义域判断。", summary: "这两个函数相同。", terms: ["定义域"], basis: "derivation", sourceIds: [], activities: [{ key: "compare-functions", kind: "explain", prompt: "如何判断这两个函数是否相同？", answer: correctFunctionGoal, criteria: ["检查定义域与对应规则"], hints: ["从原表达式的分母开始"] }] }] };

export function knowledgeResult(framework: TeachingFramework, context = knowledgeContextFixture, errors: string[] = [], extras: { key: string; content: unknown }[] = []) {
  const firstText = (v: unknown): string => typeof v === "string" ? v : Array.isArray(v) ? firstText(v[0]) : firstText(Object.values(v as object).find(x => typeof x === "string") || Object.values(v as object)[0]);
  const targets = [...frameworkKnowledgeTargets(framework), ...extras];
  return validateKnowledgeReview({ knowledgeVersion: 1, summary: errors.length ? "发现明确的函数比较错误。" : "未发现知识错误。", limitation: "模型推导不是权威认证。", checks: targets.map(t => ({ targetKey: t.key, claimExcerpt: t.key === "plan_discriminate" ? framework.segments[3].steps[0].goal : firstText(t.content),
    reasoning: errors.includes(t.key) ? "两个自然实数定义域都排除2，在所有允许输入上约分后取值相同，所以是同一个函数。" : "依据输入唯一对应输出及原式定义域逐项核对，本目标未发现明确错误。", verdict: errors.includes(t.key) ? "error" : "supported", basis: "derivation", correction: errors.includes(t.key) ? correctFunctionGoal : "", impact: errors.includes(t.key) ? "会教错函数相等的核心判定。" : "", sourceEvidence: [] })) }, framework, context, extras);
}
