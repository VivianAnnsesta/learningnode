import { prisma } from "../prisma";
import {
  createKnowledgeRelation,
  deleteKnowledgeRelation,
  listKnowledgeRelations,
  updateKnowledgeRelation,
  type KnowledgeRelationUpdateInput
} from "./knowledgeService";

export type KnowledgeGraphRelationInput = {
  fromKnowledgePointId?: string;
  toKnowledgePointId?: string;
  relationType?: string;
  detail?: string | null;
  status?: string | null;
  evidenceStrength?: string | null;
  userExplanation?: string | null;
  aiAssessment?: string | null;
  applicability?: string | null;
  misuseRisk?: string | null;
};

export type KnowledgeGraphRelationUpdateInput = KnowledgeRelationUpdateInput;

const normalizeOptional = (value?: string | null) => {
  const next = value?.trim();
  return next ? next : null;
};

type CompatBranch = { title?: string; detail?: string };

const parseBranches = (value?: string | null): CompatBranch[] => {
  if (!value?.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    const branches: unknown[] = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray(parsed.branches)
        ? parsed.branches
        : [];
    return branches.filter(
      (branch): branch is CompatBranch => Boolean(branch) && typeof branch === "object"
    );
  } catch {
    return [];
  }
};

const toCompatWord = (
  point: {
    id: string;
    domainId: string;
    title: string;
    language: string | null;
    sentenceSample: string | null;
    coreEssence: string | null;
    manualBranchesJson: string | null;
    userUnderstanding: string | null;
    masteryStatus: string;
    isIsland: boolean;
    islandReason: string | null;
    lastReviewedAt: Date | null;
    nextReviewAt: Date | null;
    reviewIntervalDays: number | null;
    createdAt: Date;
    updatedAt: Date;
  },
  graphNode?: {
    nodeType: string;
    positionX: number | null;
    positionY: number | null;
  } | null
) => ({
  id: point.id,
  text: point.title,
  language: point.language || "und",
  sentenceSample: point.sentenceSample,
  nodeType: graphNode?.nodeType || "knowledge",
  masteryStatus: point.masteryStatus,
  isIsland: point.isIsland,
  islandReason: point.islandReason,
  userUnderstanding: point.userUnderstanding,
  lastReviewedAt: point.lastReviewedAt,
  nextReviewAt: point.nextReviewAt,
  reviewIntervalDays: point.reviewIntervalDays,
  positionX: graphNode?.positionX ?? null,
  positionY: graphNode?.positionY ?? null,
  canvasId: point.domainId,
  createdAt: point.createdAt,
  updatedAt: point.updatedAt,
  coreEssences: point.coreEssence
    ? [
        {
          id: point.id,
          wordId: point.id,
          summary: point.coreEssence,
          rationale: null
        }
      ]
    : [],
  wordTags: [],
  trees: parseBranches(point.manualBranchesJson).length
    ? [
        {
          id: `${point.id}:tree`,
          wordId: point.id,
          name: "手动推演",
          description: null,
          nodes: parseBranches(point.manualBranchesJson).map((branch, index) => ({
            id: `${point.id}:branch:${index}`,
            treeId: `${point.id}:tree`,
            label:
              typeof branch?.title === "string" && branch.title.trim()
                ? branch.title.trim()
                : `路径 ${index + 1}`,
            nodeType: "branch",
            content:
              typeof branch?.detail === "string" && branch.detail.trim()
                ? branch.detail.trim()
                : null
          })),
          relations: []
        }
      ]
    : []
});

export async function getKnowledgeGraph(domainId: string) {
  const [domain, points, graphNodes, relations] = await Promise.all([
    prisma.domain.findUnique({
      where: { id: domainId },
      select: { id: true, name: true }
    }),
    prisma.knowledgePoint.findMany({
      where: { domainId },
      orderBy: { updatedAt: "desc" }
    }),
    prisma.knowledgeGraphNode.findMany({
      where: { domainId }
    }),
    listKnowledgeRelations(domainId)
  ]);

  if (!domain) {
    throw new Error("Domain not found.");
  }

  const graphNodeByPointId = new Map(
    graphNodes
      .filter((node) => node.knowledgePointId)
      .map((node) => [node.knowledgePointId as string, node])
  );

  return {
    domain,
    nodes: points.map((point) => ({
      id: point.id,
      domainId: point.domainId,
      title: point.title,
      type: graphNodeByPointId.get(point.id)?.nodeType || "knowledge",
      status: point.masteryStatus,
      isIsland: point.isIsland,
      coreEssence: point.coreEssence || null,
      updatedAt: point.updatedAt
    })),
    relations: relations.map((relation) => ({
      id: relation.id,
      fromKnowledgePointId: relation.fromWordId,
      toKnowledgePointId: relation.toWordId,
      relationType: relation.relationType,
      detail: relation.detail,
      status: relation.status,
      evidenceStrength: relation.evidenceStrength,
      userExplanation: relation.userExplanation,
      aiAssessment: relation.aiAssessment,
      applicability: relation.applicability,
      misuseRisk: relation.misuseRisk,
      fromNode: relation.fromWord,
      toNode: relation.toWord,
      createdAt: relation.createdAt
    }))
  };
}

export async function getLegacyCanvasGraphPayload(canvasId: string) {
  const [points, graphNodes, relations] = await Promise.all([
    prisma.knowledgePoint.findMany({
      where: { domainId: canvasId },
      orderBy: { updatedAt: "desc" }
    }),
    prisma.knowledgeGraphNode.findMany({
      where: { domainId: canvasId }
    }),
    listKnowledgeRelations(canvasId)
  ]);

  const graphNodeByPointId = new Map(
    graphNodes
      .filter((node) => node.knowledgePointId)
      .map((node) => [node.knowledgePointId as string, node])
  );
  const words = points.map((point) =>
    toCompatWord(point, graphNodeByPointId.get(point.id) || null)
  );

  const portalTargets = relations
    .filter(
      (relation) =>
        relation.relationType === "WORMHOLE" &&
        relation.toWord.canvasId !== canvasId
    )
    .map((relation) => ({
      id: relation.toWord.id,
      text: relation.toWord.text,
      language: "und",
      canvasId: relation.toWord.canvasId,
      canvas: {
        name: relation.toWord.canvas.name
      }
    }));

  return { words, relations, portalTargets };
}

export async function createKnowledgeGraphRelation(
  domainId: string,
  input: KnowledgeGraphRelationInput
) {
  if (!input.fromKnowledgePointId?.trim() || !input.toKnowledgePointId?.trim()) {
    throw new Error("fromKnowledgePointId and toKnowledgePointId are required.");
  }

  const relationType = input.relationType?.trim() || "related";

  return createKnowledgeRelation(
    domainId,
    {
      fromWordId: input.fromKnowledgePointId,
      toWordId: input.toKnowledgePointId,
      relationType,
      detail: normalizeOptional(input.detail),
      status: relationType === "WORMHOLE" ? "wormhole_candidate" : "candidate",
      evidenceStrength: input.evidenceStrength?.trim() || "unknown",
      userExplanation: normalizeOptional(input.userExplanation),
      aiAssessment: normalizeOptional(input.aiAssessment),
      applicability: normalizeOptional(input.applicability),
      misuseRisk: normalizeOptional(input.misuseRisk)
    },
    {
      defaultStatus: "candidate",
      defaultWormholeStatus: "wormhole_candidate"
    }
  );
}

export async function updateKnowledgeGraphRelation(
  domainId: string,
  relationId: string,
  input: KnowledgeGraphRelationUpdateInput
) {
  return updateKnowledgeRelation(relationId, domainId, input);
}

export async function deleteKnowledgeGraphRelation(
  domainId: string,
  relationId: string
) {
  return deleteKnowledgeRelation(relationId, domainId);
}
