import { prisma } from "../prisma";
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
