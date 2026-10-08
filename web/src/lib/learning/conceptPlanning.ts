import type { ConceptProfile, ConceptReference, LearningGoal, StageProblem } from "./roadmapPlanningTypes";
import { parseLearningUnit, parseContentContributions } from "./curriculumBoundary";
import type { AiValidationIssue } from "../ai/validationEvidence";
import { dimensions, type DimensionKey } from "./teachingDimensions";
const record = (v: unknown): Record<string,unknown> => v && typeof v === "object" && !Array.isArray(v)?v as Record<string,unknown>:{};
const text = (v:unknown) => typeof v === "string"?v.trim():"";
export const planningStrings = (v:unknown):string[] => Array.isArray(v)?[...new Set(v.map(text).filter(Boolean))]:[];
export function parseConcept(v:unknown):ConceptProfile { const d=record(v); const learningUnit=parseLearningUnit(d.learningUnit); return {name:text(d.name),aliases:planningStrings(d.aliases),scope:text(d.scope),problemRole:text(d.problemRole),...(learningUnit ? {learningUnit} : {})}; }
export function parseProblem(v:unknown):StageProblem { const d=record(v);return {question:text(d.question),steps:planningStrings(d.steps)}; }
export function parseGoals(v:unknown):LearningGoal[] {
  return (Array.isArray(v)?v:[]).map(raw => {
    const d=record(raw);
    return {key:text(d.key),description:text(d.description), ...(d.contentQuestions !== undefined ? {
      contentQuestions:(Array.isArray(d.contentQuestions)?d.contentQuestions:[]).map(rawQuestion => {
        const q=record(rawQuestion);
        return {key:text(q.key),question:text(q.question),contentRequirements:planningStrings(q.contentRequirements),dimensionKeys:planningStrings(q.dimensionKeys) as DimensionKey[]};
      })
    } : {})};
  });
}
export const hasContentQuestions = (goals?: LearningGoal[]) => Boolean(goals?.some(goal => goal.contentQuestions !== undefined));

type CoverageStage = {
  key?: string; goalKeys?: string[]; problem?: StageProblem;
  moduleBlueprints?: { key?: string; goalKeys?: string[]; keyQuestions: Partial<import("./roadmapPlanningTypes").RoadmapModuleKeyQuestion>[] }[];
};

/** Resolve references from the current content-question registry, then compute
 * the parent summaries. Generated parent labels never define the allowed set. */
export function resolveContentCoverage(input: {learningGoals?:LearningGoal[];stages:CoverageStage[];contentCoverageVersion?:number|null}) {
  if (!hasContentQuestions(input.learningGoals) && input.contentCoverageVersion !== 1) return;
  const issues:AiValidationIssue[]=[];
  const registry=new Map<string,{goalKey:string;question:NonNullable<LearningGoal["contentQuestions"]>[number]}>();
  for(const [goalIndex,goal] of (input.learningGoals || []).entries()) {
    if(!goal.contentQuestions?.length) issues.push({code:"missing_content_questions",path:`learningGoals[${goalIndex}].contentQuestions`,message:"每个课程目标需要具体内容问题。"});
    for(const [index,q] of (goal.contentQuestions || []).entries()) {
      const path=`learningGoals[${goalIndex}].contentQuestions[${index}]`;
      if(!/^[a-zA-Z0-9_-]{1,100}$/.test(q.key) || registry.has(q.key)) issues.push({code:"invalid_content_question_key",path:`${path}.key`,message:"课程内容问题需要唯一且非空的稳定标识。"});
      if(!q.question || !q.contentRequirements.length || !q.dimensionKeys.length || q.dimensionKeys.some(key=>!Object.hasOwn(dimensions,key))) issues.push({code:"invalid_content_question",path,message:"内容问题需要具体问题、材料说明要求和有效九维安排。"});
      registry.set(q.key,{goalKey:goal.key,question:q});
    }
  }
  const assigned=new Set<string>();
  for(const [stageIndex,stage] of input.stages.entries()) {
    const stageGoals=new Set<string>();
    for(const [moduleIndex,module] of (stage.moduleBlueprints || []).entries()) {
      const moduleGoals=new Set<string>();
      for(const [questionIndex,q] of module.keyQuestions.entries()) {
        const found=registry.get(q.contentQuestionKey || "");
        if(!found) {
          issues.push({stageKey:stage.key,moduleKey:module.key,questionKey:q.key,code:"unknown_content_question",path:`stages[${stageIndex}].moduleBlueprints[${moduleIndex}].keyQuestions[${questionIndex}].contentQuestionKey`,message:"规划问题必须引用已登记的课程内容问题。",actualReferenceKeys:q.contentQuestionKey?[q.contentQuestionKey]:[],allowedReferenceKeys:[...registry.keys()]});
          continue;
        }
        assigned.add(found.question.key);
        q.question=found.question.question;
        q.contentRequirements=[...found.question.contentRequirements];
        q.dimensionKeys=[...found.question.dimensionKeys];
        q.checkableOutcome=found.question.contentRequirements.join("；");
        q.goalKeys=[found.goalKey];
        moduleGoals.add(found.goalKey); stageGoals.add(found.goalKey);
      }
      module.goalKeys=[...moduleGoals];
    }
    stage.goalKeys=[...stageGoals];
  }
  for(const key of registry.keys()) if(!assigned.has(key)) issues.push({code:"unarranged_content_question",path:"stages",questionKey:key,message:`内容问题 ${key} 尚未安排到模块。`});
  if(issues.length) throw new ConceptPlanningValidationError(issues);
}
export function parseConceptReferences(v:unknown):ConceptReference[] {return (Array.isArray(v)?v:[]).map(raw=>{const d=record(raw);return {key:text(d.key),planningQuestionKeys:planningStrings(d.planningQuestionKeys),problemRole:text(d.problemRole),...(d.contentContributions !== undefined ? {contentContributions:parseContentContributions(d.contentContributions)} : {})};});}
export class ConceptPlanningValidationError extends Error {
  constructor(readonly issues: AiValidationIssue[]) {
    const first = issues[0];
    super(`${first.message}（位置：${first.path}；共 ${issues.length} 处问题）`);
    this.name = "ConceptPlanningValidationError";
  }
}

export function validateConceptGoals(input: {
  contentCoverageVersion?: number | null;
  learningGoals?: LearningGoal[];
  stages: CoverageStage[];
}) {
  resolveContentCoverage(input);
  const issues: AiValidationIssue[] = [];
  const goals = input.learningGoals || [];
  const keys = new Set(goals.map(g => g.key));
  if (!goals.length || keys.size !== goals.length || goals.some(g => !g.key || !g.description)) {
    issues.push({ code: "invalid_learning_goals", path: "learningGoals", message: "课程需要唯一且非空的学习目标。" });
  }
  const covered = new Set<string>();
  input.stages.forEach((stage, stageIndex) => {
    const stagePath = `stages[${stageIndex}]`;
    const stageKeys = stage.goalKeys || [];
    const context = { stageKey: stage.key };
    if (!stage.problem?.question || !stage.problem.steps.length) {
      issues.push({ ...context, code: "missing_stage_problem", path: `${stagePath}.problem`, message: `阶段 ${stage.key} 缺少代表性问题和处理环节。` });
    }
    if (!stageKeys.length || stageKeys.some(k => !keys.has(k))) {
      issues.push({ ...context, code: "invalid_stage_goals", path: `${stagePath}.goalKeys`, message: `阶段 ${stage.key} 的目标覆盖无效。`, actualGoalKeys: stageKeys, allowedGoalKeys: [...keys] });
    }
    const stageCovered = new Set<string>();
    (stage.moduleBlueprints || []).forEach((stageModule, moduleIndex) => {
      const modulePath = `${stagePath}.moduleBlueprints[${moduleIndex}]`;
      const moduleKeys = stageModule.goalKeys || [];
      const moduleContext = { ...context, moduleKey: stageModule.key };
      if (!moduleKeys.length || moduleKeys.some(k => !stageKeys.includes(k))) {
        issues.push({ ...moduleContext, code: "invalid_module_goals", path: `${modulePath}.goalKeys`, message: "模块需要关联所属阶段的目标。", actualGoalKeys: moduleKeys, allowedGoalKeys: stageKeys });
      }
      const moduleCovered = new Set<string>();
      stageModule.keyQuestions.forEach((q, questionIndex) => {
        const questionKeys = q.goalKeys || [];
        if (!questionKeys.length || questionKeys.some(k => !moduleKeys.includes(k))) {
          issues.push({ ...moduleContext, questionKey: q.key, code: "invalid_question_goals", path: `${modulePath}.keyQuestions[${questionIndex}].goalKeys`, message: "规划问题需要关联模块目标。", actualGoalKeys: questionKeys, allowedGoalKeys: moduleKeys });
        }
        questionKeys.forEach(k => { moduleCovered.add(k); stageCovered.add(k); covered.add(k); });
      });
      const missing = moduleKeys.filter(k => !moduleCovered.has(k));
      if (missing.length) {
        issues.push({ ...moduleContext, code: "uncovered_module_goals", path: `${modulePath}.keyQuestions`, message: "模块目标存在未覆盖的规划问题。", missingGoalKeys: missing });
      }
    });
    const missing = stageKeys.filter(k => !stageCovered.has(k));
    if (missing.length) {
      issues.push({ ...context, code: "uncovered_stage_goals", path: `${stagePath}.moduleBlueprints`, message: "阶段目标没有落实到模块问题。", missingGoalKeys: missing });
    }
  });
  const missing = goals.filter(g => !covered.has(g.key)).map(g => g.key);
  if (missing.length) {
    issues.push({ code: "uncovered_learning_goals", path: "stages", message: "领域目标存在未覆盖项。", missingGoalKeys: missing });
  }
  if (issues.length) throw new ConceptPlanningValidationError(issues);
}
