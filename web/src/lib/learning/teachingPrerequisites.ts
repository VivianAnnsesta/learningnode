import { NodeTeachingError, teachingObject, teachingText } from "./nodeTeaching";
import type { TeachingContextV2, TeachingPrerequisite, TeachingPrerequisiteSupport } from "./teachingContracts";

const key = (value: unknown) => {
  const result = teachingText(value, "前置承接标识", 100);
  if (!/^[a-zA-Z0-9_-]+$/.test(result) || result in Object.prototype) throw new NodeTeachingError("前置承接标识不合法。");
  return result;
};
const entries = (value: unknown, label: string): unknown[] => {
  if (!Array.isArray(value) || value.length > 40) throw new NodeTeachingError(`${label}需要数组（最多40项）；无必要前置时返回空数组。`);
  return value;
};

/** Locations are checked deterministically; sufficiency of the referenced
 * teaching is separately reviewed against its actual tasks and material. */
export function parsePrerequisitePlan(value: unknown, stepKeys: string[], context?: TeachingContextV2): TeachingPrerequisite[] {
  const seen = new Set<string>();
  return entries(value, "prerequisitePlan 前置承接计划").map(raw => {
    const item = teachingObject(raw); const id = key(item.key);
    if (seen.has(id)) throw new NodeTeachingError(`前置承接标识 ${id} 重复。`);
    seen.add(id);
    const source = item.source as TeachingPrerequisite["source"];
    if (!["foundation", "node", "step", "inline"].includes(source)) throw new NodeTeachingError(`前置 ${id} 的承接类型无效。`);
    const useStepKeys = entries(item.useStepKeys, "前置使用步骤").map(key);
    if (!useStepKeys.length || new Set(useStepKeys).size !== useStepKeys.length || useStepKeys.some(k => !stepKeys.includes(k))) {
      throw new NodeTeachingError(`前置 ${id} 必须引用本框架中真实且不重复的使用步骤；允许：${stepKeys.join("、")}。`);
    }
    const sourceKey = source === "inline" ? null : teachingText(item.sourceKey, "前置来源标识", 4000);
    if (source === "inline" && item.sourceKey != null) throw new NodeTeachingError(`当前步骤补讲 ${id} 的 sourceKey 必须为 null。`);
    if (source === "step" && (!stepKeys.includes(sourceKey!) || useStepKeys.some(k => stepKeys.indexOf(sourceKey!) >= stepKeys.indexOf(k)))) {
      throw new NodeTeachingError(`前置 ${id} 的先讲步骤必须存在且早于每个使用步骤；同一步先讲再用请使用 inline。`);
    }
    if (context && source === "node" && !context.prerequisites.some(p => p.nodeId === sourceKey)) {
      throw new NodeTeachingError(`前置 ${id} 只能引用已确认的显式前置节点；允许：${context.prerequisites.map(p => p.nodeId).join("、") || "无"}。`);
    }
    const foundations = context?.knowledgeBoundary?.assumedKnowledge ?? context?.node.learningUnit?.assumedKnowledge ?? [];
    if (context && source === "foundation" && !foundations.includes(sourceKey!)) {
      throw new NodeTeachingError(`前置 ${id} 不属于已提供的默认基础。sourceKey 须引用清单原文；必要的新知识需安排讲解，不能冒充基础。允许：${foundations.join("；") || "无"}。`);
    }
    return { key: id, knowledge: teachingText(item.knowledge, "所需知识", 1500), requiredFor: teachingText(item.requiredFor, "使用目的", 1500),
      source, sourceKey, useStepKeys, support: teachingText(item.support, "承接说明", 2500) };
  });
}

export function parsePrerequisiteSupport(value: unknown, stepKey: string, plan: TeachingPrerequisite[]): TeachingPrerequisiteSupport[] {
  const needed = plan.filter(p => p.useStepKeys.includes(stepKey));
  const support = entries(value, `步骤 ${stepKey} 的 prerequisiteSupport`).map(raw => {
    const item = teachingObject(raw); const prerequisiteKey = key(item.prerequisiteKey);
    if (!needed.some(p => p.key === prerequisiteKey)) throw new NodeTeachingError(`步骤 ${stepKey} 引用了未安排在本步使用的前置 ${prerequisiteKey}。`);
    return { prerequisiteKey, explanation: teachingText(item.explanation, "使用前的具体说明", 4000) };
  });
  if (new Set(support.map(s => s.prerequisiteKey)).size !== support.length) throw new NodeTeachingError(`步骤 ${stepKey} 的前置说明重复。`);
  const missing = needed.filter(p => p.source !== "foundation" && !support.some(s => s.prerequisiteKey === p.key));
  if (missing.length) throw new NodeTeachingError(`步骤 ${stepKey} 使用前尚未说明：${missing.map(p => `${p.key}（${p.knowledge}）`).join("、")}。请在 prerequisiteSupport 提供实际解释，不能只写“请先掌握”或依赖用户读过其他步骤。`);
  return support;
}

export const prerequisiteContinuityRules = `
TEACHING CONTINUITY (not mastery certification):
- Related concepts may be taught together when their meanings, conditions, differences and uses remain clear. Concept count is never a defect by itself. Nine dimensions serve understanding, not nine repetitive lessons per sub-concept.
- For every knowledge item actually needed to follow an explanation, derivation, example or activity, identify its required depth and real teaching provision: an agreed entry foundation, the actual tasks of a supplied prerequisite node, an earlier teaching step, or an explanation BEFORE use in the current step. A title, existing key, broad word such as "properties", display order or a learner progress flag is not proof of that provision.
- Do not relabel new course knowledge as assumed foundations. For example, when introductory calculus uses a squeeze argument, explain the squeeze principle or cite a prerequisite's actual teaching of it; "limit properties" alone does not establish that it teaches squeezing. Related limit properties may stay together if taught adequately.
- Previewing a later use, naming a relation or using an accessible analogy does not itself require full prerequisite teaching. Do not add advanced proofs, optional syllabus content or mandatory assessments. Local repair must preserve the confirmed scope and other stages.
- Planned, generated, viewed, skipped, a learner's own words and unresolved questions are different facts. None proves mastery. Missing reading evidence means unknown, not inability. Provide concise usable background before relying on unfamiliar course knowledge; allow optional fuller recall and free continuation.
`;
