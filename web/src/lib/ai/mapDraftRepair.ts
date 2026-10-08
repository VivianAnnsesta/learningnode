import {
  validateRoadmapInput,
  type RoadmapInput,
  type RoadmapStageInput,
  type ValidatedRoadmapInput
} from "../learning/roadmapService";
import {
  AiTaskValidationError,
  validateMapDraftQualityReport,
  type MapDraftQualityFinding,
  type MapDraftQualityReport
} from "./tasks";
import { validationIssues } from "./validationEvidence";
import { validateCriticalPlanningReport, validateContentRevisions, type ContentRevision } from "./planningReviewPolicy";

const stageFields = [
  "key", "title", "goal", "goalKeys", "problem", "status", "rationale",
  "moduleDirections", "moduleBlueprints", "prerequisiteStageKeys", "modules"
] as const;

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new AiTaskValidationError(`${path} must be an object.`, [{
      code: "invalid_repair_object", path, message: `${path} must be an object.`
    }]);
  }
  return value as Record<string, unknown>;
}

function rejectRepair(code: string, path: string, message: string, stageKey?: string): never {
  throw new AiTaskValidationError(message, [{ code, path, message, stageKey }]);
}

function keysInStage(stage: RoadmapStageInput): string[] {
  return [
    stage.key || "",
    ...(stage.moduleBlueprints || []).flatMap(module => [
      module.key, ...module.keyQuestions.map(question => question.key)
    ]),
    ...(stage.modules || []).flatMap(module => (module.items || []).map(item => item.key || ""))
  ];
}

export function hasStageRepairableFindings(
  report: MapDraftQualityReport,
  baseline: ValidatedRoadmapInput,
  stageKey: string
) {
  const otherKeys = new Set(baseline.stages
    .filter(stage => stage.key !== stageKey).flatMap(keysInStage));
  const courseKeys = new Set((baseline.learningGoals || []).flatMap(goal => [goal.key, ...(goal.contentQuestions || []).map(q => q.key)]));
  return report.blockingIssues.some(finding => !finding.targetKey || (!otherKeys.has(finding.targetKey) && !courseKeys.has(finding.targetKey)));
}

function retainOtherStageFindings(
  report: MapDraftQualityReport,
  previousReport: MapDraftQualityReport | undefined,
  baseline: ValidatedRoadmapInput,
  stageKey: string
): MapDraftQualityReport {
  if (!previousReport) return report;
  const otherKeys = new Set(baseline.stages
    .filter(stage => stage.key !== stageKey).flatMap(keysInStage));
  (baseline.learningGoals || []).forEach(goal => {
    otherKeys.add(goal.key);
    (goal.contentQuestions || []).forEach(q => otherKeys.add(q.key));
  });
  const mergeFindings = (current: MapDraftQualityFinding[], previous: MapDraftQualityFinding[]) => {
    const retained = previous.filter(finding => finding.targetKey && otherKeys.has(finding.targetKey));
    // Keep the original evidence for unchanged Stages. A model paraphrase of
    // the same finding is neither a repair nor an additional defect.
    return [...current.filter(entry => !retained.some(finding =>
      entry.code === finding.code && entry.targetKey === finding.targetKey
    )), ...retained];
  };
  const blockingIssues = mergeFindings(report.blockingIssues, previousReport.blockingIssues);
  return {
    ...report,
    status: blockingIssues.length ? "blocked" : "passed",
    summary: blockingIssues.length > report.blockingIssues.length
      ? `${report.summary} 其他阶段的未解决意见仍保留，当前阶段修复不能代替处理。`
      : report.summary,
    blockingIssues,
    warnings: mergeFindings(report.warnings, previousReport.warnings)
  };
}

export function validateMapDraftQualityRepair(
  value: unknown,
  baseline: ValidatedRoadmapInput,
  options: { stageKey?: string; previousReport?: MapDraftQualityReport; criticalPolicy?: boolean } = {}
) {
  try {
    const record = requireRecord(value, "$");
    let draft: ValidatedRoadmapInput;
    let contentRevisions: ContentRevision[] = [];
    if (options.stageKey) {
      const stageKey = options.stageKey;
      if (Object.keys(record).some(key => key !== "report" && key !== "stage")) {
        rejectRepair("stage_repair_scope", "$", "阶段修复只能返回 report 和 stage，不能返回整图或课程级字段。", stageKey);
      }
      const stage = requireRecord(record.stage, "stage");
      const target = baseline.stages.find(entry => entry.key === stageKey);
      if (!target || target.status !== "expanded") {
        rejectRepair("invalid_repair_stage", "stage.key", "只能修复当前草稿中已展开的目标阶段。", stageKey);
      }
      if (stage.key !== stageKey || stage.status !== target.status) {
        rejectRepair("changed_repair_stage", "stage.key", "阶段修复必须保留目标阶段的 key 和展开状态。", stageKey);
      }
      if (Object.keys(stage).some(key => !stageFields.includes(key as typeof stageFields[number]))) {
        rejectRepair("stage_repair_scope", "stage", "stage 只能包含约定的阶段字段；地图元数据由服务端保留。", stageKey);
      }
      const requiredFields = baseline.contentCoverageVersion === 1 ? ["problem", "moduleBlueprints", "modules"] : ["goalKeys", "problem", "moduleBlueprints", "modules"];
      for (const field of requiredFields) {
        if (!(field in stage)) {
          rejectRepair("missing_stage_repair_field", `stage.${field}`, `阶段修复必须返回完整的 ${field}。`, stageKey);
        }
      }
      // Only the selected Stage can change. Course goals and all other map data
      // are taken from the server baseline, never reconstructed by the model.
      draft = validateRoadmapInput({
        ...baseline,
        status: "draft",
        stages: baseline.stages.map(entry => entry.key === stageKey
          ? { ...entry, ...stage } as RoadmapStageInput
          : entry)
      });
      draft = { ...draft, learningGoals: baseline.learningGoals };
    } else {
      const returnedDraft = requireRecord(record.draft, "draft");
      draft = validateRoadmapInput(returnedDraft as RoadmapInput);
      if (draft.planningVersion !== 3) {
        rejectRepair("changed_planning_version", "draft.planningVersion", "Map Draft repair must return planningVersion=3.");
      }
      if (draft.baseRevision !== baseline.baseRevision) {
        rejectRepair("changed_map_revision", "draft.baseRevision", "Map Draft repair must preserve baseRevision.");
      }
      contentRevisions = validateContentRevisions(baseline.learningGoals, draft.learningGoals, record.contentRevisions);
      const states = new Map(baseline.stages.map(stage => [stage.key, stage.status]));
      if (draft.stages.length !== baseline.stages.length || draft.stages.some(stage =>
        !states.has(stage.key) || states.get(stage.key) !== stage.status
      )) {
        rejectRepair("changed_stage_state", "draft.stages", "Map Draft repair must preserve each Stage expansion state and stable key.");
      }
      draft = { ...baseline, status: "draft", learningGoals: draft.learningGoals, stages: draft.stages };
    }
    const originalUnits = new Map(baseline.stages.flatMap(s => s.modules.flatMap(m => m.items.map(n => [n.key, n.concept?.learningUnit] as const))));
    const hasLearningUnits = [...originalUnits.values()].some(Boolean);
    const hasScopedUnits = [...originalUnits.values()].some(unit => unit?.version === 2);
    for (const s of draft.stages) for (const m of s.modules) for (const n of m.items) {
      const originalUnit = originalUnits.get(n.key);
      const unit = n.concept?.learningUnit;
      if (originalUnit && !unit) rejectRepair("lost_learning_unit", `concept.${n.key}.learningUnit`, "修复不能丢弃已有节点的新增知识与教学分工。", s.key);
      if (originalUnit?.version === 2 && unit?.version !== 2) rejectRepair("lost_content_contributions", `concept.${n.key}.learningUnit`, "修复不能将 version=2 降级或丢弃已有的具体内容分工。", s.key);
      if (hasLearningUnits && !originalUnits.has(n.key) && (!unit || (hasScopedUnits && unit.version !== 2))) rejectRepair("missing_learning_unit", `concept.${n.key}.learningUnit`, "修复新增的节点也需要当前版本的新增知识与教学分工。", s.key);
    }
    for (const stage of draft.stages) for (const stageModule of stage.modules) for (const ref of stageModule.conceptReferences || []) {
      const originalStage = baseline.stages.find(s => s.key === stage.key);
      const originals = (originalStage?.modules || []).flatMap(m => m.conceptReferences || []).filter(entry => entry.key === ref.key && entry.contentContributions !== undefined);
      if (originals.length && ref.contentContributions === undefined) rejectRepair("lost_reference_contributions", `conceptReferences.${ref.key}.contentContributions`, "修复不能丢弃复用概念已声明的具体内容分工。", stage.key);
    }
    const report = options.criticalPolicy
      ? validateCriticalPlanningReport(record.report, draft)
      : validateMapDraftQualityReport(record.report);
    if (contentRevisions.length) report.contentRevisions = contentRevisions;
    return {
      draft,
      report: options.stageKey
        ? retainOtherStageFindings(report, options.previousReport, baseline, options.stageKey)
        : report
    };
  } catch (error) {
    if (error instanceof AiTaskValidationError) throw error;
    // Domain validation keeps its exact issue paths while becoming eligible
    // for the unified executor's bounded, fully logged structure repair.
    throw new AiTaskValidationError(
      error instanceof Error ? error.message : "地图修复内容校验失败。",
      validationIssues(error)
    );
  }
}
