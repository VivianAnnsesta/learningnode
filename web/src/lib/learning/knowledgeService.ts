import { prisma } from "../prisma";
import { isHighMasteryStatus } from "./types";

export type KnowledgeBranchInput = {
  title?: string;
  detail?: string;
};

export type KnowledgeWordUpdateInput = {
  word?: string;
  language?: string | null;
  sentenceSample?: string | null;
  coreEssence?: string | null;
  branches?: KnowledgeBranchInput[];
  nodeType?: string | null;
  masteryStatus?: string | null;
  isIsland?: boolean | null;
  islandReason?: string | null;
  userUnderstanding?: string | null;
};

export type KnowledgeWordSearchInput = {
  canvasId?: string | null;
  query?: string | null;
};

export type KnowledgeWordPositionInput = {
  x?: number;
  y?: number;
};

export type KnowledgeRelationUpdateInput = {
  fromWordId?: string;
  toWordId?: string;
  relationType?: string;
  detail?: string | null;
  status?: string | null;
  evidenceStrength?: string | null;
  userExplanation?: string | null;
  aiAssessment?: string | null;
  applicability?: string | null;
  misuseRisk?: string | null;
};

export type KnowledgeRelationCreateOptions = {
  defaultStatus?: string;
  defaultWormholeStatus?: string;
};

export interface KnowledgeRelationDto {
  id: string;
  fromWordId: string;
  toWordId: string;
  relationType: string;
  detail: string | null;
  status: string;
  evidenceStrength: string;
  userExplanation: string | null;
  aiAssessment: string | null;
  applicability: string | null;
  misuseRisk: string | null;
  fromWord: {
    id: string;
    text: string;
    canvasId: string;
    canvas: {
      id: string;
      name: string;
    };
  };
  toWord: {
    id: string;
    text: string;
    canvasId: string;
    canvas: {
      id: string;
      name: string;
    };
  };
  createdAt: Date;
}

export class KnowledgeRelationError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "missing_canvas"
      | "missing_required"
      | "missing_confirmation"
      | "invalid_source"
      | "target_not_found"
      | "cross_canvas"
      | "not_found"
  ) {
    super(message);
    this.name = "KnowledgeRelationError";
  }
}

export class KnowledgeWordError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "missing_canvas"
      | "missing_word"
      | "invalid_json"
      | "not_found"
      | "invalid_position"
      | "forbidden_mastery_status"
  ) {
    super(message);
    this.name = "KnowledgeWordError";
  }
}

const normalizeOptional = (value?: string | null) => {
  const next = value?.trim();
  return next ? next : null;
};

const assertCompatMasteryWriteAllowed = (masteryStatus?: string | null) => {
  if (isHighMasteryStatus(masteryStatus)) {
    throw new KnowledgeWordError(
      "兼容接口不能直接写入高阶掌握状态；请通过后续 Mastery Evidence 流程升级。",
      "forbidden_mastery_status"
    );
  }
};

const normalizeBranches = (branches: KnowledgeBranchInput[] = []) =>
  branches
    .map((branch) => ({
      title: branch.title?.trim() ?? "",
      detail: branch.detail?.trim() ?? ""
    }))
    .filter((branch) => branch.title.length > 0 || branch.detail.length > 0);

const parseBranches = (value?: string | null): KnowledgeBranchInput[] => {
  if (!value?.trim()) return [];

  try {
    const parsed = JSON.parse(value);
    const branches = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray(parsed.branches)
        ? parsed.branches
        : [];
    return normalizeBranches(branches);
  } catch {
    return [];
  }
};

const serializeBranchesPreservingFidelity = (
  branches: KnowledgeBranchInput[],
  existingValue?: string | null
) => {
  if (existingValue?.trim()) {
    try {
      const parsed = JSON.parse(existingValue);
      if (
        parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed) &&
        parsed.version === 1 &&
        parsed.legacy &&
        typeof parsed.legacy === "object"
      ) {
        return JSON.stringify({ ...parsed, branches });
      }
    } catch {
      // Invalid compatibility JSON is replaced by the normalized branch value.
    }
  }
  return branches.length ? JSON.stringify(branches) : null;
};

type KnowledgePointRecord = {
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
  createdAt?: Date;
  updatedAt?: Date;
};

type KnowledgeGraphNodeRecord = {
  id: string;
  domainId: string;
  knowledgePointId: string | null;
  title: string;
  nodeType: string;
  status: string;
  positionX: number | null;
  positionY: number | null;
  createdAt?: Date;
  updatedAt?: Date;
};

const buildCompatCoreEssences = (point: KnowledgePointRecord) =>
  point.coreEssence
    ? [
        {
          id: point.id,
          wordId: point.id,
          summary: point.coreEssence,
          rationale: null
        }
      ]
    : [];

const buildCompatTrees = (point: KnowledgePointRecord) => {
  const branches = parseBranches(point.manualBranchesJson);
  if (branches.length === 0) return [];

  return [
    {
      id: `${point.id}:tree`,
      wordId: point.id,
      name: "手动推演",
      description: null,
      nodes: branches.map((branch, index) => ({
        id: `${point.id}:branch:${index}`,
        treeId: `${point.id}:tree`,
        label: branch.title || `路径 ${index + 1}`,
        nodeType: "branch",
        content: branch.detail || null
      })),
      relations: []
    }
  ];
};

function toCompatWord(
  point: KnowledgePointRecord,
  graphNode: KnowledgeGraphNodeRecord | null
) {
  return {
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
    coreEssences: buildCompatCoreEssences(point),
    trees: buildCompatTrees(point),
    wordTags: []
  };
}

function buildRelationUpdateData(payload: KnowledgeRelationUpdateInput) {
  const data: Record<string, string | null> = {};

  if (payload.relationType?.trim()) {
    data.relationType = payload.relationType.trim();
  }
  if (payload.detail !== undefined) {
    data.detail = normalizeOptional(payload.detail);
  }
  if (payload.status !== undefined && payload.status?.trim()) {
    data.status = payload.status.trim();
  }
  if (payload.evidenceStrength !== undefined) {
    data.evidenceStrength = payload.evidenceStrength?.trim() || null;
  }
  if (payload.userExplanation !== undefined) {
    data.userExplanation = normalizeOptional(payload.userExplanation);
  }
  if (payload.aiAssessment !== undefined) {
    data.aiAssessment = normalizeOptional(payload.aiAssessment);
  }
  if (payload.applicability !== undefined) {
    data.applicability = normalizeOptional(payload.applicability);
  }
  if (payload.misuseRisk !== undefined) {
    data.misuseRisk = normalizeOptional(payload.misuseRisk);
  }

  return data;
}

const formalRelationStatuses = new Set(["confirmed", "confirmed_wormhole"]);

const assertFormalRelationHasEvidence = (input: {
  status?: string | null;
  evidenceStrength?: string | null;
  userExplanation?: string | null;
  applicability?: string | null;
  misuseRisk?: string | null;
}) => {
  const status = input.status?.trim();
  if (!status || !formalRelationStatuses.has(status)) return;

  const userExplanation = input.userExplanation?.trim();
  const evidenceStrength = input.evidenceStrength?.trim();
  if (!userExplanation) {
    throw new KnowledgeRelationError(
      "确认正式关系前必须写下用户解释。",
      "missing_confirmation"
    );
  }
  if (!evidenceStrength || evidenceStrength === "unknown") {
    throw new KnowledgeRelationError(
      "确认正式关系前必须提供明确的依据强度。",
      "missing_confirmation"
    );
  }
  if (status === "confirmed_wormhole") {
    if (!input.applicability?.trim() || !input.misuseRisk?.trim()) {
      throw new KnowledgeRelationError(
        "确认虫洞前必须写明适用边界和误用风险。",
        "missing_confirmation"
      );
    }
  }
};

async function ensureKnowledgeGraphNode(
  tx: Pick<typeof prisma, "knowledgeGraphNode">,
  point: {
    id: string;
    domainId: string;
    title: string;
    masteryStatus: string;
    isIsland: boolean;
  },
  input: {
    nodeType?: string | null;
    positionX?: number | null;
    positionY?: number | null;
  } = {}
) {
  const existing = await tx.knowledgeGraphNode.findFirst({
    where: {
      domainId: point.domainId,
      OR: [{ knowledgePointId: point.id }, { id: point.id }]
    }
  });

  const status = point.isIsland ? "island" : point.masteryStatus;
  const nodeType = input.nodeType?.trim() || existing?.nodeType || "knowledge";

  if (existing) {
    return tx.knowledgeGraphNode.update({
      where: { id: existing.id },
      data: {
        knowledgePointId: point.id,
        title: point.title,
        nodeType,
        status,
        ...(input.positionX !== undefined ? { positionX: input.positionX } : {}),
        ...(input.positionY !== undefined ? { positionY: input.positionY } : {})
      }
    });
  }

  return tx.knowledgeGraphNode.create({
    data: {
      id: point.id,
      domainId: point.domainId,
      knowledgePointId: point.id,
      title: point.title,
      nodeType,
      status,
      positionX: input.positionX ?? null,
      positionY: input.positionY ?? null
    }
  });
}

async function loadKnowledgeWord(pointId: string, domainId: string) {
  const point = await prisma.knowledgePoint.findFirst({
    where: { id: pointId, domainId }
  });

  if (!point) {
    throw new KnowledgeWordError("未找到该知识点。", "not_found");
  }

  const graphNode = await prisma.knowledgeGraphNode.findFirst({
    where: {
      domainId,
      OR: [{ knowledgePointId: point.id }, { id: point.id }]
    }
  });

  return { point, graphNode };
}

async function loadKnowledgePointForRelation(
  pointId: string,
  domainId?: string | null
) {
  const point = await prisma.knowledgePoint.findFirst({
    where: domainId ? { id: pointId, domainId } : { id: pointId }
  });
  if (!point) return null;

  const graphNode = await prisma.knowledgeGraphNode.findFirst({
    where: {
      domainId: point.domainId,
      OR: [{ knowledgePointId: point.id }, { id: point.id }]
    }
  });

  return { point, graphNode };
}

export async function searchKnowledgeWords(input: KnowledgeWordSearchInput) {
  const canvasId = input.canvasId?.trim();
  if (!canvasId) {
    throw new KnowledgeWordError("画布 ID 不能为空。", "missing_canvas");
  }

  const query = input.query?.trim();
  if (!query) {
    return [];
  }

  const points = await prisma.knowledgePoint.findMany({
    where: {
      domainId: canvasId,
      OR: [
        { title: { contains: query } },
        { coreEssence: { contains: query } }
      ]
    },
    take: 10,
    orderBy: { updatedAt: "desc" }
  });

  const graphNodes = await prisma.knowledgeGraphNode.findMany({
    where: {
      domainId: canvasId,
      knowledgePointId: {
        in: points.map((point) => point.id)
      }
    }
  });
  const graphNodeByPointId = new Map(
    graphNodes
      .filter((node) => node.knowledgePointId)
      .map((node) => [node.knowledgePointId as string, node])
  );

  return points.map((point) =>
    toCompatWord(point, graphNodeByPointId.get(point.id) || null)
  );
}

export async function upsertKnowledgeWord(
  payload: KnowledgeWordUpdateInput & {
    canvasId?: string | null;
  }
) {
  assertCompatMasteryWriteAllowed(payload.masteryStatus);
  const word = payload.word?.trim();
  if (!word) {
    throw new KnowledgeWordError("知识点名称不能为空。", "missing_word");
  }

  const canvasId = payload.canvasId?.trim();
  if (!canvasId) {
    throw new KnowledgeWordError("画布 ID 不能为空。", "missing_canvas");
  }

  const language = payload.language?.trim() || "und";
  const sentenceSample = normalizeOptional(payload.sentenceSample);
  const masteryStatus = payload.masteryStatus?.trim() || "not_started";
  const isIsland = Boolean(payload.isIsland);
  const islandReason = normalizeOptional(payload.islandReason);
  const userUnderstanding = normalizeOptional(payload.userUnderstanding);
  const coreEssence = payload.coreEssence?.trim();
  const branches = normalizeBranches(payload.branches);
  const manualBranchesJson = serializeBranchesPreservingFidelity(branches);

  return prisma.$transaction(async (tx) => {
    const existing = await tx.knowledgePoint.findFirst({
      where: {
        domainId: canvasId,
        title: word,
        language
      }
    });

    const point = existing
      ? await tx.knowledgePoint.update({
          where: { id: existing.id },
          data: {
            sentenceSample,
            ...(payload.masteryStatus !== undefined || payload.isIsland !== undefined
              ? { masteryStatus: isIsland ? "island" : masteryStatus }
              : {}),
            ...(payload.isIsland !== undefined ? { isIsland } : {}),
            ...(payload.islandReason !== undefined ? { islandReason } : {}),
            ...(payload.userUnderstanding !== undefined ? { userUnderstanding } : {}),
            ...(coreEssence ? { coreEssence } : {}),
            ...(payload.branches !== undefined
              ? {
                  manualBranchesJson: serializeBranchesPreservingFidelity(
                    branches,
                    existing.manualBranchesJson
                  )
                }
              : {})
          }
        })
      : await tx.knowledgePoint.create({
          data: {
            domainId: canvasId,
            title: word,
            language,
            sentenceSample,
            coreEssence: coreEssence || null,
            manualBranchesJson,
            userUnderstanding,
            masteryStatus: isIsland ? "island" : masteryStatus,
            isIsland,
            islandReason
          }
        });

    const graphNode = await ensureKnowledgeGraphNode(tx, point, {
      nodeType: payload.nodeType
    });

    return toCompatWord(point, graphNode);
  });
}

export async function getKnowledgeWord(wordId: string, canvasId: string) {
  if (!canvasId.trim()) {
    throw new KnowledgeWordError("画布 ID 不能为空。", "missing_canvas");
  }

  const { point, graphNode } = await loadKnowledgeWord(wordId, canvasId);
  return toCompatWord(point, graphNode);
}

export async function deleteKnowledgeWord(wordId: string, canvasId: string) {
  if (!canvasId.trim()) {
    throw new KnowledgeWordError("画布 ID 不能为空。", "missing_canvas");
  }

  const existing = await prisma.knowledgePoint.findFirst({
    where: { id: wordId, domainId: canvasId },
    select: { id: true }
  });

  if (!existing) {
    throw new KnowledgeWordError("未找到该知识点。", "not_found");
  }

  await prisma.$transaction(async (tx) => {
    await tx.knowledgeGraphNode.deleteMany({
      where: {
        domainId: canvasId,
        OR: [{ knowledgePointId: wordId }, { id: wordId }]
      }
    });
    await tx.knowledgePoint.delete({ where: { id: wordId } });
  });
}

export async function updateKnowledgeWordPosition(
  wordId: string,
  canvasId: string,
  payload: KnowledgeWordPositionInput
) {
  if (!canvasId.trim()) {
    throw new KnowledgeWordError("画布 ID 不能为空。", "missing_canvas");
  }

  const x = typeof payload.x === "number" ? payload.x : null;
  const y = typeof payload.y === "number" ? payload.y : null;

  if (x === null || y === null) {
    throw new KnowledgeWordError("坐标 x 和 y 不能为空。", "invalid_position");
  }

  const { point } = await loadKnowledgeWord(wordId, canvasId);
  const graphNode = await prisma.$transaction(async (tx) =>
    ensureKnowledgeGraphNode(tx, point, { positionX: x, positionY: y })
  );

  return {
    id: point.id,
    positionX: graphNode.positionX,
    positionY: graphNode.positionY
  };
}

export async function updateKnowledgeWord(
  wordId: string,
  canvasId: string,
  payload: KnowledgeWordUpdateInput
) {
  assertCompatMasteryWriteAllowed(payload.masteryStatus);
  if (!canvasId.trim()) {
    throw new KnowledgeWordError("画布 ID 不能为空。", "missing_canvas");
  }

  const wordText = payload.word?.trim();
  if (!wordText) {
    throw new KnowledgeWordError("知识点名称不能为空。", "missing_word");
  }

  const branches = normalizeBranches(payload.branches);
  const isIsland = Boolean(payload.isIsland);
  const { point: existingPoint, graphNode: existingNode } = await loadKnowledgeWord(
    wordId,
    canvasId
  );

  return prisma.$transaction(async (tx) => {
    const point = await tx.knowledgePoint.update({
      where: { id: wordId },
      data: {
        title: wordText,
        ...(payload.language !== undefined
          ? { language: normalizeOptional(payload.language) || "und" }
          : {}),
        ...(payload.sentenceSample !== undefined
          ? { sentenceSample: normalizeOptional(payload.sentenceSample) }
          : {}),
        ...(payload.coreEssence !== undefined
          ? { coreEssence: normalizeOptional(payload.coreEssence) }
          : {}),
        ...(payload.branches !== undefined
          ? {
              manualBranchesJson: serializeBranchesPreservingFidelity(
                branches,
                existingPoint.manualBranchesJson
              )
            }
          : {}),
        ...(payload.nodeType !== undefined ? {} : {}),
        ...(payload.masteryStatus !== undefined || payload.isIsland !== undefined
          ? {
              masteryStatus: isIsland
                ? "island"
                : payload.masteryStatus?.trim() || "not_started"
            }
          : {}),
        ...(payload.isIsland !== undefined ? { isIsland } : {}),
        ...(payload.islandReason !== undefined
          ? { islandReason: normalizeOptional(payload.islandReason) }
          : {}),
        ...(payload.userUnderstanding !== undefined
          ? { userUnderstanding: normalizeOptional(payload.userUnderstanding) }
          : {})
      }
    });

    const graphNode = await ensureKnowledgeGraphNode(tx, point, {
      nodeType: payload.nodeType || existingNode?.nodeType || "knowledge",
      positionX: existingNode?.positionX ?? null,
      positionY: existingNode?.positionY ?? null
    });

    return toCompatWord(point, graphNode);
  });
}

function valueFromUpdate(
  data: Record<string, string | null>,
  key:
    | "status"
    | "evidenceStrength"
    | "userExplanation"
    | "applicability"
    | "misuseRisk"
) {
  const value = data[key];
  return typeof value === "string" ? value : null;
}

function toCompatRelation(edge: {
  id: string;
  relationType: string;
  detail: string | null;
  status: string;
  evidenceStrength: string;
  userExplanation: string | null;
  aiAssessment: string | null;
  applicability: string | null;
  misuseRisk: string | null;
  createdAt: Date;
  fromNode: {
    id: string;
    domainId: string;
    title: string;
    domain: { id: string; name: string };
    knowledgePoint: { id: string; title: string } | null;
  };
  toNode: {
    id: string;
    domainId: string;
    title: string;
    domain: { id: string; name: string };
    knowledgePoint: { id: string; title: string } | null;
  };
  }): KnowledgeRelationDto {
  const fromNode = edge.fromNode;
  const toNode = edge.toNode;
  return {
    id: edge.id,
    fromWordId: fromNode?.knowledgePoint?.id || fromNode?.id || "",
    toWordId: toNode?.knowledgePoint?.id || toNode?.id || "",
    relationType: edge.relationType,
    detail: edge.detail,
    status: edge.status,
    evidenceStrength: edge.evidenceStrength,
    userExplanation: edge.userExplanation,
    aiAssessment: edge.aiAssessment,
    applicability: edge.applicability,
    misuseRisk: edge.misuseRisk,
    fromWord: {
      id: fromNode?.knowledgePoint?.id || fromNode?.id || "",
      text: fromNode?.knowledgePoint?.title || fromNode?.title || "",
      canvasId: fromNode?.domainId || "",
      canvas: fromNode?.domain || { id: "", name: "" }
    },
    toWord: {
      id: toNode?.knowledgePoint?.id || toNode?.id || "",
      text: toNode?.knowledgePoint?.title || toNode?.title || "",
      canvasId: toNode?.domainId || "",
      canvas: toNode?.domain || { id: "", name: "" }
    },
    createdAt: edge.createdAt
  };
}

export async function listKnowledgeRelations(
  canvasId: string,
  wordId?: string | null
): Promise<KnowledgeRelationDto[]> {
  if (!canvasId.trim()) {
    throw new KnowledgeRelationError("画布 ID 不能为空。", "missing_canvas");
  }

  const normalizedWordId = wordId?.trim();
  const edges = await prisma.knowledgeGraphEdge.findMany({
    where: normalizedWordId
      ? {
          domainId: canvasId,
          OR: [{ fromNodeId: normalizedWordId }, { toNodeId: normalizedWordId }]
        }
      : { domainId: canvasId },
    include: {
      fromNode: {
        include: {
          domain: { select: { id: true, name: true } },
          knowledgePoint: {
            select: { id: true, title: true }
          }
        }
      },
      toNode: {
        include: {
          domain: { select: { id: true, name: true } },
          knowledgePoint: {
            select: { id: true, title: true }
          }
        }
      }
    }
  });

  return edges.map(toCompatRelation);
}

export async function createKnowledgeRelation(
  canvasId: string,
  payload: KnowledgeRelationUpdateInput,
  options: KnowledgeRelationCreateOptions = {}
): Promise<KnowledgeRelationDto> {
  const fromWordId = payload.fromWordId?.trim();
  const toWordId = payload.toWordId?.trim();
  const relationType = payload.relationType?.trim();
  const detail = normalizeOptional(payload.detail);
  const status =
    payload.status?.trim() ||
    (relationType === "WORMHOLE"
      ? options.defaultWormholeStatus || "wormhole_candidate"
      : options.defaultStatus || "confirmed");
  const evidenceStrength = payload.evidenceStrength?.trim() || "unknown";
  const userExplanation = normalizeOptional(payload.userExplanation);
  const aiAssessment = normalizeOptional(payload.aiAssessment);
  const applicability = normalizeOptional(payload.applicability);
  const misuseRisk = normalizeOptional(payload.misuseRisk);

  if (!fromWordId || !toWordId || !relationType || !canvasId.trim()) {
    throw new KnowledgeRelationError(
      "起点、终点、关系类型和画布 ID 不能为空。",
      "missing_required"
    );
  }

  assertFormalRelationHasEvidence({
    status,
    evidenceStrength,
    userExplanation,
    applicability,
    misuseRisk
  });

  const source = await loadKnowledgePointForRelation(fromWordId, canvasId);
  if (!source) {
    throw new KnowledgeRelationError("起点不属于该画布。", "invalid_source");
  }

  const target =
    relationType === "WORMHOLE"
      ? await loadKnowledgePointForRelation(toWordId)
      : await loadKnowledgePointForRelation(toWordId, canvasId);

  if (!target) {
    throw new KnowledgeRelationError(
      relationType === "WORMHOLE" ? "目标节点不存在。" : "不允许跨画布创建关系。",
      relationType === "WORMHOLE" ? "target_not_found" : "cross_canvas"
    );
  }

  const relation = await prisma.$transaction(async (tx) => {
    const sourceNode = await ensureKnowledgeGraphNode(tx, source.point, {
      nodeType: source.graphNode?.nodeType || "knowledge",
      positionX: source.graphNode?.positionX ?? null,
      positionY: source.graphNode?.positionY ?? null
    });
    const targetNode = await ensureKnowledgeGraphNode(tx, target.point, {
      nodeType: target.graphNode?.nodeType || "knowledge",
      positionX: target.graphNode?.positionX ?? null,
      positionY: target.graphNode?.positionY ?? null
    });

    const existing = await tx.knowledgeGraphEdge.findFirst({
      where: {
        domainId: canvasId,
        fromNodeId: sourceNode.id,
        toNodeId: targetNode.id,
        relationType
      }
    });
    if (existing) return existing;

    return tx.knowledgeGraphEdge.create({
      data: {
        domainId: canvasId,
        fromNodeId: sourceNode.id,
        toNodeId: targetNode.id,
        relationType,
        detail,
        status,
        evidenceStrength,
        userExplanation,
        aiAssessment,
        applicability,
        misuseRisk
      }
    });
  });

  return toCompatRelation(await getOwnedRelation(relation.id, canvasId));
}

async function getOwnedRelation(relationId: string, canvasId: string) {
  if (!canvasId.trim()) {
    throw new KnowledgeRelationError("画布 ID 不能为空。", "missing_canvas");
  }

  const relation = await prisma.knowledgeGraphEdge.findUnique({
    where: { id: relationId },
    include: {
      fromNode: {
        include: {
          domain: { select: { id: true, name: true } },
          knowledgePoint: { select: { id: true, title: true } }
        }
      },
      toNode: {
        include: {
          domain: { select: { id: true, name: true } },
          knowledgePoint: { select: { id: true, title: true } }
        }
      }
    }
  });

  if (!relation || relation.domainId !== canvasId) {
    throw new Error("该关系不属于当前画布。");
  }

  if (
    relation.relationType !== "WORMHOLE" &&
    relation.toNode.domainId !== canvasId
  ) {
    throw new Error("该关系不属于当前画布。");
  }

  return relation;
}

export async function updateKnowledgeRelation(
  relationId: string,
  canvasId: string,
  payload: KnowledgeRelationUpdateInput
): Promise<KnowledgeRelationDto> {
  const data = buildRelationUpdateData(payload);

  if (
    Object.keys(data).length === 0 &&
    !payload.fromWordId?.trim() &&
    !payload.toWordId?.trim()
  ) {
    throw new Error("未提供可更新字段。");
  }

  const existing = await getOwnedRelation(relationId, canvasId);

  const nextRelationType = payload.relationType?.trim() || existing.relationType;
  const nextFromId =
    payload.fromWordId?.trim() ||
    existing.fromNode.knowledgePoint?.id ||
    existing.fromNode.id;
  const nextToId =
    payload.toWordId?.trim() ||
    existing.toNode.knowledgePoint?.id ||
    existing.toNode.id;
  const nextStatus = valueFromUpdate(data, "status") || existing.status;
  const nextEvidenceStrength =
    valueFromUpdate(data, "evidenceStrength") || existing.evidenceStrength;
  const nextUserExplanation =
    valueFromUpdate(data, "userExplanation") ?? existing.userExplanation;
  const nextApplicability =
    valueFromUpdate(data, "applicability") ?? existing.applicability;
  const nextMisuseRisk =
    valueFromUpdate(data, "misuseRisk") ?? existing.misuseRisk;

  assertFormalRelationHasEvidence({
    status: nextStatus,
    evidenceStrength: nextEvidenceStrength,
    userExplanation: nextUserExplanation,
    applicability: nextApplicability,
    misuseRisk: nextMisuseRisk
  });

  const source = await loadKnowledgePointForRelation(nextFromId, canvasId);
  if (!source) {
    throw new Error("起点不属于该画布。");
  }

  const target =
    nextRelationType === "WORMHOLE"
      ? await loadKnowledgePointForRelation(nextToId)
      : await loadKnowledgePointForRelation(nextToId, canvasId);

  if (!target) {
    throw new Error(
      nextRelationType === "WORMHOLE"
        ? "目标节点不存在。"
        : "不允许跨画布创建关系。"
    );
  }

  const relation = await prisma.$transaction(async (tx) => {
    const sourceNode = await ensureKnowledgeGraphNode(tx, source.point, {
      nodeType: source.graphNode?.nodeType || "knowledge",
      positionX: source.graphNode?.positionX ?? null,
      positionY: source.graphNode?.positionY ?? null
    });
    const targetNode = await ensureKnowledgeGraphNode(tx, target.point, {
      nodeType: target.graphNode?.nodeType || "knowledge",
      positionX: target.graphNode?.positionX ?? null,
      positionY: target.graphNode?.positionY ?? null
    });

    return tx.knowledgeGraphEdge.update({
      where: { id: relationId },
      data: {
        fromNodeId: sourceNode.id,
        toNodeId: targetNode.id,
        ...(data.relationType ? { relationType: data.relationType } : {}),
        ...(data.detail !== undefined ? { detail: data.detail } : {}),
        ...(data.status ? { status: data.status } : {}),
        ...(data.evidenceStrength
          ? { evidenceStrength: data.evidenceStrength }
          : {}),
        ...(data.userExplanation !== undefined
          ? { userExplanation: data.userExplanation }
          : {}),
        ...(data.aiAssessment !== undefined
          ? { aiAssessment: data.aiAssessment }
          : {}),
        ...(data.applicability !== undefined
          ? { applicability: data.applicability }
          : {}),
        ...(data.misuseRisk !== undefined
          ? { misuseRisk: data.misuseRisk }
          : {})
      }
    });
  });

  return toCompatRelation(await getOwnedRelation(relation.id, canvasId));
}

export async function deleteKnowledgeRelation(
  relationId: string,
  canvasId: string
) {
  await getOwnedRelation(relationId, canvasId);
  await prisma.knowledgeGraphEdge.delete({ where: { id: relationId } });
}
