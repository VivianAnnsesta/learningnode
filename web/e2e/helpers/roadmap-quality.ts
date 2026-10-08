import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)])
    );
  }
  return value;
}

export function mapDraftDigest(draft: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(draft)), "utf8")
    .digest("hex");
}

export async function recordPassingMapDraftReview(
  prisma: PrismaClient,
  input: {
    domainId: string;
    draft: Record<string, unknown>;
    courseDesignAiCallLogId: string;
    scope?: "skeleton" | "stage" | "map";
    stageKey?: string | null;
  }
) {
  const baseRevision = Number(input.draft.baseRevision || 0);
  return prisma.mapDraftQualityReview.create({
    data: {
      domainId: input.domainId,
      scope: input.scope || "map",
      stageKey: input.stageKey || null,
      baseRevision,
      draftHash: mapDraftDigest(input.draft),
      courseDesignAiCallLogId: input.courseDesignAiCallLogId,
      status: "passed",
      reportJson: JSON.stringify({
        status: "passed",
        summary: "Deterministic E2E quality receipt.",
        blockingIssues: [],
        warnings: []
      }),
      aiCallLogIdsJson: "[]"
    }
  });
}
