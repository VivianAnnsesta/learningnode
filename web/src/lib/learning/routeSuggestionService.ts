import { randomUUID } from "crypto";
import { prisma } from "../prisma";
import { getLearningNodeDetails } from "./domainMapService";
import type { RouteSuggestion, RouteSuggestionLevel } from "./types";

const levelChangesMap: Record<RouteSuggestionLevel, boolean> = {
  L1: false,
  L2: true,
  L3: true
};

export function classifyRouteSuggestionLevel(
  level: RouteSuggestionLevel
): { changesMap: boolean; requiresManualMapConfirmation: boolean } {
  return {
    changesMap: levelChangesMap[level],
    requiresManualMapConfirmation: level !== "L1"
  };
}

const parsePayload = (payload: string | null | undefined) => {
  if (!payload?.trim()) return {};
  try {
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return {};
  }
};

const toPublicSuggestion = (row: {
  id: string;
  domainId: string;
  sourceNodeId: string | null;
  level: string;
  title: string;
  rationale: string;
  changesMap: boolean;
  status: string;
  payload: string | null;
}): RouteSuggestion => ({
  id: row.id,
  domainId: row.domainId,
  sourceNodeId: row.sourceNodeId || "",
  level: row.level as RouteSuggestionLevel,
  title: row.title,
  rationale: row.rationale,
  changesMap: row.changesMap,
  status: row.status as RouteSuggestion["status"],
  payload: parsePayload(row.payload)
});

async function insertSuggestion(input: Omit<RouteSuggestion, "status">) {
  await prisma.routeSuggestion.create({
    data: {
      id: input.id,
      domainId: input.domainId,
      sourceNodeId: input.sourceNodeId,
      level: input.level,
      title: input.title,
      rationale: input.rationale,
      changesMap: input.changesMap,
      status: "candidate",
      payload: JSON.stringify(input.payload)
    }
  });
}

export async function createRouteSuggestionsForNode(nodeId: string) {
  const details = await getLearningNodeDetails(nodeId);
  const node = details.node;
  if (!node) throw new Error("Learning node not found.");

  const domainId = details.domain.id;
  const basePayload = {
    sourceNodeId: node.id,
    sourceTitle: node.title,
    moduleId: node.moduleId
  };

  const suggestions: Array<Omit<RouteSuggestion, "status">> = [
    {
      id: randomUUID(),
      domainId,
      sourceNodeId: node.id,
      level: "L1",
      title: "在当前节点补做练习",
      rationale: "不改动地图，只保留稳定路线，并围绕当前节点增加一次聚焦练习。",
      changesMap: false,
      payload: {
        ...basePayload,
        action: "practice_in_place"
      }
    },
    {
      id: randomUUID(),
      domainId,
      sourceNodeId: node.id,
      level: "L2",
      title: `在“${node.title}”后添加补救节点`,
      rationale:
        "该建议会改动地图，当前只能作为候选保留。后续需要先转换为绑定版本的 Map Draft，再回到完整地图确认流程。",
      changesMap: true,
      payload: {
        ...basePayload,
        action: "add_remedial_node",
        remedialTitle: `补救：${node.title}`,
        remedialObjective: "修复阻塞当前节点的前置知识、误解或边界问题。"
      }
    },
    {
      id: randomUUID(),
      domainId,
      sourceNodeId: node.id,
      level: "L3",
      title: "重新整理当前单元",
      rationale:
        "该建议会重排领域地图，必须回到地图确认流程，不能在这里直接生效。",
      changesMap: true,
      payload: {
        ...basePayload,
        action: "manual_map_restructure"
      }
    }
  ];

  for (const suggestion of suggestions) {
    await insertSuggestion(suggestion);
  }

  return suggestions.map((suggestion) => ({
    ...suggestion,
    status: "candidate" as const
  }));
}

export async function createRouteSuggestionsFromDiagnosticAnswer(answerId: string) {
  const answer = await prisma.diagnosticAnswer.findUnique({
    where: { id: answerId },
    include: {
      question: {
        select: {
          learningNodeId: true
        }
      }
    }
  });

  if (!answer) throw new Error("Diagnostic answer not found.");
  if (!answer.assessment?.trim()) {
    throw new Error("Route suggestions require an evaluated diagnostic answer.");
  }
  const sourceNodeId =
    answer.question.learningNodeId ||
    (answer.question as { roadmapItemId?: string | null }).roadmapItemId ||
    null;
  if (!sourceNodeId) {
    throw new Error("Diagnostic answer is not linked to a learning node.");
  }

  return createRouteSuggestionsForNode(sourceNodeId);
}

async function getStoredSuggestion(id: string) {
  const row = await prisma.routeSuggestion.findUnique({
    where: { id },
    select: {
      id: true,
      domainId: true,
      sourceNodeId: true,
      level: true,
      title: true,
      rationale: true,
      changesMap: true,
      status: true,
      payload: true
    }
  });

  return row ? toPublicSuggestion(row) : null;
}

async function markSuggestionAccepted(id: string) {
  await prisma.routeSuggestion.update({
    where: { id },
    data: {
      status: "accepted",
      acceptedAt: new Date()
    }
  });
}

export async function acceptRouteSuggestion(
  id: string,
  _input: { confirmationReason?: string | null } = {}
) {
  const suggestion = await getStoredSuggestion(id);
  if (!suggestion) throw new Error("Route suggestion not found.");
  if (suggestion.status !== "candidate") return { suggestion, applied: false };

  if (suggestion.changesMap) {
    throw new Error(
      "Map-changing route suggestions must be converted to a versioned Domain Map draft and confirmed there."
    );
  }

  if (suggestion.level === "L1") {
    await markSuggestionAccepted(id);
    return { suggestion: { ...suggestion, status: "accepted" as const }, applied: false };
  }

  throw new Error("Unsupported route suggestion level.");
}
