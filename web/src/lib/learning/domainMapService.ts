import { parseConcept, parseGoals } from "./conceptPlanning";
import { buildCourseContentCoverage, currentContentPositions } from "./contentCoverage";
import { prisma } from "../prisma";
import {
  replaceRoadmap,
  saveLearningNodeProgress,
  type RoadmapInput,
  type LearningNodeProgressInput
} from "./roadmapService";
import {
  assertPassingMapDraftReview,
  getBoundMapDraftReview
} from "./mapDraftReviewService";
import {
  getCourseDesignState
} from "./courseDesignService";
import type { CourseDesignDraft } from "../ai/tasks";
import type {
  DomainMap,
  DomainMapNode,
  DomainMapUnit,
  LearningNodeStatus,
  LearningNodeType,
  LearningProgress
} from "./types";
import { learningNodeStatuses, learningNodeTypes } from "./types";
import type { RoadmapModuleBlueprint } from "./roadmapPlanningTypes";

type DomainRecord = {
  id: string;
  name: string;
  description: string | null;
  currentLevel: string | null;
  goal: string | null;
  scope: string | null;
  excludedScope: string | null;
  depth: string | null;
  outputType: string | null;
  outputTarget: string | null;
  taskBrief: string | null;
  status: string;
};
type RoadmapRecord = {
  id: string;
  title: string;
  status: string;
  mapRevision: number;
};
type UnitRecord = {
  id: string;
  domainId: string;
  mapKey: string | null;
  title: string;
  goal: string | null;
  rationale: string | null;
  moduleDirectionsJson: string | null;
  planningBlueprintJson: string | null;
  teachingPlanJson?: string | null;
  prerequisiteStageKeysJson: string | null;
  orderIndex: number;
  status: string;
};
type LearningNodeRecord = {
  id: string;
  domainId: string;
  mapKey: string | null;
  unitId: string | null;
  moduleTitle: string | null;
  moduleOrderIndex: number | null;
  title: string;
  nodeType: string;
  status: string;
  objective: string | null;
  keyQuestion: string | null;
  prerequisite: string | null;
  commonMistake: string | null;
  transferPrompt: string | null;
  planningQuestionKey: string | null;
  planningQuestionKeysJson?: string | null;
  conceptJson?: string | null;
  orderIndex: number;
  knowledgePointId: string | null;
  dependencies: Array<{
    prerequisiteId: string;
    prerequisite?: { id: string; mapKey: string | null };
  }>;
  knowledgePoint: { id: string } | null;
};

const completedStatuses = new Set(["can_apply", "can_transfer", "integrated"]);
const masteredStatuses = new Set(["can_transfer", "integrated"]);
const inProgressStatuses = new Set(["seen", "can_recall"]);
const reviewStatuses = new Set(["needs_review", "island"]);
const persistedNodeStatuses = new Set<string>(learningNodeStatuses);
const persistedNodeTypes = new Set<string>(learningNodeTypes);

const normalizeOptional = (value?: string | null) => {
  const next = value?.trim();
  return next ? next : null;
};

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
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (module): module is RoadmapModuleBlueprint =>
        Boolean(module) &&
        typeof module.key === "string" &&
        typeof module.title === "string" &&
        typeof module.goal === "string" &&
        Array.isArray(module.keyQuestions)
    );
  } catch {
    return [];
  }
};

const inferNodeType = (item: {
  title: string;
  objective?: string | null;
  keyQuestion?: string | null;
  transferPrompt?: string | null;
}): LearningNodeType => {
  const title = item.title.toLowerCase();
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

export function normalizeLearningNodeStatus(
  legacyStatus: string | null | undefined
): LearningNodeStatus {
  const status = legacyStatus?.trim() || "not_started";

  if (status === "skipped") return "skipped";
  if (status === "suggested") return "suggested";
  if (reviewStatuses.has(status)) return "needs_review";
  if (masteredStatuses.has(status)) return "mastered";
  if (completedStatuses.has(status)) return "completed";
  if (inProgressStatuses.has(status)) return "in_progress";
  return "locked";
}

const normalizePersistedLearningNodeStatus = (
  status: string | null | undefined
): LearningNodeStatus => {
  const normalized = status?.trim() || "locked";
  if (persistedNodeStatuses.has(normalized)) {
    return normalized as LearningNodeStatus;
  }
  return normalizeLearningNodeStatus(normalized);
};

const normalizePersistedLearningNodeType = (
  type: string | null | undefined,
  fallbackTitle: string,
  objective?: string | null,
  keyQuestion?: string | null,
  transferPrompt?: string | null
): LearningNodeType => {
  const normalized = type?.trim() || "";
  if (persistedNodeTypes.has(normalized)) {
    return normalized as LearningNodeType;
  }
  return inferNodeType({
    title: fallbackTitle,
    objective,
    keyQuestion,
    transferPrompt
  });
};

const isDone = (status: LearningNodeStatus) =>
  status === "completed" || status === "mastered" || status === "skipped";

export function calculateLearningProgress(
  nodes: Array<Pick<DomainMapNode, "status">>
): LearningProgress {
  const totalNodes = nodes.length;
  const completedNodes = nodes.filter((node) => isDone(node.status)).length;
  const masteredNodes = nodes.filter((node) => node.status === "mastered").length;
  const needsReviewNodes = nodes.filter(
    (node) => node.status === "needs_review"
  ).length;

  return {
    totalNodes,
    completedNodes,
    masteredNodes,
    needsReviewNodes,
    percent: totalNodes ? Math.round((completedNodes / totalNodes) * 100) : 0
  };
}

function annotatePrerequisiteWarnings(nodes: DomainMapNode[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]));

  return nodes.map((node) => {
    const unmetDependencyIds = node.dependencyIds.filter((dependencyId) => {
      const dependency = byId.get(dependencyId);
      return Boolean(dependency && !isDone(dependency.status));
    });
    return {
      ...node,
      status:
        node.status === "locked"
          ? ("available" as LearningNodeStatus)
          : node.status,
      unmetDependencyIds
    };
  });
}

function finalizeNodes(nodes: DomainMapNode[]) {
  return annotatePrerequisiteWarnings(nodes);
}

function buildNodesFromLearningNodes(
  domainId: string,
  learningNodes: LearningNodeRecord[],
  unitsById: Map<string, UnitRecord>
): DomainMapNode[] {
  const nodes = [...learningNodes]
    .sort((left, right) => left.orderIndex - right.orderIndex)
    .map((node) => {
      const unit = node.unitId ? unitsById.get(node.unitId) : null;
      const unitId = node.unitId || `ungrouped:${domainId}`;
      const moduleOrderIndex = node.moduleOrderIndex ?? 0;

      return {
        id: node.id,
        key: node.mapKey || node.id,
        domainId: node.domainId,
        unitId,
        unitTitle: unit?.title || "未分组单元",
        moduleId: `${unitId}:module:${moduleOrderIndex}`,
        moduleTitle: node.moduleTitle || unit?.title || "默认模块",
        title: node.title,
        type: normalizePersistedLearningNodeType(
          node.nodeType,
          node.title,
          node.objective,
          node.keyQuestion,
          node.transferPrompt
        ),
        status: normalizePersistedLearningNodeStatus(node.status),
        objective: node.objective,
        keyQuestion: node.keyQuestion,
        prerequisite: node.prerequisite,
        commonMistake: node.commonMistake,
        transferPrompt: node.transferPrompt,
        planningQuestionKey: node.planningQuestionKey,
        planningQuestionKeys: parseStringArray(node.planningQuestionKeysJson),
        concept: parseConcept(JSON.parse(node.conceptJson || "{}")),
        dependencyIds: node.dependencies.map((dependency) => dependency.prerequisiteId),
        prerequisiteKeys: node.dependencies.map(
          (dependency) =>
            dependency.prerequisite?.mapKey ||
            dependency.prerequisite?.id ||
            dependency.prerequisiteId
        ),
        unmetDependencyIds: [],
        orderIndex: node.orderIndex,
        linkedKnowledgePointId: node.knowledgePointId || node.knowledgePoint?.id || null
      };
    });

  return finalizeNodes(nodes);
}

function buildUnitsFromRecords(
  units: UnitRecord[],
  nodes: DomainMapNode[]
): DomainMapUnit[] {
  return [...units]
    .sort((left, right) => left.orderIndex - right.orderIndex)
    .map((unit) => {
      const unitNodes = nodes.filter((node) => node.unitId === unit.id);
      return {
        id: unit.id,
        key: unit.mapKey || unit.id,
        title: unit.title,
        goal: unit.goal,
        status: unit.status === "planned" ? "planned" : "expanded",
        rationale: unit.rationale,
        moduleDirections: parseStringArray(unit.moduleDirectionsJson),
        moduleBlueprints: parseModuleBlueprints(unit.planningBlueprintJson),
        goalKeys: JSON.parse(unit.teachingPlanJson || "{}").goalKeys || [],
        problem: JSON.parse(unit.teachingPlanJson || "{}").problem,
        conceptModules: JSON.parse(unit.teachingPlanJson || "{}").modules || [],
        prerequisiteStageKeys: parseStringArray(
          unit.prerequisiteStageKeysJson
        ),
        orderIndex: unit.orderIndex,
        progress: calculateLearningProgress(unitNodes)
      };
    });
}

function toMapDomain(domain: DomainRecord) {
  return {
    id: domain.id,
    name: domain.name,
    description: domain.description,
    currentLevel: domain.currentLevel,
    goal: domain.goal,
    scope: domain.scope,
    excludedScope: domain.excludedScope,
    depth: domain.depth,
    outputType: domain.outputType,
    outputTarget: domain.outputTarget,
    taskBrief: domain.taskBrief,
    status: domain.status || "active"
  };
}

function toMapRoadmap(roadmap: RoadmapRecord | null) {
  if (!roadmap) return null;
  return {
    id: roadmap.id,
    title: roadmap.title,
    status: roadmap.status,
    mapRevision: roadmap.mapRevision,
    hasPlannedStages: false
  };
}

function toLegacyLinkedWord(
  knowledgePoint: {
    id: string;
    title: string;
    coreEssence: string | null;
    userUnderstanding: string | null;
    masteryStatus: string;
    isIsland: boolean;
    islandReason: string | null;
  } | null
) {
  if (!knowledgePoint) return null;

  return {
    id: knowledgePoint.id,
    text: knowledgePoint.title,
    userUnderstanding: knowledgePoint.userUnderstanding,
    masteryStatus: knowledgePoint.masteryStatus,
    isIsland: knowledgePoint.isIsland,
    islandReason: knowledgePoint.islandReason,
    coreEssences: knowledgePoint.coreEssence
      ? [{ id: knowledgePoint.id, summary: knowledgePoint.coreEssence }]
      : []
  };
}

async function loadDomainMapRecords(domainId: string) {
  const [domain, units, learningNodes] = await Promise.all([
    prisma.domain.findUnique({
      where: { id: domainId },
      select: {
        id: true,
        name: true,
        description: true,
        currentLevel: true,
        goal: true,
        scope: true,
        excludedScope: true,
        depth: true,
        outputType: true,
        outputTarget: true,
        taskBrief: true,
        learningGoalsJson: true,
        roadmapTitle: true,
        roadmapStatus: true,
        mapRevision: true,
        status: true
      }
    }),
    prisma.unit.findMany({
      where: { domainId },
      orderBy: { orderIndex: "asc" }
    }),
    prisma.learningNode.findMany({
      where: { domainId },
      orderBy: { orderIndex: "asc" },
      include: {
        dependencies: {
          select: {
            prerequisiteId: true,
            prerequisite: {
              select: { id: true, mapKey: true }
            }
          }
        },
        knowledgePoint: {
          select: {
            id: true
          }
        }
      }
    })
  ]);

  const roadmap =
    domain &&
    (Boolean(domain.roadmapTitle) || units.length > 0 || learningNodes.length > 0)
    ? {
        id: domain.id,
        title: domain.roadmapTitle || `${domain.name} 学习路线图`,
        status: domain.roadmapStatus || "draft",
        mapRevision: domain.mapRevision
      }
    : null;

  return { domain, roadmap, units, learningNodes };
}

export async function getDomainMap(domainId: string): Promise<DomainMap> {
  const { domain, roadmap, units, learningNodes } = await loadDomainMapRecords(
    domainId
  );

  if (!domain) {
    throw new Error("未找到该学习领域。");
  }

  const nodes = buildNodesFromLearningNodes(
    domainId,
    learningNodes,
    new Map(units.map((unit) => [unit.id, unit]))
  );
  const mappedRoadmap = toMapRoadmap(roadmap);
  const learningGoals=parseGoals(JSON.parse(domain.learningGoalsJson || "[]"));
  const mappedUnits=buildUnitsFromRecords(units,nodes);
  const hasRegistry=learningGoals.some(goal=>goal.contentQuestions !== undefined);
  let contentCoverage:import("./roadmapPlanningTypes").CourseContentCoverage[]|undefined;
  if(hasRegistry) {
    const taught=await prisma.nodeTeachingSession.findMany({where:{domainId},select:{nodeId:true},distinct:["nodeId"]});
    const taughtIds=new Set(taught.map(session=>session.nodeId));
    const {getNodeTeaching}=await import("./progressiveTeachingService");
    const positions=(await Promise.all(nodes.filter(node=>taughtIds.has(node.id)).map(async node=>currentContentPositions((await getNodeTeaching(domainId,node.id)).session,node)))).flat();
    const stageByUnit=new Map(mappedUnits.map(unit=>[unit.id,unit.key]));
    contentCoverage=buildCourseContentCoverage(learningGoals,mappedUnits,nodes.map(node=>({...node,stageKey:stageByUnit.get(node.unitId)||""})),positions);
  }

  return {
    domain: toMapDomain(domain),
    learningGoals,
    ...(hasRegistry?{contentCoverageVersion:1 as const,contentCoverage}:{}),
    roadmap: mappedRoadmap
      ? {
          ...mappedRoadmap,
          hasPlannedStages: units.some((unit) => unit.status === "planned")
        }
      : null,
    units: mappedUnits,
    nodes,
    progress: calculateLearningProgress(nodes)
  };
}

export async function listDomainCards() {
  const domains = await prisma.domain.findMany({
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      currentLevel: true,
      goal: true,
      status: true,
      updatedAt: true,
      createdAt: true
    }
  });

  return Promise.all(
    domains.map(async (domain) => {
      const map = await getDomainMap(domain.id).catch(() => null);
      return {
        ...domain,
        hasMap: Boolean(map?.roadmap),
        hasPlannedStages: Boolean(map?.roadmap?.hasPlannedStages),
        progress: map?.progress || calculateLearningProgress([])
      };
    })
  );
}

export async function confirmDomainMap(
  domainId: string,
  input: RoadmapInput,
  reason?: string | null,
  courseDesign?: CourseDesignDraft
) {
  const confirmationReason = normalizeOptional(reason);
  if (!confirmationReason) {
    throw new Error("确认领域地图前必须写明任务书确认理由。");
  }

  const domain = await prisma.domain.findUnique({
    where: { id: domainId },
    select: {
      id: true,
      taskBrief: true,
      taskBriefConfirmedAt: true,
      roadmapDraftJson: true,
      roadmapDraftCourseDesignAiCallLogId: true,
      mapRevision: true,
      units: {
        select: { mapKey: true, status: true }
      }
    }
  });
  if (!domain) {
    throw new Error("未找到该学习领域。");
  }
  if (!normalizeOptional(domain.taskBrief) || !domain.taskBriefConfirmedAt) {
    throw new Error("确认领域地图前必须先保存并确认任务书。");
  }
  const state = await getCourseDesignState(domainId);
  const isCombinedCreationConfirmation = Boolean(courseDesign);
  const expectedCourseDesignStatus = isCombinedCreationConfirmation
    ? "draft"
    : "confirmed";
  if (state.status !== expectedCourseDesignStatus || !state.draft) {
    throw new Error("课程设计方向已失效，请重新研究后再确认领域地图。");
  }
  courseDesign = state.draft;
  if (!courseDesign.qualityGate.passed) {
    throw new Error("课程设计方向未通过质量门，不能确认领域地图。");
  }
  if (!state.aiCallLogId) {
    throw new Error("课程设计方向缺少 AI 生成凭据，请重新研究后再确认领域地图。");
  }
  if (
    !domain.roadmapDraftJson ||
    domain.roadmapDraftCourseDesignAiCallLogId !== state.aiCallLogId
  ) {
    throw new Error("领域地图草稿已失效，请基于当前课程设计重新生成。");
  }
  input = JSON.parse(domain.roadmapDraftJson) as RoadmapInput;
  if (!input.stages?.length) {
    throw new Error("正式领域地图必须包含完整 Stage 骨架。");
  }
  const review = await getBoundMapDraftReview(domainId);
  const existingUnitStatus = new Map(
    (domain.units || [])
      .filter((unit) => unit.mapKey)
      .map((unit) => [unit.mapKey as string, unit.status])
  );
  const newlyExpandedStageKeys = (input.stages || [])
    .filter(
      (stage) =>
        stage.status === "expanded" &&
        existingUnitStatus.get(stage.key || "") === "planned"
    )
    .map((stage) => stage.key as string);
  const reviewExpectation =
    existingUnitStatus.size === 0
      ? {
          expectedScopes: ["skeleton", "map"] as Array<
            "skeleton" | "stage" | "map"
          >,
          expectedStageKey: null
        }
      : newlyExpandedStageKeys.length === 1
        ? {
            expectedScopes: ["stage", "map"] as Array<
              "skeleton" | "stage" | "map"
            >,
            expectedStageKey: newlyExpandedStageKeys[0]
          }
        : {
            expectedScopes: ["map"] as Array<"skeleton" | "stage" | "map">
          };
  assertPassingMapDraftReview({
    draft: input,
    baseRevision: domain.mapRevision,
    courseDesignAiCallLogId: state.aiCallLogId,
    review,
    ...reviewExpectation
  });

  const confirmedInput = {
    ...input,
    status: "confirmed",
    confirmationReason
  };
  const roadmap = await replaceRoadmap(domainId, confirmedInput, {
    ...(expectedCourseDesignStatus === "draft"
      ? { courseDesignDraftJson: JSON.stringify(courseDesign) }
      : {}),
    expectedCourseDesignAiCallLogId: state.aiCallLogId,
    expectedCourseDesignStatus,
    expectedRoadmapDraftJson: domain.roadmapDraftJson
  });

  return roadmap;
}

export async function patchDomainMapStatus(
  domainId: string,
  status: string,
  reason?: string | null
) {
  const nextStatus = status.trim();
  if (!["draft", "review_needed", "adjusting"].includes(nextStatus)) {
    throw new Error("地图状态只能通过受控草稿流程更新；confirmed 必须重新确认正式地图。");
  }
  const updated = await prisma.domain.update({
    where: { id: domainId },
    data: { roadmapStatus: nextStatus },
    select: {
      id: true,
      name: true,
      roadmapTitle: true,
      roadmapStatus: true
    }
  });

  if (normalizeOptional(reason)) {
    await prisma.aiCallLog.create({
      data: {
        canvasId: domainId,
        taskType: "roadmap_generation",
        provider: "user",
        status: "success",
        inputSummary: "Domain map status changed by user.",
        outputSummary: normalizeOptional(reason)
      }
    });
  }

  return {
    id: updated.id,
    title: updated.roadmapTitle || `${updated.name} 学习路线图`,
    status: updated.roadmapStatus
  };
}

export async function assertLearningNodeInDomain(
  domainId: string,
  nodeId: string
) {
  const node = await prisma.learningNode.findFirst({
    where: { id: nodeId, domainId },
    select: { id: true }
  });
  if (!node) throw new Error("学习节点不属于该领域或不存在。");
  return node;
}

export async function startLearningNode(nodeId: string) {
  const node = await prisma.learningNode.findUnique({
    where: { id: nodeId },
    select: {
      id: true,
      status: true,
      legacyRoadmapItemId: true
    }
  });

  if (node) {
    if (
      node.status === "in_progress" ||
      node.status === "completed" ||
      node.status === "mastered"
    ) {
      return node;
    }

    return prisma.learningNode.update({
      where: { id: nodeId },
      data: { status: "in_progress" }
    });
  }
  throw new Error("未找到学习节点。");
}

export async function completeLearningNode(
  nodeId: string,
  input: LearningNodeProgressInput = {}
) {
  const userUnderstanding = input.userUnderstanding?.trim();
  if (!userUnderstanding) {
    throw new Error("请先用自己的话写下理解，再确认沉淀。");
  }
  return saveLearningNodeProgress(nodeId, {
    userUnderstanding,
    coreEssence: null,
    masteryStatus: "seen",
    isIsland: false,
    islandReason: null,
    markNodeCompleted: true
  });
}

export async function getLearningNodeDetails(nodeId: string) {
  const item = await prisma.learningNode.findUnique({
    where: { id: nodeId },
    include: {
      domain: {
        select: {
          id: true,
          name: true
        }
      },
      unit: {
        select: {
          id: true,
          title: true
        }
      },
      knowledgePoint: {
        select: {
          id: true,
          title: true,
          coreEssence: true,
          userUnderstanding: true,
          masteryStatus: true,
          isIsland: true,
          islandReason: true
        }
      }
    }
  });

  if (!item) {
    throw new Error("未找到学习节点。");
  }

  const map = await getDomainMap(item.domainId);
  const node = map.nodes.find((candidate) => candidate.id === item.id) || null;

  return {
    node,
    item: {
      id: item.id,
      title: item.title,
      keyQuestion: item.keyQuestion,
      objective: item.objective,
      prerequisite: item.prerequisite,
      commonMistake: item.commonMistake,
      transferPrompt: item.transferPrompt,
      status: item.status,
      linkedWord: toLegacyLinkedWord(item.knowledgePoint)
    },
    domain: item.domain,
    mapSummary: {
      progress: map.progress
    }
  };
}
