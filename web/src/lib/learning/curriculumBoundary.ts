import { AiTaskValidationError } from "../ai/validationEvidence";
import type { ConceptLearningUnit, KnowledgeBoundary, ConceptProfile, ContentContribution, CourseContentQuestion, LearningGoal, ConceptReference, RoadmapModuleBlueprint } from "./roadmapPlanningTypes";
import { dimensions, type DimensionKey } from "./teachingDimensions";
import { prerequisiteContinuityRules } from "./teachingPrerequisites";

const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new AiTaskValidationError("课程边界或教学单元必须是对象。");
  return value as Record<string, unknown>;
};
const text = (value: unknown, label: string) => {
  if (typeof value !== "string" || !value.trim() || value.length > 4000) throw new AiTaskValidationError(`${label}需要具体、非空的文字。`);
  return value.trim();
};
function texts(value: unknown, label: string, required = false): string[] {
  if (!Array.isArray(value) || value.length > 100 || (required && !value.length)) throw new AiTaskValidationError(`${label}需要${required ? "非空" : ""}数组。`);
  return [...new Set(value.map(v => text(v, label)))];
}
export function parseKnowledgeBoundary(value: unknown): KnowledgeBoundary | undefined {
  if (value === undefined) return undefined;
  const data = object(value);
  if (data.version !== 1) throw new AiTaskValidationError("课程边界 version 必须为 1。");
  return { version: 1, assumedKnowledge: texts(data.assumedKnowledge, "默认基础"), newKnowledge: texts(data.newKnowledge, "课程新增知识", true) };
}
export function parseLearningUnit(value: unknown): ConceptLearningUnit | undefined {
  if (value === undefined) return undefined;
  const data = object(value);
  if (data.version !== 1 && data.version !== 2) throw new AiTaskValidationError("教学单元 version 必须为 1 或 2。");
  if (!Array.isArray(data.references) || data.references.length > 100) throw new AiTaskValidationError("教学引用需要数组。");
  const references = data.references.map(raw => {
    const ref = object(raw); const key = text(ref.key, "引用节点标识");
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(key)) throw new AiTaskValidationError("教学引用需要有效的稳定节点标识。");
    return { key, purpose: text(ref.purpose, "引用用途") };
  });
  if (new Set(references.map(r => r.key)).size !== references.length) throw new AiTaskValidationError("同一教学单元不能重复引用同一节点，请合并用途说明。");
  return { version: data.version, newKnowledge: text(data.newKnowledge, "本课新增知识"), assumedKnowledge: texts(data.assumedKnowledge, "使用的默认基础"), teachingTasks: texts(data.teachingTasks, "课内教学任务", true), example: text(data.example, "代表例子"), references,
    ...(data.version === 2 || data.contentContributions !== undefined ? { contentContributions: parseContentContributions(data.contentContributions) } : {}) };
}

/** A contribution selects part of the confirmed registry; it never invents requirements. */
export function parseContentContributions(value: unknown): ContentContribution[] {
  if (!Array.isArray(value) || value.length > 100) throw new AiTaskValidationError("contentContributions 需要数组；无课程内容问题的旧协议可为空数组。");
  const result = value.map(raw => {
    const data = object(raw);
    const contentQuestionKey = text(data.contentQuestionKey, "内容问题标识");
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(contentQuestionKey)) throw new AiTaskValidationError("分工需要有效的内容问题标识。");
    const requirementIndices = data.requirementIndices;
    if (!Array.isArray(requirementIndices) || !requirementIndices.length || requirementIndices.length > 100 || requirementIndices.some(i => !Number.isSafeInteger(i) || i < 0) || new Set(requirementIndices).size !== requirementIndices.length) throw new AiTaskValidationError("分工 requirementIndices 需要非空、不重复的零基整数下标。");
    const dimensionKeys = data.dimensionKeys;
    if (!Array.isArray(dimensionKeys) || !dimensionKeys.length || dimensionKeys.some(key => typeof key !== "string" || !Object.hasOwn(dimensions, key)) || new Set(dimensionKeys).size !== dimensionKeys.length) throw new AiTaskValidationError("分工 dimensionKeys 需要非空、不重复的有效九维标识。");
    return { contentQuestionKey, requirementIndices: requirementIndices as number[], dimensionKeys: dimensionKeys as DimensionKey[], contribution: text(data.contribution, "本节点具体贡献") };
  });
  if (new Set(result.map(c => c.contentQuestionKey)).size !== result.length) throw new AiTaskValidationError("同一处教学分工不能重复登记内容问题，请合并下标、维度和贡献说明。");
  return result;
}

/** Localize only explicit contributions. Legacy full-question fallback belongs to the caller. */
export function scopedContentQuestions(questions: CourseContentQuestion[], contributions: ContentContribution[]): CourseContentQuestion[] {
  return questions.flatMap(question => {
    const matches = contributions.filter(c => c.contentQuestionKey === question.key);
    if (!matches.length) return [];
    const selectedIndices = new Set(matches.flatMap(c => c.requirementIndices));
    const selectedDimensions = new Set(matches.flatMap(c => c.dimensionKeys));
    if ([...selectedIndices].some(i => !Number.isSafeInteger(i) || i < 0 || i >= question.contentRequirements.length) || [...selectedDimensions].some(key => !question.dimensionKeys.includes(key))) throw new AiTaskValidationError(`内容问题 ${question.key} 的分工已不属于当前确认的内容清单，请重新校验地图。`);
    const requirementIndices = question.contentRequirements.map((_, index) => index).filter(index => selectedIndices.has(index));
    return [{ ...question, contentRequirements: requirementIndices.map(index => question.contentRequirements[index]), requirementIndices, dimensionKeys: question.dimensionKeys.filter(key => selectedDimensions.has(key)), contribution: [...new Set(matches.map(c => c.contribution))].join("；") }];
  });
}

type ContributionStage = {
  key?: string;
  moduleBlueprints?: RoadmapModuleBlueprint[];
  modules?: { items?: { key?: string; planningQuestionKeys?: string[]; concept?: ConceptProfile }[]; conceptReferences?: ConceptReference[] }[];
};

/** Check each local responsibility, not full coverage by every individual node. */
export function validateContentContributions(input: { learningGoals?: LearningGoal[]; stages: ContributionStage[] }) {
  const registry = new Map((input.learningGoals || []).flatMap(goal => (goal.contentQuestions || []).map(q => [q.key, q] as const)));
  const nodes = new Map(input.stages.flatMap(stage => (stage.modules || []).flatMap(module => (module.items || []).map(node => [node.key, node] as const))));
  for (const stage of input.stages) {
    const planningQuestions = new Map((stage.moduleBlueprints || []).flatMap(module => module.keyQuestions.map(q => [q.key, q.contentQuestionKey] as const)));
    const validate = (ownerKey: string | undefined, assignedKeys: string[], contributions: ContentContribution[] | undefined, required: boolean, path: string) => {
      const assignedContent = new Set(assignedKeys.map(key => planningQuestions.get(key)).filter((key): key is string => Boolean(key)));
      const supplied = contributions || [];
      for (const contribution of supplied) {
        const question = registry.get(contribution.contentQuestionKey);
        const fail = (code: string, message: string) => { throw new AiTaskValidationError(message, [{ code, path, message, stageKey: stage.key, questionKey: contribution.contentQuestionKey }]); };
        if (!question || !assignedContent.has(contribution.contentQuestionKey)) fail("unassigned_content_contribution", `节点 ${ownerKey} 的分工只能引用已分配给它的课程内容问题：${contribution.contentQuestionKey}。`);
        if (contribution.requirementIndices.some(index => index >= question!.contentRequirements.length) || contribution.dimensionKeys.some(key => !question!.dimensionKeys.includes(key))) fail("invalid_content_contribution_scope", `节点 ${ownerKey} 的分工下标或维度不属于问题 ${contribution.contentQuestionKey} 的已确认清单。`);
      }
      const missing = [...assignedContent].filter(key => !supplied.some(c => c.contentQuestionKey === key));
      if (required && missing.length) {
        const message = `节点 ${ownerKey} 需要明确自己对内容问题 ${missing.join("、")} 的具体分工；不要求独自覆盖整个问题。`;
        throw new AiTaskValidationError(message, [{ code: "missing_content_contribution", path, message, stageKey: stage.key }]);
      }
    };
    for (const stageModule of stage.modules || []) {
      for (const node of stageModule.items || []) {
        const unit = node.concept?.learningUnit;
        validate(node.key, node.planningQuestionKeys || [], unit?.contentContributions, unit?.version === 2, `concept.${node.key}.learningUnit.contentContributions`);
      }
      for (const ref of stageModule.conceptReferences || []) {
        validate(ref.key, ref.planningQuestionKeys, ref.contentContributions, nodes.get(ref.key)?.concept?.learningUnit?.version === 2 || ref.contentContributions !== undefined, `conceptReferences.${ref.key}.contentContributions`);
      }
    }
  }
}

/** Validate identity and references only; semantic grain is not a word-count rule. */
export function validateLearningUnitOwnership(stages: { modules?: { items?: { key?: string; concept?: ConceptProfile }[] }[] }[]) {
  const nodes = stages.flatMap(s => (s.modules || []).flatMap(m => m.items || []));
  const keys = new Set(nodes.map(n => n.key));
  const owners = new Map<string, string | undefined>();
  for (const node of nodes) {
    const unit = node.concept?.learningUnit;
    if (!unit) continue;
    const identity = unit.newKnowledge.normalize("NFKC").replace(/\s+/g, "").toLocaleLowerCase();
    if (owners.has(identity)) throw new AiTaskValidationError(`节点 ${node.key} 与 ${owners.get(identity)} 重复承担相同新增知识，请保留一个负责节点并引用。`);
    owners.set(identity, node.key);
    for (const ref of unit.references) {
      if (!keys.has(ref.key) || ref.key === node.key) throw new AiTaskValidationError(`节点 ${node.key} 的教学引用 ${ref.key} 不存在或指向自身；引用必须指向其他已提供的概念。`);
    }
  }
}

export const knowledgeBoundaryShape = '{"version":1,"assumedKnowledge":["specific entry knowledge assumed from the task; empty when no foundation is assumed"],"newKnowledge":["knowledge this course adds at the agreed depth"]}';
export const contentContributionShape = '{"contentQuestionKey":"one assigned registry key","requirementIndices":[0],"dimensionKeys":["definition"],"contribution":"the concrete part this node teaches; select only its assigned requirements and dimensions"}';
export const learningUnitShape = `{"version":2,"newKnowledge":"explicit related knowledge taught together at the agreed depth","assumedKnowledge":["agreed entry foundation used directly, not new course knowledge"],"teachingTasks":["concrete explanation, judgment or use; name any necessary knowledge introduced BEFORE using it"],"example":"a representative example using only these foundations, actual prerequisites and knowledge taught here","references":[{"key":"another supplied concept key; omit this object when none","purpose":"brief recall, comparison or application; not a second full lesson"}],"contentContributions":[${contentContributionShape}]}`;
export const conceptReferenceShape = `{"key":"exact known concept key","planningQuestionKeys":["current-stage question key"],"problemRole":"role in this Stage whole problem","contentContributions":[${contentContributionShape}]}`;
export const curriculumBoundaryRules = `
COURSE FOUNDATIONS AND COMPLETE LEARNING UNITS:
- Distinguish assumed entry knowledge from the NEW knowledge of this course using the task, learner starting level and agreed depth. Foundations are reviewable assumptions, never certified mastery. Do not automatically turn them into stages, content requirements or nodes. If the user explicitly requests relearning something, that request wins; explain conflicts rather than silently excluding requested content.
- Stop downward decomposition at the agreed foundations. Do not exclude a new advanced property merely because its object has a familiar name. For a calculus learner with high-school foundations, basic functions, intervals and elementary algebra are ordinarily used directly; limits and genuinely new analysis remain teachable content.
- Each node owns a coherent teaching unit at this depth. Related concepts, principles or methods MAY be taught together when their meanings, conditions, differences and uses are made explicit. State the included new knowledge in learningUnit.newKnowledge, teachingTasks and a representative example. Never demand splitting solely because several concepts are present. A broad title without actual teaching responsibilities remains insufficient. Nine dimensions serve understanding and can share motivations/cases across the related knowledge.
- Across the course, keep one primary owner for the same new knowledge. Compare meanings and aliases, reuse stable keys via conceptReferences across modules/stages, and use learningUnit.references to explain recall/comparison/application of other supplied nodes. References NEVER create prerequisite edges. Use prerequisiteKeys only when learning genuinely depends on that node.
- Assumed foundations are used directly in lessons and briefly clarified only when needed or requested. Never create fake node keys for them. Existing content questions may cover several nodes; each node covers only the part supported by its own newKnowledge and teachingTasks.
- New learningUnit objects use version=2. For EACH assigned course content question, contentContributions declares contentQuestionKey, nonempty requirementIndices (zero-based indices into the confirmed contentRequirements), nonempty dimensionKeys (a subset of that question's dimensions), and a concrete contribution. Multiple nodes share a question by taking different parts; NEVER make each repeat every requirement or dimension. Preserve the registry and its indices. If an old course has no content-question registry, use an empty contentContributions array.
- New conceptReferences also declare contentContributions for their current-stage assignments; this adds explicit confirmed responsibilities without silently editing the source node. Existing version=2 responsibilities and explicit reference contributions must survive repair; do not downgrade to version=1. Legacy version=1 remains readable without guessing contributions. Missing whole-course dimensions from still-unexpanded stages are a coverage status, not a reason to demand every present node teach everything.
- Check that examples use the agreed foundations, supplied necessary prerequisites or knowledge taught in this lesson. Ordinary overlap, reasonable alternatives and naming ambiguity remain suggestions; only evidenced serious defects under the existing policy block. Never expand course depth to eliminate all suggestions.
${prerequisiteContinuityRules}
- In planning, use the existing prerequisite text to state WHAT knowledge is needed and WHERE its actual teaching tasks provide it. When teaching necessary background in this node, include a concrete prior-to-use teachingTasks entry. For prerequisiteKeys, inspect the referenced node's actual scope and teachingTasks, not just its title. The matched teaching may be planned rather than generated; never call it already learned. Do not add a formal node solely for a short in-lesson explanation.
`;
