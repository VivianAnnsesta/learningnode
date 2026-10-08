/**
 * Roadmap skeleton / stage determinism checks.
 *
 * These are the same-origin deterministic guards used by the formal map
 * reconcile (DAG, no dangling prerequisite refs, no duplicate keys): they run
 * on the AI-generated roadmap skeleton draft *before* it is expanded or
 * confirmed, so structural defects are caught early instead of propagating
 * into the map.
 *
 * Severity model mirrors the course-design quality pipeline:
 * - `error`   → structural integrity is broken; blocks the draft (caller falls
 *               back to the deterministic local skeleton or rejects the submit).
 * - `warning` → advisory only; surfaced to the user, never blocks.
 */

import type { RoadmapSkeletonDraft } from "./tasks";
import type { RoadmapStageInput } from "../learning/roadmapService";

export const MAX_ROADMAP_STAGES = 16;
export const MIN_ROADMAP_STAGES = 1;

export type DeterminismSeverity = "error" | "warning";

export type DeterminismIssueCode =
  | "tooManyStages"
  | "duplicateStageKey"
  | "duplicateStageTitle"
  | "emptyStageGoal"
  | "emptyModuleDirections"
  | "missingRationale"
  | "danglingPrerequisiteKey"
  | "cyclicPrerequisite";

export type DeterminismIssue = {
  code: DeterminismIssueCode;
  severity: DeterminismSeverity;
  message: string;
  stageKey?: string;
};

export type DeterminismResult = {
  ok: boolean;
  issues: DeterminismIssue[];
  errors: DeterminismIssue[];
  warnings: DeterminismIssue[];
};

/** Minimal shape every checked stage can be projected onto. */
export type DeterminismStageInput = {
  key: string;
  title: string;
  goal: string | null | undefined;
  /** coreTopics for skeleton stages; moduleDirections for expanded stages. */
  moduleDirections: string[];
  prerequisiteStageKeys: string[];
  /** Only present on expanded roadmap stages. */
  rationale?: string | null;
};

function emptyResult(): DeterminismResult {
  return { ok: true, issues: [], errors: [], warnings: [] };
}

/**
 * Core deterministic check shared by skeleton and expanded-stage validation.
 * Pure: takes a list of already-normalized stage projections and returns the
 * full issue list without throwing.
 */
export function checkStagesDeterminism(
  stages: DeterminismStageInput[],
  options: { maxStages?: number } = {}
): DeterminismResult {
  const result = emptyResult();
  const maxStages = options.maxStages ?? MAX_ROADMAP_STAGES;

  const push = (issue: DeterminismIssue) => {
    result.issues.push(issue);
    if (issue.severity === "error") result.errors.push(issue);
    else result.warnings.push(issue);
  };

  if (stages.length > maxStages) {
    push({
      code: "tooManyStages",
      severity: "error",
      message: `Stage 数量 ${stages.length} 超过上限 ${maxStages}；骨架必须收敛到可展开的有限阶段。`
    });
  }

  const keySet = new Set(stages.map((stage) => stage.key));
  const seenKeys = new Set<string>();
  const seenTitles = new Set<string>();

  for (const stage of stages) {
    if (seenKeys.has(stage.key)) {
      push({
        code: "duplicateStageKey",
        severity: "error",
        message: `Stage key 重复："${stage.key}"；key 是稳定标识，必须唯一否则前置引用无法解析。`,
        stageKey: stage.key
      });
    }
    seenKeys.add(stage.key);

    const trimmedTitle = stage.title.trim();
    if (trimmedTitle && seenTitles.has(trimmedTitle)) {
      push({
        code: "duplicateStageTitle",
        severity: "warning",
        message: `Stage 标题重复："${trimmedTitle}"；不同阶段的展示标题应可区分。`,
        stageKey: stage.key
      });
    }
    seenTitles.add(trimmedTitle);

    if (!stage.goal || !stage.goal.trim()) {
      push({
        code: "emptyStageGoal",
        severity: "warning",
        message: `Stage "${stage.title}" 缺少 goal（阶段目标为空）；骨架阶段应有明确可达目标。`,
        stageKey: stage.key
      });
    }

    if (!stage.moduleDirections || stage.moduleDirections.length === 0) {
      push({
        code: "emptyModuleDirections",
        severity: "warning",
        message: `Stage "${stage.title}" 缺少模块方向（coreTopics / moduleDirections 为空）；骨架阶段应给出核心主题。`,
        stageKey: stage.key
      });
    }

    if (
      stage.rationale !== undefined &&
      stage.rationale !== null &&
      !stage.rationale.trim()
    ) {
      push({
        code: "missingRationale",
        severity: "warning",
        message: `Stage "${stage.title}" 的 rationale 为空；应解释为何保留或调整方向。`,
        stageKey: stage.key
      });
    }

    for (const prereqKey of stage.prerequisiteStageKeys) {
      if (!keySet.has(prereqKey)) {
        push({
          code: "danglingPrerequisiteKey",
          severity: "error",
          message: `Stage "${stage.title}" 引用了不存在的前置 key："${prereqKey}"；前置引用必须指向骨架中的真实阶段。`,
          stageKey: stage.key
        });
      }
    }
  }

  const cycle = detectPrerequisiteCycle(stages);
  if (cycle) {
    push({
      code: "cyclicPrerequisite",
      severity: "error",
      message: `Stage 前置关系存在环：${cycle.join(" → ")}；骨架必须是 DAG，不能有循环依赖。`
    });
  }

  result.ok = result.errors.length === 0;
  return result;
}

/**
 * Detect a cycle in the prerequisite graph (stageKey -> prerequisiteStageKeys).
 * Only edges to existing keys are considered (dangling refs are reported
 * separately). Returns the cycle path (first node repeated at the end) or null.
 */
function detectPrerequisiteCycle(stages: DeterminismStageInput[]): string[] | null {
  const keySet = new Set(stages.map((stage) => stage.key));
  const adjacency = new Map<string, string[]>();
  for (const stage of stages) {
    adjacency.set(
      stage.key,
      stage.prerequisiteStageKeys.filter((key) => keySet.has(key))
    );
  }

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  for (const stage of stages) color.set(stage.key, WHITE);

  let cyclePath: string[] | null = null;

  const visit = (node: string, stack: string[]): boolean => {
    color.set(node, GRAY);
    for (const next of adjacency.get(node) ?? []) {
      const state = color.get(next);
      if (state === GRAY) {
        const cycleStart = stack.indexOf(next);
        cyclePath = [...stack.slice(cycleStart), next];
        return true;
      }
      if (state === WHITE && visit(next, [...stack, next])) {
        return true;
      }
    }
    color.set(node, BLACK);
    return false;
  };

  for (const stage of stages) {
    if (color.get(stage.key) === WHITE && visit(stage.key, [stage.key])) {
      return cyclePath;
    }
  }
  return null;
}

/** Deterministic check for the AI roadmap skeleton draft. */
export function checkRoadmapSkeletonDeterminism(
  skeleton: RoadmapSkeletonDraft
): DeterminismResult {
  const stages: DeterminismStageInput[] = skeleton.stages.map((stage) => ({
    key: stage.key,
    title: stage.title,
    goal: stage.goal,
    moduleDirections: stage.coreTopics,
    prerequisiteStageKeys: stage.prerequisiteStageKeys
  }));
  return checkStagesDeterminism(stages);
}

/** Deterministic check for the fully expanded roadmap stages. */
export function checkRoadmapStageDeterminism(
  stages: RoadmapStageInput[]
): DeterminismResult {
  const mapped: DeterminismStageInput[] = stages.map((stage) => ({
    key: stage.key ?? "",
    title: stage.title ?? "",
    goal: stage.goal,
    moduleDirections: stage.moduleDirections ?? [],
    prerequisiteStageKeys: stage.prerequisiteStageKeys ?? [],
    rationale: stage.rationale
  }));
  return checkStagesDeterminism(mapped);
}
