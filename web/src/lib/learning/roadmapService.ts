import { parseConcept, parseProblem, parseGoals, parseConceptReferences, validateConceptGoals } from "./conceptPlanning";
import { validateLearningUnitOwnership, validateContentContributions } from "./curriculumBoundary";
import type { ConceptProfile, ConceptReference, LearningGoal, StageProblem } from "./roadmapPlanningTypes";
import { prisma } from "../prisma";
import { listKnowledgeRelations } from "./knowledgeService";
import {
  buildReviewSchedule,
  getDaysSince,
  getReviewBucket,
  isReviewDue
} from "./reviewSchedule";
import type { RoadmapModuleBlueprint } from "./roadmapPlanningTypes";
import type { RoadmapSkeletonDraft } from "../ai/tasks";
import {
  checkLayeredRoadmapSkeleton,
  checkLayeredStageCoverage
} from "../ai/roadmapPlanningQuality";

export type RoadmapItemInput = {
  concept?: ConceptProfile;
  planningQuestionKeys?: string[];
  key?: string;
  title?: string;
  keyQuestion?: string | null;
  objective?: string | null;
  prerequisite?: string | null;
  commonMistake?: string | null;
  transferPrompt?: string | null;
  status?: string | null;
  linkedWordId?: string | null;
  prerequisiteKeys?: string[];
  planningQuestionKey?: string | null;
};

export type RoadmapModuleInput = {
  conceptReferences?: ConceptReference[];
  title?: string;
  goal?: string | null;
  items?: RoadmapItemInput[];
};

export type RoadmapStageInput = {
  goalKeys?: string[];
  problem?: StageProblem;
  key?: string;
  title?: string;
  goal?: string | null;
  status?: "planned" | "expanded" | string | null;
  rationale?: string | null;
  moduleDirections?: string[];
  moduleBlueprints?: RoadmapModuleBlueprint[];
  prerequisiteStageKeys?: string[];
  modules?: RoadmapModuleInput[];
};

export type RoadmapInput = {
  contentCoverageVersion?: 1;
  learningGoals?: LearningGoal[];
  title?: string;
  status?: string | null;
  baseRevision?: number | null;
  confirmationReason?: string | null;
  planningVersion?: 2 | 3 | null;
  stages?: RoadmapStageInput[];
};

export function roadmapSkeletonToDraft(
  skeleton: RoadmapSkeletonDraft,
  baseRevision: number
): RoadmapInput {
  if (skeleton.planningVersion !== 3) {
    throw new Error("新路线骨架必须使用 planningVersion=3 的分层蓝图。");
  }
  return {
    planningVersion: 3,
    ...(skeleton.contentCoverageVersion ? {contentCoverageVersion:skeleton.contentCoverageVersion} : {}),
    learningGoals: skeleton.learningGoals,
    title: skeleton.title,
    status: "draft",
    baseRevision,
    stages: skeleton.stages.map((stage) => ({
      key: stage.key,
      goalKeys: stage.goalKeys,
      problem: stage.problem,
      title: stage.title,
      goal: stage.goal,
      status: "planned",
      moduleDirections: stage.coreTopics,
      moduleBlueprints: stage.moduleBlueprints || [],
      prerequisiteStageKeys: stage.prerequisiteStageKeys,
      modules: []
    }))
  };
}

export function roadmapDraftToSkeleton(
  draftInput: RoadmapInput
): RoadmapSkeletonDraft {
  const draft = validateRoadmapInput(draftInput);
  if (draft.planningVersion !== 3) {
    throw new Error("只有 planningVersion=3 的持久化蓝图可以展开 Stage。");
  }
  const titleByKey = new Map(
    draft.stages.map((stage) => [stage.key, stage.title])
  );
  return {
    planningVersion: 3,
    ...(draft.contentCoverageVersion ? {contentCoverageVersion:draft.contentCoverageVersion} : {}),
    learningGoals: draft.learningGoals,
    title: draft.title?.trim() || "领域地图骨架",
    status: "draft",
    stages: draft.stages.map((stage) => ({
      key: stage.key,
      goalKeys: stage.goalKeys,
      problem: stage.problem,
      title: stage.title,
      goal: stage.goal || null,
      coreTopics: stage.moduleDirections,
      prerequisiteStageKeys: stage.prerequisiteStageKeys,
      prerequisiteStageTitles: stage.prerequisiteStageKeys
        .map((key) => titleByKey.get(key))
        .filter((title): title is string => Boolean(title)),
      moduleBlueprints: stage.moduleBlueprints || []
    }))
  };
}

export function mergeRoadmapStageDraft(
  draftInput: RoadmapInput,
  stageKey: string,
  expandedStage: RoadmapStageInput
): ValidatedRoadmapInput {
  const draft = validateRoadmapInput(draftInput);
  if (draft.planningVersion !== 3) {
    throw new Error("旧版路线草稿不能使用分层 Stage 展开流程。");
  }
  const targetIndex = draft.stages.findIndex((stage) => stage.key === stageKey);
  if (targetIndex < 0) {
    throw new Error(`路线蓝图中不存在 Stage "${stageKey}"。`);
  }
  const target = draft.stages[targetIndex];
  const stages = draft.stages.map((stage, index) =>
    index === targetIndex
      ? {
          ...target,
          status: "expanded" as const,
          rationale: expandedStage.rationale || target.rationale || null,
          modules: expandedStage.modules || []
        }
      : stage
  );
  return validateRoadmapInput({ ...draft, status: "draft", stages });
}

export type ValidatedRoadmapItem = Omit<
  RoadmapItemInput,
  | "key"
  | "title"
  | "keyQuestion"
  | "prerequisiteKeys"
  | "planningQuestionKey"
> & {
  key: string;
  title: string;
  keyQuestion: string | null;
  prerequisiteKeys: string[];
  planningQuestionKey: string | null;
};

export type ValidatedRoadmapStage = Omit<RoadmapStageInput, "modules"> & {
  key: string;
  title: string;
  status: "planned" | "expanded";
  moduleDirections: string[];
  prerequisiteStageKeys: string[];
  modules: Array<
    Omit<RoadmapModuleInput, "title" | "items"> & {
      title: string;
      items: ValidatedRoadmapItem[];
    }
  >;
};

export type ValidatedRoadmapInput = Omit<RoadmapInput, "stages"> & {
  stages: ValidatedRoadmapStage[];
};

export type RoadmapConfirmationContext = {
  courseDesignDraftJson?: string;
  expectedCourseDesignAiCallLogId?: string;
  expectedCourseDesignStatus?: "draft" | "confirmed";
  expectedRoadmapDraftJson?: string;
};

export type RoadmapItemLearningInput = {
  userUnderstanding?: string | null;
  coreEssence?: string | null;
  masteryStatus?: string | null;
  isIsland?: boolean | null;
  islandReason?: string | null;
};

export type LearningNodeProgressInput = RoadmapItemLearningInput & {
  markNodeCompleted?: boolean;
};

export type StageAssessmentReadiness =
  | "not_ready"
  | "in_progress"
  | "needs_review"
  | "ready_for_assessment"
  | "completed";

export type StageAssessmentFlaggedItem = {
  itemId: string;
  title: string;
  status: string;
  reason: string;
};

export type StageAssessmentRecordSummary = {
  id: string;
  readiness: string;
  appliedRoadmapStatus: string;
  adjustmentReason: string;
  createdAt: Date;
};

export type StageAssessmentRecordDto = {
  id: string;
  unitId: string;
  readiness: string;
  recommendation: string;
  adjustmentReason: string;
  appliedRoadmapStatus: string;
  flaggedItemsSummary: string | null;
  nextActionsSummary: string | null;
  createdAt: Date;
};

export type StageAssessmentSummary = {
  stageId: string;
  stageTitle: string;
  stageGoal: string | null;
  readiness: StageAssessmentReadiness;
  recommendation: string;
  totalItems: number;
  startedItems: number;
  recallReadyItems: number;
  solidItems: number;
  reviewNeededItems: number;
  islandItems: number;
  diagnosedItems: number;
  reviewedItems: number;
  coreCapturedItems: number;
  flaggedItems: StageAssessmentFlaggedItem[];
  nextActions: string[];
  latestRecord: StageAssessmentRecordSummary | null;
};

export type LongTermReviewQueueEntry = {
  wordId: string;
  text: string;
  masteryStatus: string;
  isIsland: boolean;
  islandReason: string | null;
  lastReviewedAt: Date | null;
  nextReviewAt: Date;
  reviewIntervalDays: number | null;
  dueBucket: "overdue" | "due_today" | "upcoming";
  roadmapItemId: string | null;
  roadmapItemTitle: string | null;
};

export type LongTermIslandEntry = {
  wordId: string;
  text: string;
  islandReason: string | null;
  dormantDays: number;
  nextReviewAt: Date | null;
  roadmapItemId: string | null;
  roadmapItemTitle: string | null;
};

export type WeakRelationEntry = {
  relationId: string;
  relationType: string;
  status: string;
  evidenceStrength: string;
  fromWordId: string;
  fromWordText: string;
  toWordId: string;
  toWordText: string;
  createdAt: Date;
};

export type LongTermReviewSummary = {
  generatedAt: Date;
  overdueCount: number;
  dueTodayCount: number;
  upcomingCount: number;
  longTermIslandCount: number;
  weakRelationCount: number;
  queue: LongTermReviewQueueEntry[];
  longTermIslands: LongTermIslandEntry[];
  weakRelations: WeakRelationEntry[];
  nextActions: string[];
};

const normalizeOptional = (value?: string | null) => {
  const next = value?.trim();
  return next ? next : null;
};

const normalizeTitle = (value: string | undefined, fallback: string) => {
  const next = value?.trim();
  return next || fallback;
};

const normalizeStringList = (values?: string[]) =>
  Array.from(
    new Set((values || []).map((value) => value.trim()).filter(Boolean))
  );

const normalizeModuleBlueprints = (
  modules?: RoadmapModuleBlueprint[]
): RoadmapModuleBlueprint[] =>
  (modules || []).map((module) => ({
    key: module.key?.trim() || "",
    title: module.title?.trim() || "",
    goal: module.goal?.trim() || "",
    goalKeys: normalizeStringList(module.goalKeys),
    keyQuestions: (module.keyQuestions || []).map((question) => ({
      ...(question.contentQuestionKey ? {contentQuestionKey:question.contentQuestionKey.trim(),contentRequirements:question.contentRequirements,dimensionKeys:question.dimensionKeys} : {}),
      key: question.key?.trim() || "",
      goalKeys: normalizeStringList(question.goalKeys),
      question: question.question?.trim() || "",
      checkableOutcome: question.checkableOutcome?.trim() || ""
    }))
  }));

const parseStringArray = (value?: string | null) => {
  if (!value?.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return [];
  }
};

const parseModuleBlueprints = (value?: string | null) => {
  if (!value?.trim()) return [];
  try {
    const parsed = JSON.parse(value) as RoadmapModuleBlueprint[];
    return normalizeModuleBlueprints(Array.isArray(parsed) ? parsed : []);
  } catch {
    return [];
  }
};

const assertAcyclic = (
  keys: string[],
  prerequisitesByKey: Map<string, string[]>,
  label: string
) => {
  const visiting = new Set<string>();
  const visited = new Set<string>();

  const visit = (key: string) => {
    if (visiting.has(key)) {
      throw new Error(`${label}前置关系存在循环：${key}`);
    }
    if (visited.has(key)) return;
    visiting.add(key);
    for (const prerequisiteKey of prerequisitesByKey.get(key) || []) {
      visit(prerequisiteKey);
    }
    visiting.delete(key);
    visited.add(key);
  };

  for (const key of keys) visit(key);
};

export function validateRoadmapInput(
  input: RoadmapInput
): ValidatedRoadmapInput {
  if(input.contentCoverageVersion !== undefined && input.contentCoverageVersion !== 1) throw new Error("内容覆盖协议版本不支持。");
  const learningGoals = parseGoals(input.learningGoals);
  const contentCoverageVersion = input.contentCoverageVersion === 1 || learningGoals.some(goal=>goal.contentQuestions !== undefined) ? 1 as const : undefined;
  const seenStageKeys = new Set<string>();
  const seenNodeKeys = new Set<string>();

  const stages = (input.stages || []).map((stage, stageIndex) => {
    const key = stage.key?.trim();
    if (!key) {
      throw new Error(`阶段 ${stageIndex + 1} 缺少稳定 key。`);
    }
    if (seenStageKeys.has(key)) throw new Error(`阶段 key 重复：${key}`);
    seenStageKeys.add(key);

    const status = stage.status === "planned" ? "planned" : "expanded";
    const modules =
      status === "planned"
        ? []
        : (stage.modules || []).map((roadmapModule, moduleIndex) => ({
            ...roadmapModule,
            conceptReferences: parseConceptReferences(roadmapModule.conceptReferences),
            title: normalizeTitle(
              roadmapModule.title,
              `模块 ${moduleIndex + 1}`
            ),
            items: (roadmapModule.items || []).map((item, itemIndex) => {
              const itemKey = item.key?.trim();
              if (!itemKey) {
                throw new Error(
                  `阶段 ${key} 的模块 ${moduleIndex + 1} 节点 ${itemIndex + 1} 缺少稳定 key。`
                );
              }
              if (seenNodeKeys.has(itemKey)) {
                throw new Error(`节点 key 重复：${itemKey}`);
              }
              seenNodeKeys.add(itemKey);
              const title = normalizeTitle(item.title, `知识点 ${itemIndex + 1}`);
              const keyQuestion = normalizeOptional(item.keyQuestion);
              if (!keyQuestion) {
                throw new Error(`节点 ${title} 缺少可验证的核心问题。`);
              }
              const objective = normalizeOptional(item.objective);
              if (input.planningVersion === 3 && !objective) {
                throw new Error(`节点 ${title} 缺少具体学习目标。`);
              }
              if (input.planningVersion === 3 && (!item.concept?.name?.trim() || !item.concept.scope?.trim() || !item.concept.problemRole?.trim() || !item.planningQuestionKeys?.length)) {
                throw new Error(`概念节点 ${title} 缺少教学范围、整体作用或规划问题归属。`);
              }
              return {
                ...item,
                key: itemKey,
                title,
                keyQuestion,
                objective,
                prerequisiteKeys: normalizeStringList(item.prerequisiteKeys),
                concept: item.concept ? parseConcept(item.concept) : undefined,
                planningQuestionKeys: normalizeStringList(item.planningQuestionKeys),
                planningQuestionKey: normalizeOptional(item.planningQuestionKey)
              };
            })
          }));

    return {
      ...stage,
      key,
      title: normalizeTitle(stage.title, `阶段 ${stageIndex + 1}`),
      status,
      moduleDirections: normalizeStringList(stage.moduleDirections),
      moduleBlueprints: normalizeModuleBlueprints(stage.moduleBlueprints),
      prerequisiteStageKeys: normalizeStringList(stage.prerequisiteStageKeys),
      modules
    } satisfies ValidatedRoadmapStage;
  });

  const stagePrerequisites = new Map<string, string[]>();
  for (const stage of stages) {
    for (const prerequisiteKey of stage.prerequisiteStageKeys) {
      if (!seenStageKeys.has(prerequisiteKey)) {
        throw new Error(
          `阶段 ${stage.key} 引用了不存在的前置阶段 ${prerequisiteKey}。`
        );
      }
      if (prerequisiteKey === stage.key) {
        throw new Error(`阶段 ${stage.key} 不能依赖自身。`);
      }
    }
    stagePrerequisites.set(stage.key, stage.prerequisiteStageKeys);
  }
  assertAcyclic([...seenStageKeys], stagePrerequisites, "阶段");

  const nodePrerequisites = new Map<string, string[]>();
  for (const stage of stages) {
    for (const roadmapModule of stage.modules) {
      for (const item of roadmapModule.items) {
        for (const prerequisiteKey of item.prerequisiteKeys) {
          if (!seenNodeKeys.has(prerequisiteKey)) {
            throw new Error(
              `节点 ${item.key} 引用了不存在的前置节点 ${prerequisiteKey}。`
            );
          }
          if (prerequisiteKey === item.key) {
            throw new Error(`节点 ${item.key} 不能依赖自身。`);
          }
        }
        nodePrerequisites.set(item.key, item.prerequisiteKeys);
      }
    }
  }
  assertAcyclic([...seenNodeKeys], nodePrerequisites, "地图");

  if (input.planningVersion === 3) {
    validateConceptGoals({learningGoals,stages,contentCoverageVersion});
    validateLearningUnitOwnership(stages);
    validateContentContributions({ learningGoals, stages });
    const names = new Set<string>();
    for(const stage of stages) for(const stageModule of stage.modules) {
      for(const item of stageModule.items) {const name=item.concept?.name.trim().toLocaleLowerCase(); if(name && names.has(name)) throw new Error(`概念 ${name} 重复，请复用既有概念。`); if(name) names.add(name);}
      for(const ref of stageModule.conceptReferences || []) if(!seenNodeKeys.has(ref.key) || !ref.problemRole) throw new Error(`复用概念 ${ref.key} 不存在或缺少作用说明。`);
    }
    const layered = checkLayeredRoadmapSkeleton({
      planningVersion: 3,
      title: normalizeTitle(input.title, "AI 生成学习路线图草稿"),
      status: "draft",
      stages: stages.map((stage) => ({
        key: stage.key,
      goalKeys: stage.goalKeys,
      problem: stage.problem,
        title: stage.title,
        goal: stage.goal,
        coreTopics: stage.moduleDirections,
        prerequisiteStageTitles: [],
        prerequisiteStageKeys: stage.prerequisiteStageKeys,
        moduleBlueprints: stage.moduleBlueprints || []
      }))
    });
    if (layered.errors.length) {
      throw new Error(layered.errors.map((issue) => issue.message).join(" "));
    }

    for (const stage of stages) {
      if (stage.status !== "expanded") continue;
      const coverage = checkLayeredStageCoverage(
        {
          key: stage.key,
      goalKeys: stage.goalKeys,
      problem: stage.problem,
          title: stage.title,
          goal: stage.goal,
          coreTopics: stage.moduleDirections,
          prerequisiteStageTitles: [],
          prerequisiteStageKeys: stage.prerequisiteStageKeys,
          moduleBlueprints: stage.moduleBlueprints || []
        },
        stage
      );
      if (coverage.errors.length) {
        throw new Error(coverage.errors.map((issue) => issue.message).join(" "));
      }
    }
  }

  return {
    ...input,
    learningGoals,
    ...(contentCoverageVersion ? {contentCoverageVersion} : {}),
    ...(input.planningVersion === 3 ? { planningVersion: 3 as const } : {}),
    stages
  };
}

const inferLearningNodeType = (item: RoadmapItemInput) => {
  const title = (item.title || "").toLowerCase();
  const joined = [
    item.title,
    item.objective,
    item.keyQuestion,
    item.transferPrompt
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (title.includes("diagnostic") || title.includes("assessment")) {
    return "diagnostic";
  }
  if (title.includes("review") || title.includes("recap")) return "review";
  if (title.includes("challenge") || joined.includes("transfer")) {
    return "challenge";
  }
  if (title.includes("remedial") || title.includes("repair")) return "remedial";
  if (title.includes("milestone")) return "milestone";
  if (title.includes("practice") || title.includes("exercise")) return "practice";
  return "knowledge";
};

const toLearningNodeStatus = (status?: string | null) => {
  const next = status?.trim() || "not_started";
  if (next === "skipped") return "skipped";
  if (next === "suggested") return "suggested";
  if (next === "available" || next === "next") return "available";
  if (next === "in_progress" || next === "seen" || next === "can_recall") {
    return "in_progress";
  }
  if (next === "completed" || next === "can_apply") return "completed";
  if (next === "mastered" || next === "can_transfer" || next === "integrated") {
    return "mastered";
  }
  if (next === "needs_review" || next === "island") return "needs_review";
  return "locked";
};

const toLegacyRoadmapItemStatus = (status?: string | null) => {
  const next = status?.trim() || "locked";
  if (next === "in_progress") return "seen";
  if (next === "completed") return "can_apply";
  if (next === "mastered") return "integrated";
  if (next === "needs_review") return "needs_review";
  if (next === "skipped") return "skipped";
  return "not_started";
};

const solidStatuses = new Set(["can_apply", "can_transfer", "integrated"]);
const recallReadyStatuses = new Set([
  "can_recall",
  "can_apply",
  "can_transfer",
  "integrated"
]);
const reviewNeededStatuses = new Set(["needs_review", "island"]);

function buildStageAdjustmentReason(stage: StageAssessmentSummary) {
  const topFlags = stage.flaggedItems
    .slice(0, 3)
    .map((item) => `${item.title}: ${item.reason}`);
  const actionSummary = stage.nextActions.slice(0, 3);

  return [
    stage.recommendation,
    topFlags.length ? `重点问题: ${topFlags.join("; ")}` : "",
    actionSummary.length ? `下一步: ${actionSummary.join("; ")}` : ""
  ]
    .filter(Boolean)
    .join("\n");
}

function toStageAssessmentRecordDto(record: {
  id: string;
  unitId: string;
  readiness: string;
  recommendation: string;
  adjustmentReason: string;
  appliedRoadmapStatus: string;
  flaggedItemsSummary: string | null;
  nextActionsSummary: string | null;
  createdAt: Date;
}): StageAssessmentRecordDto {
  return {
    id: record.id,
    unitId: record.unitId,
    readiness: record.readiness,
    recommendation: record.recommendation,
    adjustmentReason: record.adjustmentReason,
    appliedRoadmapStatus: record.appliedRoadmapStatus,
    flaggedItemsSummary: record.flaggedItemsSummary,
    nextActionsSummary: record.nextActionsSummary,
    createdAt: record.createdAt
  };
}

export async function getRoadmapByDomain(domainId: string) {
  const [domain, units, nodes] = await prisma.$transaction([
    prisma.domain.findUnique({
      where: { id: domainId },
      select: {
        id: true,
        name: true,
        roadmapTitle: true,
        learningGoalsJson: true,
        roadmapStatus: true,
        roadmapDraftJson: true,
        roadmapDraftCourseDesignAiCallLogId: true,
        mapRevision: true
      }
    }),
    prisma.unit.findMany({
      where: { domainId },
      orderBy: { orderIndex: "asc" },
      include: {
        assessmentRecords: {
          orderBy: { createdAt: "desc" },
          take: 1
        }
      }
    }),
    prisma.learningNode.findMany({
      where: { domainId },
      orderBy: { orderIndex: "asc" },
      include: {
        dependencies: {
          include: {
            prerequisite: {
              select: { id: true, mapKey: true }
            }
          }
        },
        knowledgePoint: {
          select: {
            id: true,
            title: true,
            masteryStatus: true,
            isIsland: true
          }
        }
      }
    })
  ]);

  if (!domain) return null;

  return {
    id: domain.id,
    title: normalizeTitle(domain.roadmapTitle || undefined, `${domain.name} 学习路线图`),
    status: domain.roadmapStatus || "draft",
    mapRevision: domain.mapRevision,
    learningGoals: parseGoals(JSON.parse(domain.learningGoalsJson || "[]")),
    ...(parseGoals(JSON.parse(domain.learningGoalsJson || "[]")).some(goal=>goal.contentQuestions !== undefined)?{contentCoverageVersion:1 as const}:{}),
    planningVersion: units.some((unit) => Boolean(unit.planningBlueprintJson))
      ? (3 as const)
      : null,
    draftCourseDesignAiCallLogId:
      domain.roadmapDraftCourseDesignAiCallLogId,
    draft: domain.roadmapDraftJson
      ? JSON.parse(domain.roadmapDraftJson)
      : null,
    stages: units.map((unit) => {
      const stageNodes = nodes.filter((node) => node.unitId === unit.id);
      const savedModules: {title:string;goal?:string|null;conceptReferences?:ConceptReference[]}[] = JSON.parse(unit.teachingPlanJson || "{}").modules || [];
      const modules = Array.from(
        new Map(
          stageNodes.map((node) => [
            `${node.moduleOrderIndex ?? 0}:${node.moduleTitle || "默认模块"}`,
            {
              id: `${unit.id}:${node.moduleOrderIndex ?? 0}`,
              title: node.moduleTitle || "默认模块",
              goal: null,
              orderIndex: node.moduleOrderIndex ?? 0
            }
          ])
        ).values()
      )
        .sort((left, right) => left.orderIndex - right.orderIndex)
        .map((module) => ({
          ...module,
          items: stageNodes
            .filter(
              (node) =>
                (node.moduleOrderIndex ?? 0) === module.orderIndex &&
                (node.moduleTitle || "默认模块") === module.title
            )
            .map((node, itemIndex) => ({
              id: node.id,
              key: node.mapKey || node.id,
              title: node.title,
              keyQuestion: node.keyQuestion,
              objective: node.objective,
              prerequisite: node.prerequisite,
              prerequisiteKeys: node.dependencies.map(
                (dependency) =>
                  dependency.prerequisite.mapKey || dependency.prerequisite.id
              ),
              commonMistake: node.commonMistake,
              transferPrompt: node.transferPrompt,
              planningQuestionKey: node.planningQuestionKey,
              planningQuestionKeys: parseStringArray(node.planningQuestionKeysJson),
              concept: parseConcept(JSON.parse(node.conceptJson || "{}")),
              status: node.knowledgePoint?.masteryStatus || toLegacyRoadmapItemStatus(node.status),
              orderIndex: itemIndex,
              linkedWord: node.knowledgePoint
                ? {
                    id: node.knowledgePoint.id,
                    text: node.knowledgePoint.title,
                    masteryStatus: node.knowledgePoint.masteryStatus,
                    isIsland: node.knowledgePoint.isIsland
                  }
                : null
            }))
        }));

      return {
        id: unit.id,
        key: unit.mapKey || unit.id,
        roadmapId: domain.id,
        title: unit.title,
        goal: unit.goal,
        status: unit.status === "planned" ? "planned" : "expanded",
        rationale: unit.rationale,
        moduleDirections: parseStringArray(unit.moduleDirectionsJson),
        moduleBlueprints: parseModuleBlueprints(unit.planningBlueprintJson),
        prerequisiteStageKeys: parseStringArray(
          unit.prerequisiteStageKeysJson
        ),
        orderIndex: unit.orderIndex,
        assessmentRecords: unit.assessmentRecords,
        ...JSON.parse(unit.teachingPlanJson || "{}"),
        modules: [...modules.map(m=>({...m,conceptReferences:savedModules.find(saved=>saved.title===m.title)?.conceptReferences || []})),...savedModules.filter(m=>!modules.some(actual=>actual.title===m.title)).map((m,i)=>({...m,id:`${unit.id}:reference:${i}`,orderIndex:modules.length+i,items:[]}))]
      };
    })
  };
}

export async function saveRoadmapDraft(
  domainId: string,
  input: RoadmapInput,
  expectedCourseDesignAiCallLogId?: string | null,
  options: { expectedCurrentDraft?: RoadmapInput | null } = {}
) {
  if (input.planningVersion !== 3) throw new Error("新课程须采用新版教学单元规划，请重新生成课程骨架。");
  const domain = await prisma.domain.findUnique({
    where: { id: domainId },
    select: {
      id: true,
      mapRevision: true,
      taskBriefConfirmedAt: true,
      courseDesignStatus: true,
      courseDesignAiCallLogId: true,
      roadmapDraftJson: true
    }
  });

  if (!domain) throw new Error("学习领域不存在");
  if (!domain.taskBriefConfirmedAt) {
    throw new Error("请先确认任务书，再保存领域地图草稿。");
  }
  const courseDesignAiCallLogId =
    expectedCourseDesignAiCallLogId ||
    (domain.courseDesignStatus === "confirmed"
      ? domain.courseDesignAiCallLogId
      : null);
  if (
    !courseDesignAiCallLogId ||
    domain.courseDesignAiCallLogId !== courseDesignAiCallLogId ||
    !["draft", "confirmed"].includes(domain.courseDesignStatus)
  ) {
    throw new Error("课程设计方向已更新，请重新生成领域地图草稿。");
  }
  if (domain.mapRevision > 0 && input.baseRevision == null) {
    throw new Error("已有正式地图的草稿必须携带 baseRevision。");
  }
  if (
    input.baseRevision !== undefined &&
    input.baseRevision !== null &&
    input.baseRevision !== domain.mapRevision
  ) {
    throw new Error(
      `地图已更新，请刷新后重试。当前版本 ${domain.mapRevision}，请求版本 ${input.baseRevision}。`
    );
  }

  const draft = validateRoadmapInput({
    ...input,
    baseRevision: domain.mapRevision
  });
  const saved = await prisma.domain.updateMany({
    where: {
      id: domainId,
      mapRevision: domain.mapRevision,
      taskBriefConfirmedAt: { not: null },
      courseDesignStatus: domain.courseDesignStatus,
      courseDesignAiCallLogId,
      ...("expectedCurrentDraft" in options
        ? {
            roadmapDraftJson:
              options.expectedCurrentDraft === null
                ? null
                : JSON.stringify(options.expectedCurrentDraft)
          }
        : {})
    },
    data: {
      roadmapDraftJson: JSON.stringify(draft),
      roadmapDraftCourseDesignAiCallLogId: courseDesignAiCallLogId,
      roadmapStatus: "draft"
    }
  });
  if (saved.count !== 1) {
    throw new Error("地图已更新或草稿已被编辑，请刷新后重试。");
  }

  return {
    domainId,
    mapRevision: domain.mapRevision,
    courseDesignAiCallLogId,
    draft
  };
}

export async function replaceRoadmap(
  domainId: string,
  input: RoadmapInput,
  confirmation: RoadmapConfirmationContext = {}
) {
  if (input.planningVersion !== 3) throw new Error("正式地图须使用已审查的教学单元规划。");
  const domain = await prisma.domain.findUnique({
    where: { id: domainId },
    select: { id: true, name: true, mapRevision: true }
  });

  if (!domain) {
    throw new Error("学习领域不存在");
  }
  if (domain.mapRevision > 0 && input.baseRevision == null) {
    throw new Error("已有正式地图的修改必须携带 baseRevision。");
  }

  if (
    input.baseRevision !== undefined &&
    input.baseRevision !== null &&
    input.baseRevision !== domain.mapRevision
  ) {
    throw new Error(
      `地图已更新，请刷新后重试。当前版本 ${domain.mapRevision}，请求版本 ${input.baseRevision}。`
    );
  }

  const validated = validateRoadmapInput(input);
  const stages = validated.stages;
  const [existingUnits, existingNodes] = await Promise.all([
    prisma.unit.findMany({ where: { domainId } }),
    prisma.learningNode.findMany({
      where: { domainId },
      select: {
        id: true,
        mapKey: true,
        status: true,
        knowledgePointId: true,
        unitId: true
      }
    })
  ]);

  const desiredNodeKeys = new Set(
    stages.flatMap((stage) =>
      stage.modules.flatMap((roadmapModule) =>
        roadmapModule.items.map((item) => item.key)
      )
    )
  );
  const removedLearnedNode = existingNodes.find(
    (node) =>
      !desiredNodeKeys.has(node.mapKey || node.id) &&
      (Boolean(node.knowledgePointId) ||
        !["locked", "available", "suggested"].includes(node.status))
  );
  if (removedLearnedNode) {
    throw new Error(
      `已沉淀或已开始的节点 ${removedLearnedNode.mapKey || removedLearnedNode.id} 不能从首版地图删除。`
    );
  }

  await prisma.$transaction(async (tx) => {
    const revisionClaim = await tx.domain.updateMany({
      where: {
        id: domainId,
        mapRevision: domain.mapRevision,
        ...(confirmation.expectedCourseDesignAiCallLogId &&
        confirmation.expectedCourseDesignStatus
          ? {
              taskBriefConfirmedAt: { not: null },
              courseDesignStatus: confirmation.expectedCourseDesignStatus,
              courseDesignAiCallLogId:
                confirmation.expectedCourseDesignAiCallLogId
            }
          : {}),
        ...(confirmation.expectedCourseDesignAiCallLogId &&
        confirmation.expectedRoadmapDraftJson
          ? {
              roadmapStatus: "draft",
              roadmapDraftJson: confirmation.expectedRoadmapDraftJson,
              roadmapDraftCourseDesignAiCallLogId:
                confirmation.expectedCourseDesignAiCallLogId
            }
          : {})
      },
      data: {
        roadmapTitle: normalizeTitle(validated.title, `${domain.name} 学习路线图`),
        roadmapStatus: validated.status?.trim() || "draft",
        roadmapDraftJson: null,
        learningGoalsJson: JSON.stringify(validated.learningGoals || []),
        roadmapDraftCourseDesignAiCallLogId: null,
        mapRevision: { increment: 1 },
        ...(confirmation.courseDesignDraftJson
          ? {
              courseDesignDraft: confirmation.courseDesignDraftJson,
              courseDesignStatus: "confirmed",
              courseDesignConfirmedAt: new Date()
            }
          : {})
      }
    });
    if (revisionClaim.count !== 1) {
      throw new Error("地图已更新，请刷新后重试。");
    }

    if (existingUnits.length) {
      await tx.unit.updateMany({
        where: { domainId },
        data: { orderIndex: { increment: 1000000 } }
      });
    }

    const existingUnitByKey = new Map(
      existingUnits.map((unit) => [unit.mapKey || unit.id, unit])
    );
    const unitIdByKey = new Map<string, string>();

    for (const [stageIndex, stage] of stages.entries()) {
      const unitData = {
        title: stage.title,
        goal: normalizeOptional(stage.goal),
        rationale: normalizeOptional(stage.rationale),
        moduleDirectionsJson: JSON.stringify(stage.moduleDirections),
        teachingPlanJson: JSON.stringify({goalKeys:stage.goalKeys,problem:stage.problem,modules:stage.modules.map(m=>({title:m.title,goal:m.goal,conceptReferences:m.conceptReferences || []}))}),
        planningBlueprintJson:
          validated.planningVersion === 3
            ? JSON.stringify(stage.moduleBlueprints || [])
            : null,
        prerequisiteStageKeysJson: JSON.stringify(
          stage.prerequisiteStageKeys
        ),
        orderIndex: stageIndex,
        status: stage.status
      };
      const existingUnit = existingUnitByKey.get(stage.key);
      const savedUnit = existingUnit
        ? await tx.unit.update({
            where: { id: existingUnit.id },
            data: unitData
          })
        : await tx.unit.create({
            data: {
              ...unitData,
              mapKey: stage.key,
              domainId
            }
          });
      unitIdByKey.set(stage.key, savedUnit.id);
    }

    const existingNodeByKey = new Map(
      existingNodes.map((node) => [node.mapKey || node.id, node])
    );
    const nodeIdByKey = new Map<string, string>();

    for (const [stageIndex, stage] of stages.entries()) {
      const unitId = unitIdByKey.get(stage.key);
      if (!unitId) throw new Error(`阶段 ${stage.key} 保存失败。`);

      for (const [moduleIndex, roadmapModule] of stage.modules.entries()) {
        for (const [itemIndex, item] of roadmapModule.items.entries()) {
          const existingNode = existingNodeByKey.get(item.key);
          const nodeData = {
            unitId,
            moduleTitle: roadmapModule.title,
            moduleOrderIndex: moduleIndex,
            title: item.title,
            nodeType: validated.planningVersion === 3 ? "knowledge" : inferLearningNodeType(item),
            objective: normalizeOptional(item.objective),
            keyQuestion: item.keyQuestion,
            prerequisite: normalizeOptional(item.prerequisite),
            commonMistake: normalizeOptional(item.commonMistake),
            transferPrompt: normalizeOptional(item.transferPrompt),
            planningQuestionKey: null,
            planningQuestionKeysJson: JSON.stringify(item.planningQuestionKeys || []),
            conceptJson: JSON.stringify(item.concept || null),
            orderIndex:
              stageIndex * 1000000 + moduleIndex * 10000 + itemIndex
          };
          const savedNode = existingNode
            ? await tx.learningNode.update({
                where: { id: existingNode.id },
                data: nodeData
              })
            : await tx.learningNode.create({
                data: {
                  ...nodeData,
                  domainId,
                  mapKey: item.key,
                  status: "available",
                  knowledgePointId: null
                }
              });
          nodeIdByKey.set(item.key, savedNode.id);
        }
      }
    }

    const removedNodeIds = existingNodes
      .filter((node) => !desiredNodeKeys.has(node.mapKey || node.id))
      .map((node) => node.id);
    if (removedNodeIds.length) {
      const newlyProtectedNode = await tx.learningNode.findFirst({
        where: {
          id: { in: removedNodeIds },
          OR: [
            { knowledgePointId: { not: null } },
            { status: { notIn: ["locked", "available", "suggested"] } }
          ]
        },
        select: { id: true, mapKey: true }
      });
      if (newlyProtectedNode) {
        throw new Error(
          `已沉淀或已开始的节点 ${newlyProtectedNode.mapKey || newlyProtectedNode.id} 不能从首版地图删除。`
        );
      }
      await tx.learningNode.deleteMany({
        where: { id: { in: removedNodeIds } }
      });
    }

    const desiredStageKeys = new Set(stages.map((stage) => stage.key));
    const removedUnitIds = existingUnits
      .filter((unit) => !desiredStageKeys.has(unit.mapKey || unit.id))
      .map((unit) => unit.id);
    if (removedUnitIds.length) {
      await tx.unit.deleteMany({ where: { id: { in: removedUnitIds } } });
    }

    const allNodeIds = [...nodeIdByKey.values()];
    if (allNodeIds.length) {
      await tx.learningNodeDependency.deleteMany({
        where: { nodeId: { in: allNodeIds } }
      });
    }

    for (const stage of stages) {
      for (const roadmapModule of stage.modules) {
        for (const item of roadmapModule.items) {
          const nodeId = nodeIdByKey.get(item.key);
          if (!nodeId) throw new Error(`节点 ${item.key} 保存失败。`);
          for (const prerequisiteKey of item.prerequisiteKeys) {
            const prerequisiteId = nodeIdByKey.get(prerequisiteKey);
            if (!prerequisiteId) {
              throw new Error(`前置节点 ${prerequisiteKey} 保存失败。`);
            }
            await tx.learningNodeDependency.create({
              data: { nodeId, prerequisiteId }
            });
          }
        }
      }
    }

    const confirmationReason = normalizeOptional(validated.confirmationReason);
    if (confirmation.courseDesignDraftJson) {
      await tx.aiCallLog.create({
        data: {
          domainId,
          canvasId: domainId,
          taskType: "course_design_research",
          provider: "user",
          status: "success",
          inputSummary: "Course design direction confirmed by user.",
          outputSummary: "Course design and complete Stage skeleton were confirmed together."
        }
      });
    }
    if (confirmationReason) {
      await tx.aiCallLog.create({
        data: {
          canvasId: domainId,
          taskType: "roadmap_generation",
          provider: "user",
          status: "success",
          inputSummary:
            "Domain map confirmed by user after task brief confirmation.",
          outputSummary: confirmationReason
        }
      });
    }
  });

  const roadmap = await getRoadmapByDomain(domainId);
  if (!roadmap) {
    throw new Error("学习路线图保存失败");
  }

  return roadmap;
}

const toCompatKnowledgeWord = (point: {
  id: string;
  domainId: string;
  title: string;
  language?: string | null;
  sentenceSample?: string | null;
  coreEssence?: string | null;
  userUnderstanding?: string | null;
  masteryStatus: string;
  isIsland: boolean;
  islandReason?: string | null;
  lastReviewedAt?: Date | null;
  nextReviewAt?: Date | null;
  reviewIntervalDays?: number | null;
}) => ({
  id: point.id,
  text: point.title,
  language: point.language || "und",
  sentenceSample: point.sentenceSample || null,
  masteryStatus: point.masteryStatus,
  isIsland: point.isIsland,
  islandReason: point.islandReason || null,
  userUnderstanding: point.userUnderstanding || null,
  lastReviewedAt: point.lastReviewedAt || null,
  nextReviewAt: point.nextReviewAt || null,
  reviewIntervalDays: point.reviewIntervalDays ?? null,
  canvasId: point.domainId,
  coreEssences: point.coreEssence
    ? [
        {
          id: point.id,
          wordId: point.id,
          summary: point.coreEssence,
          rationale: null
        }
      ]
    : []
});

export async function getRoadmapItemForLearning(itemId: string) {
  const item = await prisma.learningNode.findUnique({
    where: { id: itemId },
    include: {
      knowledgePoint: true,
      domain: true,
      unit: true
    }
  });

  if (!item) return null;

  const linkedWord = item.knowledgePoint
    ? toCompatKnowledgeWord(item.knowledgePoint)
    : null;

  return {
    id: item.id,
    title: item.title,
    keyQuestion: item.keyQuestion,
    objective: item.objective,
    prerequisite: item.prerequisite,
    commonMistake: item.commonMistake,
    transferPrompt: item.transferPrompt,
    status: item.status,
    linkedWord,
    module: {
      id: `${item.unitId || "ungrouped"}:${item.moduleOrderIndex ?? 0}`,
      title: item.moduleTitle || item.unit?.title || "默认模块",
      stage: {
        id: item.unitId,
        title: item.unit?.title || "未分组单元",
        roadmap: {
          id: item.domainId,
          title: `${item.domain.name} 学习路线图`,
          canvas: item.domain
        }
      }
    }
  };
}

export async function saveRoadmapItemLearning(
  itemId: string,
  input: LearningNodeProgressInput
) {
  const item = await prisma.learningNode.findUnique({
    where: { id: itemId },
    include: {
      knowledgePoint: true
    }
  });

  if (!item) {
    throw new Error("路线图知识点不存在");
  }

  const point = item.knowledgePoint;

  const isIsland = Boolean(input.isIsland);
  const masteryStatus = isIsland
    ? "island"
    : input.masteryStatus?.trim() || point?.masteryStatus || "not_started";
  const nodeProgressStatus = isIsland
    ? input.masteryStatus?.trim() || "can_apply"
    : masteryStatus;
  const userUnderstanding = normalizeOptional(input.userUnderstanding);
  const coreEssence = normalizeOptional(input.coreEssence);
  const schedule = buildReviewSchedule({
    masteryStatus,
    isIsland,
    previousIntervalDays: point?.reviewIntervalDays
  });

  const saved = await prisma.$transaction(async (tx) => {
    const pointData = {
      title: item.title,
      sentenceSample: item.keyQuestion || item.objective || null,
      coreEssence,
      userUnderstanding,
      masteryStatus,
      isIsland,
      islandReason: normalizeOptional(input.islandReason),
      lastReviewedAt: schedule.lastReviewedAt,
      nextReviewAt: schedule.nextReviewAt,
      reviewIntervalDays: schedule.reviewIntervalDays
    };
    const updatedPoint = point
      ? await tx.knowledgePoint.update({
          where: { id: point.id },
          data: pointData
        })
      : await tx.knowledgePoint.create({
          data: {
            id: item.id,
            domainId: item.domainId,
            language: "und",
            ...pointData
          }
        });

    const updatedNode = await tx.learningNode.update({
      where: { id: itemId },
      data: {
        status: input.markNodeCompleted
          ? "completed"
          : toLearningNodeStatus(nodeProgressStatus),
        knowledgePointId: updatedPoint.id
      }
    });

    await tx.knowledgeGraphNode.upsert({
      where: { id: updatedPoint.id },
      create: {
        id: updatedPoint.id,
        domainId: item.domainId,
        knowledgePointId: updatedPoint.id,
        title: updatedPoint.title,
        nodeType: item.nodeType || "knowledge",
        status: isIsland ? "island" : masteryStatus
      },
      update: {
        title: updatedPoint.title,
        nodeType: item.nodeType || "knowledge",
        status: isIsland ? "island" : masteryStatus
      }
    });

    return {
      word: toCompatKnowledgeWord(updatedPoint),
      core: coreEssence
        ? {
            id: updatedPoint.id,
            wordId: updatedPoint.id,
            summary: coreEssence,
            rationale: null
          }
        : null,
      schedule,
      node: updatedNode
    };
  });

  return saved;
}

export async function getLearningNodeForStudy(nodeId: string) {
  return getRoadmapItemForLearning(nodeId);
}

export async function saveLearningNodeProgress(
  nodeId: string,
  input: LearningNodeProgressInput
) {
  return saveRoadmapItemLearning(nodeId, input);
}

export async function getStageAssessmentSummaries(domainId: string) {
  const now = new Date();
  const [domain, units, nodes] = await prisma.$transaction([
    prisma.domain.findUnique({
      where: { id: domainId },
      select: {
        id: true,
        name: true,
        roadmapTitle: true,
        roadmapStatus: true
      }
    }),
    prisma.unit.findMany({
      where: { domainId },
      orderBy: { orderIndex: "asc" },
      include: {
        assessmentRecords: {
          orderBy: { createdAt: "desc" },
          take: 1
        }
      }
    }),
    prisma.learningNode.findMany({
      where: { domainId },
      orderBy: { orderIndex: "asc" },
      include: {
        knowledgePoint: {
          include: {
            coreReviewSessions: {
              orderBy: { createdAt: "desc" },
              take: 1
            }
          }
        },
        diagnosticQuestions: {
          include: {
            answers: {
              orderBy: { createdAt: "desc" },
              take: 1
            }
          }
        }
      }
    })
  ]);

  if (!domain) {
    return { roadmap: null, stages: [] as StageAssessmentSummary[] };
  }

  const stages = units.map((unit) => {
    const items = nodes.filter((node) => node.unitId === unit.id);
    const flaggedItems: StageAssessmentFlaggedItem[] = [];

    let startedItems = 0;
    let recallReadyItems = 0;
    let solidItems = 0;
    let reviewNeededItems = 0;
    let islandItems = 0;
    let diagnosedItems = 0;
    let reviewedItems = 0;
    let coreCapturedItems = 0;

    items.forEach((item) => {
      const status = item.knowledgePoint?.masteryStatus || toLegacyRoadmapItemStatus(item.status);
      const isIsland = Boolean(item.knowledgePoint?.isIsland || status === "island");
      const scheduledReviewDue = isReviewDue(item.knowledgePoint?.nextReviewAt, now);
      const latestCore = item.knowledgePoint?.coreEssence || null;
      const latestReview = item.knowledgePoint?.coreReviewSessions[0] || null;
      const latestAnswer =
        item.diagnosticQuestions
          .flatMap((question) => question.answers)
          .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())[0] ||
        null;

      if (status !== "not_started") startedItems += 1;
      if (recallReadyStatuses.has(status)) recallReadyItems += 1;
      if (solidStatuses.has(status)) solidItems += 1;
      if (reviewNeededStatuses.has(status) || scheduledReviewDue) {
        reviewNeededItems += 1;
      }
      if (isIsland) islandItems += 1;
      if (latestAnswer) diagnosedItems += 1;
      if (latestReview) reviewedItems += 1;
      if (latestCore?.trim()) coreCapturedItems += 1;

      if (status === "not_started") {
        flaggedItems.push({
          itemId: item.id,
          title: item.title,
          status,
          reason: "尚未开始学习"
        });
      } else if (status === "needs_review") {
        flaggedItems.push({
          itemId: item.id,
          title: item.title,
          status,
          reason: "仍需复盘后再确认掌握状态"
        });
      } else if (isIsland) {
        flaggedItems.push({
          itemId: item.id,
          title: item.title,
          status,
          reason: "仍是知识孤岛，缺少可靠连接"
        });
      } else if (scheduledReviewDue) {
        flaggedItems.push({
          itemId: item.id,
          title: item.title,
          status,
          reason: "已到复盘时间，需重新检查回忆、边界和迁移能力"
        });
      } else if (!latestCore?.trim()) {
        flaggedItems.push({
          itemId: item.id,
          title: item.title,
          status,
          reason: "尚未提炼核心要义"
        });
      } else if (latestAnswer?.result === "misconception") {
        flaggedItems.push({
          itemId: item.id,
          title: item.title,
          status,
          reason: "最近诊断显示存在误解"
        });
      } else if (latestAnswer?.result === "partial") {
        flaggedItems.push({
          itemId: item.id,
          title: item.title,
          status,
          reason: "最近诊断显示理解仍不完整"
        });
      }
    });

    const totalItems = items.length;
    let readiness: StageAssessmentReadiness = "not_ready";

    if (totalItems === 0 || startedItems === 0) {
      readiness = "not_ready";
    } else if (
      reviewNeededItems > 0 ||
      flaggedItems.some(
        (item) => item.reason.includes("误解") || item.reason.includes("不完整")
      )
    ) {
      readiness = "needs_review";
    } else if (
      solidItems === totalItems &&
      reviewedItems >= Math.max(1, Math.ceil(totalItems / 2))
    ) {
      readiness = "completed";
    } else if (
      recallReadyItems === totalItems &&
      coreCapturedItems === totalItems
    ) {
      readiness = "ready_for_assessment";
    } else {
      readiness = "in_progress";
    }

    const nextActions: string[] = [];
    if (totalItems === 0) {
      nextActions.push("先为该阶段补充模块和知识点。");
    }
    if (startedItems < totalItems) {
      nextActions.push("优先推进尚未开始的知识点。");
    }
    if (coreCapturedItems < totalItems) {
      nextActions.push("为已学习的知识点补充核心要义。");
    }
    if (diagnosedItems < totalItems) {
      nextActions.push("补齐与该阶段相关的诊断回答。");
    }
    if (reviewedItems < Math.min(totalItems, solidItems)) {
      nextActions.push("对已掌握知识点补做复盘。");
    }
    if (islandItems > 0) {
      nextActions.push("处理长期孤岛，或明确保留理由和边界。");
    }
    if (!nextActions.length) {
      nextActions.push("可以进入阶段测评，或继续做跨知识点迁移训练。");
    }

    const recommendationMap: Record<StageAssessmentReadiness, string> = {
      not_ready: "该阶段还不具备测评条件，先完成基础学习。",
      in_progress: "继续推进知识点学习，并补齐核心、诊断和复盘。",
      needs_review: "先处理误解、孤岛和需复盘知识点，再进行阶段测评。",
      ready_for_assessment:
        "该阶段已经具备阶段测评条件，可以集中做迁移和综合应用。",
      completed: "该阶段已形成较稳定理解，可将路线图维持在已确认状态。"
    };

    const latestRecord = unit.assessmentRecords[0]
      ? {
          id: unit.assessmentRecords[0].id,
          readiness: unit.assessmentRecords[0].readiness,
          appliedRoadmapStatus: unit.assessmentRecords[0].appliedRoadmapStatus,
          adjustmentReason: unit.assessmentRecords[0].adjustmentReason,
          createdAt: unit.assessmentRecords[0].createdAt
        }
      : null;

    return {
      stageId: unit.id,
      stageTitle: unit.title,
      stageGoal: unit.goal,
      readiness,
      recommendation: recommendationMap[readiness],
      totalItems,
      startedItems,
      recallReadyItems,
      solidItems,
      reviewNeededItems,
      islandItems,
      diagnosedItems,
      reviewedItems,
      coreCapturedItems,
      flaggedItems,
      nextActions,
      latestRecord
    } satisfies StageAssessmentSummary;
  });

  return {
    roadmap: {
      id: domain.id,
      title: normalizeTitle(domain.roadmapTitle || undefined, `${domain.name} 学习路线图`),
      status: domain.roadmapStatus || "draft"
    },
    stages
  };
}

export async function getLongTermReviewSummary(
  domainId: string
): Promise<LongTermReviewSummary> {
  const now = new Date();
  const words = await prisma.knowledgePoint.findMany({
    where: {
      domainId,
      OR: [{ nextReviewAt: { not: null } }, { isIsland: true }]
    },
    orderBy: [{ nextReviewAt: "asc" }, { updatedAt: "desc" }],
    include: {
      learningNodes: {
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: {
          id: true,
          title: true
        }
      }
    }
  });

  const weakRelationStatuses = new Set([
    "candidate",
    "weak_evidence",
    "wormhole_candidate",
    "weak_wormhole"
  ]);

  const rawRelations = await listKnowledgeRelations(domainId);

  const queue = words
    .map((word) => {
      const dueBucket = getReviewBucket(word.nextReviewAt, now);
      if (
        !word.nextReviewAt ||
        (dueBucket !== "overdue" &&
          dueBucket !== "due_today" &&
          dueBucket !== "upcoming")
      ) {
        return null;
      }

      return {
        wordId: word.id,
        text: word.title,
        masteryStatus: word.masteryStatus,
        isIsland: word.isIsland,
        islandReason: word.islandReason,
        lastReviewedAt: word.lastReviewedAt,
        nextReviewAt: word.nextReviewAt,
        reviewIntervalDays: word.reviewIntervalDays,
        dueBucket,
        roadmapItemId: word.learningNodes[0]?.id || null,
        roadmapItemTitle: word.learningNodes[0]?.title || null
      } satisfies LongTermReviewQueueEntry;
    })
    .filter((entry): entry is LongTermReviewQueueEntry => Boolean(entry));

  const longTermIslands = words
    .map((word) => {
      if (!word.isIsland) return null;
      const dormantDays = getDaysSince(word.lastReviewedAt || word.createdAt, now) || 0;
      if (dormantDays < 7 && getReviewBucket(word.nextReviewAt, now) === "future") {
        return null;
      }

      return {
        wordId: word.id,
        text: word.title,
        islandReason: word.islandReason,
        dormantDays,
        nextReviewAt: word.nextReviewAt,
        roadmapItemId: word.learningNodes[0]?.id || null,
        roadmapItemTitle: word.learningNodes[0]?.title || null
      } satisfies LongTermIslandEntry;
    })
    .filter((entry): entry is LongTermIslandEntry => Boolean(entry))
    .sort((left, right) => right.dormantDays - left.dormantDays);

  const weakRelations = rawRelations
    .filter(
      (relation) =>
        weakRelationStatuses.has(relation.status) ||
        relation.evidenceStrength === "weak"
    )
    .map(
      (relation) =>
        ({
          relationId: relation.id,
          relationType: relation.relationType,
          status: relation.status,
          evidenceStrength: relation.evidenceStrength,
          fromWordId: relation.fromWordId,
          fromWordText: relation.fromWord.text,
          toWordId: relation.toWordId,
          toWordText: relation.toWord.text,
          createdAt: relation.createdAt
        }) satisfies WeakRelationEntry
    );

  const overdueCount = queue.filter((entry) => entry.dueBucket === "overdue").length;
  const dueTodayCount = queue.filter(
    (entry) => entry.dueBucket === "due_today"
  ).length;
  const upcomingCount = queue.filter(
    (entry) => entry.dueBucket === "upcoming"
  ).length;

  const nextActions: string[] = [];
  if (overdueCount > 0) {
    nextActions.push("优先处理已逾期知识点，重新做主动回忆和迁移检查。");
  }
  if (longTermIslands.length > 0) {
    nextActions.push("回收长期孤岛，补充保留理由、连接尝试或明确边界。");
  }
  if (weakRelations.length > 0) {
    nextActions.push("复查弱依据关系，确认、降级或删除站不住的连接。");
  }
  if (!nextActions.length && queue.length > 0) {
    nextActions.push("本周按队列做轻量复盘，保持长期记忆活性。");
  }
  if (!nextActions.length) {
    nextActions.push("当前长期复盘压力较低，可继续推进新的知识点学习。");
  }

  return {
    generatedAt: now,
    overdueCount,
    dueTodayCount,
    upcomingCount,
    longTermIslandCount: longTermIslands.length,
    weakRelationCount: weakRelations.length,
    queue,
    longTermIslands,
    weakRelations,
    nextActions
  };
}

export async function applyStageAssessment(domainId: string, stageId: string) {
  const data = await getStageAssessmentSummaries(domainId);
  const stage = data.stages.find((entry) => entry.stageId === stageId);

  if (!data.roadmap) {
    throw new Error("学习路线图不存在");
  }

  if (!stage) {
    throw new Error("阶段不存在");
  }

  const nextRoadmapStatus =
    stage.readiness === "ready_for_assessment" || stage.readiness === "completed"
      ? "confirmed"
      : "adjusting";

  const adjustmentReason = buildStageAdjustmentReason(stage);

  const result = await prisma.$transaction(async (tx) => {
    const roadmap = await tx.domain.update({
      where: { id: domainId },
      data: { roadmapStatus: nextRoadmapStatus }
    });

    const record = await tx.unitAssessmentRecord.create({
      data: {
        unitId: stage.stageId,
        readiness: stage.readiness,
        recommendation: stage.recommendation,
        adjustmentReason,
        appliedRoadmapStatus: nextRoadmapStatus,
        flaggedItemsSummary: stage.flaggedItems.length
          ? JSON.stringify(stage.flaggedItems)
          : null,
        nextActionsSummary: stage.nextActions.length
          ? JSON.stringify(stage.nextActions)
          : null
      }
    });

    return { roadmap, record };
  });

  return {
    roadmap: {
      id: result.roadmap.id,
      title: result.roadmap.roadmapTitle || data.roadmap!.title,
      status: result.roadmap.roadmapStatus
    },
    stage,
    record: toStageAssessmentRecordDto(result.record)
  };
}
