import type { RoadmapStageInput } from "../learning/roadmapService";
import type {
  RoadmapModuleBlueprint,
  RoadmapModuleKeyQuestion
} from "../learning/roadmapPlanningTypes";

export type {
  RoadmapModuleBlueprint,
  RoadmapModuleKeyQuestion
} from "../learning/roadmapPlanningTypes";

export type LayeredRoadmapStage = {
  key: string;
  title: string;
  goalKeys?: string[];
  problem?: import("../learning/roadmapPlanningTypes").StageProblem;
  goal?: string | null;
  coreTopics?: string[];
  prerequisiteStageTitles?: string[];
  prerequisiteStageKeys: string[];
  moduleBlueprints: RoadmapModuleBlueprint[];
};

export type LayeredRoadmapSkeleton = {
  title: string;
  status: "draft";
  planningVersion: 2 | 3;
  stages: LayeredRoadmapStage[];
};

export type RoadmapPlanningIssueCode =
  | "missingModuleBlueprint"
  | "missingModuleKey"
  | "missingModuleTitle"
  | "duplicateModuleKey"
  | "missingModuleGoal"
  | "missingKeyQuestion"
  | "missingQuestionKey"
  | "duplicateQuestionKey"
  | "missingCheckableOutcome"
  | "compoundKeyQuestion"
  | "compoundLearningQuestion"
  | "uncoveredPlanningQuestion"
  | "unknownPlanningQuestion"
  | "missingPlanningQuestion"
  | "thinModuleBlueprint"
  | "thinStageExpansion";

/**
 * Advisory density thresholds (ADR 0015). These never block confirmation;
 * they only route thin units into the existing semantic review channel.
 * Exported so tests and reviews can inspect and adjust them deliberately.
 */
export const MIN_EXPANDED_STAGE_NODES = 4;
export const THIN_EXPANSION_RATIO = 1.5;

export type RoadmapPlanningIssue = {
  code: RoadmapPlanningIssueCode;
  severity: "error" | "warning";
  message: string;
  stageKey?: string;
  moduleKey?: string;
  questionKey?: string;
  nodeKey?: string;
};

export type RoadmapPlanningCheck = {
  ok: boolean;
  needsAiReview: boolean;
  issues: RoadmapPlanningIssue[];
  errors: RoadmapPlanningIssue[];
  warnings: RoadmapPlanningIssue[];
};

const trimmed = (value?: string | null) => value?.trim() || "";

function looksCompoundQuestion(question: string) {
  const punctuationCount = (question.match(/[?？]/g) || []).length;
  const clauseSignals = (question.match(/以及|并且|同时|分别|有何区别|如何选择/g) || [])
    .length;
  return punctuationCount > 1 || (question.length >= 48 && clauseSignals >= 2);
}

const MULTI_ABILITY_CLAUSE_SIGNALS =
  /以及|并且|同时|分别|还要|还需|，|、|；|;|, and |, or |并(?:能|会|可|要|需|掌握|理解|计算|应用|运用|区分|判断|求解|使用|选择)/g;
const MULTI_ABILITY_CONJUNCTION_SIGNALS = /\s+(?:and|or)\s+/gi;

/**
 * Heuristic for a Module goal that names several independent abilities
 * (parallel clauses, independent verb phrases joined by and/or-style
 * connectors). Advisory only: it feeds the thinModuleBlueprint warning.
 */
function looksMultiAbilityGoal(goal: string) {
  const text = trimmed(goal);
  if (!text) return false;
  const clauseSignals = (text.match(MULTI_ABILITY_CLAUSE_SIGNALS) || []).length;
  const conjunctionSignals = (
    text.match(MULTI_ABILITY_CONJUNCTION_SIGNALS) || []
  ).length;
  return clauseSignals >= 2 || conjunctionSignals >= 1;
}

function finish(issues: RoadmapPlanningIssue[]): RoadmapPlanningCheck {
  const errors = issues.filter((issue) => issue.severity === "error");
  const warnings = issues.filter((issue) => issue.severity === "warning");
  return {
    ok: errors.length === 0,
    needsAiReview: warnings.some(
      (issue) =>
        issue.code === "compoundKeyQuestion" ||
        issue.code === "compoundLearningQuestion" ||
        issue.code === "thinModuleBlueprint" ||
        issue.code === "thinStageExpansion"
    ),
    issues,
    errors,
    warnings
  };
}

export function checkLayeredRoadmapSkeleton(
  skeleton: LayeredRoadmapSkeleton
): RoadmapPlanningCheck {
  const issues: RoadmapPlanningIssue[] = [];
  const seenQuestionKeys = new Set<string>();

  for (const stage of skeleton.stages) {
    if (!stage.moduleBlueprints.length) {
      issues.push({
        code: "missingModuleBlueprint",
        severity: "error",
        stageKey: stage.key,
        message: `Stage "${stage.title}" 缺少结构化 Module 方向。`
      });
      continue;
    }

    const seenModuleKeys = new Set<string>();
    for (const blueprint of stage.moduleBlueprints) {
      if (!trimmed(blueprint.key)) {
        issues.push({
          code: "missingModuleKey",
          severity: "error",
          stageKey: stage.key,
          message: `Stage "${stage.title}" 的 Module 缺少稳定 key。`
        });
      }
      if (!trimmed(blueprint.title)) {
        issues.push({
          code: "missingModuleTitle",
          severity: "error",
          stageKey: stage.key,
          moduleKey: blueprint.key,
          message: `Stage "${stage.title}" 的 Module 缺少标题。`
        });
      }
      if (seenModuleKeys.has(blueprint.key)) {
        issues.push({
          code: "duplicateModuleKey",
          severity: "error",
          stageKey: stage.key,
          moduleKey: blueprint.key,
          message: `Stage "${stage.title}" 的 Module key "${blueprint.key}" 重复。`
        });
      }
      seenModuleKeys.add(blueprint.key);

      if (!trimmed(blueprint.goal)) {
        issues.push({
          code: "missingModuleGoal",
          severity: "error",
          stageKey: stage.key,
          moduleKey: blueprint.key,
          message: `Module "${blueprint.title}" 缺少目标。`
        });
      }
      if (!blueprint.keyQuestions.length) {
        issues.push({
          code: "missingKeyQuestion",
          severity: "error",
          stageKey: stage.key,
          moduleKey: blueprint.key,
          message: `Module "${blueprint.title}" 缺少关键问题。`
        });
      }
      if (
        blueprint.keyQuestions.length === 1 &&
        looksMultiAbilityGoal(blueprint.goal)
      ) {
        issues.push({
          code: "thinModuleBlueprint",
          severity: "warning",
          stageKey: stage.key,
          moduleKey: blueprint.key,
          message: `Module "${blueprint.title}" 的目标包含多个独立能力信号，但只有 1 个规划问题，需要 AI 复审拆分粒度。`
        });
      }

      for (const question of blueprint.keyQuestions) {
        if (!trimmed(question.key)) {
          issues.push({
            code: "missingQuestionKey",
            severity: "error",
            stageKey: stage.key,
            moduleKey: blueprint.key,
            message: `Module "${blueprint.title}" 的规划问题缺少稳定 key。`
          });
        }
        if (seenQuestionKeys.has(question.key)) {
          issues.push({
            code: "duplicateQuestionKey",
            severity: "error",
            stageKey: stage.key,
            moduleKey: blueprint.key,
            questionKey: question.key,
            message: `规划问题 key "${question.key}" 重复。`
          });
        }
        seenQuestionKeys.add(question.key);

        if (!trimmed(question.question)) {
          issues.push({
            code: "missingKeyQuestion",
            severity: "error",
            stageKey: stage.key,
            moduleKey: blueprint.key,
            questionKey: question.key,
            message: `规划问题 "${question.key}" 缺少问题文本。`
          });
        }
        if (!trimmed(question.checkableOutcome)) {
          issues.push({
            code: "missingCheckableOutcome",
            severity: "error",
            stageKey: stage.key,
            moduleKey: blueprint.key,
            questionKey: question.key,
            message: `规划问题 "${question.question}" 缺少材料说明要求。`
          });
        }
        if (looksCompoundQuestion(question.question)) {
          issues.push({
            code: "compoundKeyQuestion",
            severity: "warning",
            stageKey: stage.key,
            moduleKey: blueprint.key,
            questionKey: question.key,
            message: `规划问题 "${question.question}" 可能混合多个独立能力，需要 AI 复审。`
          });
        }
      }
    }
  }

  return finish(issues);
}

type StageWithPlanningCoverage = RoadmapStageInput & {
  modules: Array<{
    title: string;
    goal?: string | null;
    items: Array<{
      key: string;
      planningQuestionKey?: string | null;
      planningQuestionKeys?: string[];
    }>;
  }>;
};

export function checkLayeredStageCoverage(
  stageBlueprint: LayeredRoadmapStage,
  stage: StageWithPlanningCoverage
): RoadmapPlanningCheck & {
  coverage: {
    total: number;
    covered: number;
    uncoveredQuestionKeys: string[];
  };
} {
  const issues: RoadmapPlanningIssue[] = [];
  const plannedKeys = new Set(
    stageBlueprint.moduleBlueprints.flatMap((blueprint) =>
      blueprint.keyQuestions.map((question) => question.key)
    )
  );
  const coveredKeys = new Set<string>();

  for (const stageModule of stage.modules) {
    for (const item of [...stageModule.items, ...(stageModule.conceptReferences || [])]) {
      const keys = item.planningQuestionKeys?.length ? item.planningQuestionKeys : [trimmed("planningQuestionKey" in item ? item.planningQuestionKey : "")];
      for (const planningQuestionKey of keys) {
      if (!planningQuestionKey) {
        issues.push({
          code: "missingPlanningQuestion",
          severity: "error",
          stageKey: stageBlueprint.key,
          nodeKey: item.key,
          message: `Learning Node "${item.key}" 没有规划问题归属。`
        });
        continue;
      }
      if (!plannedKeys.has(planningQuestionKey)) {
        issues.push({
          code: "unknownPlanningQuestion",
          severity: "error",
          stageKey: stageBlueprint.key,
          questionKey: planningQuestionKey,
          nodeKey: item.key,
          message: `Learning Node "${item.key}" 引用了不存在的规划问题 "${planningQuestionKey}"。`
        });
        continue;
      }
      coveredKeys.add(planningQuestionKey);
      }
    }
  }

  const uncoveredQuestionKeys = [...plannedKeys].filter(
    (key) => !coveredKeys.has(key)
  );
  for (const questionKey of uncoveredQuestionKeys) {
    issues.push({
      code: "uncoveredPlanningQuestion",
      severity: "error",
      stageKey: stageBlueprint.key,
      questionKey,
      message: `规划问题 "${questionKey}" 没有对应的 Learning Node。`
    });
  }

  return {
    ...finish(issues),
    coverage: {
      total: plannedKeys.size,
      covered: coveredKeys.size,
      uncoveredQuestionKeys
    }
  };
}

export function checkLayeredStageContentRisk(
  stage: {
    key?: string;
    title?: string;
    modules?: Array<{
      title?: string;
      items?: Array<{
        key?: string;
        keyQuestion?: string | null;
      }>;
    }>;
  },
  blueprint?: { moduleBlueprints?: RoadmapModuleBlueprint[] } | null
): RoadmapPlanningCheck {
  const issues: RoadmapPlanningIssue[] = [];
  for (const stageModule of stage.modules || []) {
    for (const item of stageModule.items || []) {
      const question = trimmed(item.keyQuestion);
      if (question && looksCompoundQuestion(question)) {
        issues.push({
          code: "compoundLearningQuestion",
          severity: "warning",
          stageKey: stage.key,
          nodeKey: item.key,
          message: `Learning Node "${item.key || question}" 的核心问题可能混合多个独立能力，需要 AI 复审。`
        });
      }
    }
  }
  if (blueprint && !(stage.modules || []).some(m => (m.items || []).some(i => "concept" in i))) {
    const plannedQuestionCount = (blueprint.moduleBlueprints || []).reduce(
      (count, moduleBlueprint) => count + moduleBlueprint.keyQuestions.length,
      0
    );
    const nodeCount = (stage.modules || []).reduce(
      (count, stageModule) => count + (stageModule.items?.length || 0),
      0
    );
    if (
      nodeCount < MIN_EXPANDED_STAGE_NODES ||
      nodeCount < plannedQuestionCount * THIN_EXPANSION_RATIO
    ) {
      issues.push({
        code: "thinStageExpansion",
        severity: "warning",
        stageKey: stage.key,
        message: `Stage "${stage.title || stage.key || "未知 Stage"}" 只展开 ${nodeCount} 个 Learning Node，相对 ${plannedQuestionCount} 个规划问题明显偏少，需要 AI 复审覆盖密度。`
      });
    }
  }
  return finish(issues);
}
