import { createHash } from "node:crypto";
import { prisma } from "../prisma";
import type { MapDraftQualityReport } from "../ai/tasks";
import { getRoadmapByDomain, type RoadmapInput } from "./roadmapService";

export type MapDraftReviewBinding = {
  status: string;
  scope?: string | null;
  stageKey?: string | null;
  draftHash: string;
  baseRevision: number;
  courseDesignAiCallLogId: string;
  availability?: string | null;
  resolutionJson?: string | null;
};

export type MapDraftReviewState =
  | "passed"
  | "resolved"
  | "blocked"
  | "unavailable"
  | "stale"
  | "legacy";

export type MapDraftReviewResolution = {
  kind: "dismissed" | "unavailable_acknowledged";
  rationale: string;
  draftHash: string;
  resolvedAt: string;
};

type MapDraftReviewEvaluationInput = {
  draft: RoadmapInput | Record<string, unknown>;
  baseRevision: number;
  courseDesignAiCallLogId: string;
  review: MapDraftReviewBinding | null | undefined;
  expectedScopes?: Array<"skeleton" | "stage" | "map">;
  expectedStageKey?: string | null;
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
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

export function canonicalMapDraftDigest(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(value)), "utf8")
    .digest("hex");
}

export function evaluateMapDraftReview(
  input: MapDraftReviewEvaluationInput
): MapDraftReviewState {
  if ((input.draft as RoadmapInput).planningVersion !== 3) {
    return "legacy";
  }
  if (!input.review) {
    return "stale";
  }
  if (
    input.review.draftHash !== canonicalMapDraftDigest(input.draft) ||
    input.review.baseRevision !== input.baseRevision ||
    input.review.courseDesignAiCallLogId !== input.courseDesignAiCallLogId
  ) {
    return "stale";
  }
  if (
    input.expectedScopes?.length &&
    (!input.review.scope || !input.expectedScopes.includes(
      input.review.scope as "skeleton" | "stage" | "map"
    ))
  ) {
    return "stale";
  }
  if (
    input.expectedStageKey !== undefined &&
    input.review.scope === "stage" &&
    input.review.stageKey !== input.expectedStageKey
  ) {
    return "stale";
  }
  if (input.review.status === "passed") return "passed";
  const resolution = parseJsonOr<MapDraftReviewResolution | null>(
    input.review.resolutionJson || null,
    null
  );
  const isUnavailable = input.review.availability === "unavailable";
  const matchingResolutionKind = isUnavailable
    ? resolution?.kind === "unavailable_acknowledged"
    : resolution?.kind === "dismissed";
  if (
    resolution &&
    matchingResolutionKind &&
    resolution.rationale.trim() &&
    resolution.draftHash === input.review.draftHash
  ) {
    return "resolved";
  }
  if (isUnavailable) return "unavailable";
  return "blocked";
}

export function assertPassingMapDraftReview(
  input: MapDraftReviewEvaluationInput
) {
  const state = evaluateMapDraftReview(input);
  if (state === "passed" || state === "resolved") return;
  if (state === "blocked") {
    throw new Error("MAP_QUALITY_BLOCKED: 路线仍有严重质量问题，不能确认正式地图。");
  }
  if (state === "unavailable") {
    throw new Error("MAP_REVIEW_UNAVAILABLE: AI 语义复审暂不可用，请重试或确认风险后继续。");
  }
  if (state === "legacy") {
    throw new Error("MAP_REVIEW_STALE: 旧版未确认草稿必须按分层质量规则重新生成。");
  }
  throw new Error("MAP_REVIEW_STALE: 路线内容或规划依据已变化，请重新复审。");
}

export async function recordMapDraftQualityReview(input: {
  domainId: string;
  scope: "skeleton" | "stage" | "map";
  stageKey?: string | null;
  draft: RoadmapInput | Record<string, unknown>;
  baseRevision: number;
  courseDesignAiCallLogId: string;
  report: MapDraftQualityReport;
  aiCallLogIds?: string[];
  availability?: "available" | "unavailable";
}) {
  if ((input.draft as RoadmapInput).planningVersion !== 3) {
    throw new Error("只有 planningVersion=3 的路线草稿可以记录质量复审。");
  }
  return prisma.mapDraftQualityReview.create({
    data: {
      domainId: input.domainId,
      scope: input.scope,
      stageKey: input.stageKey || null,
      baseRevision: input.baseRevision,
      draftHash: canonicalMapDraftDigest(input.draft),
      courseDesignAiCallLogId: input.courseDesignAiCallLogId,
      status: input.report.status,
      availability: input.availability || "available",
      createdAt: new Date(),
      reportJson: JSON.stringify(input.report),
      aiCallLogIdsJson: JSON.stringify(input.aiCallLogIds || [])
    }
  });
}

function parseJsonOr<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export async function getBoundMapDraftReview(domainId: string) {
  const review = await prisma.mapDraftQualityReview.findFirst({
    where: { domainId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }]
  });
  if (!review) return null;
  return {
    ...review,
    report: parseJsonOr<MapDraftQualityReport | null>(review.reportJson, null),
    aiCallLogIds: parseJsonOr<string[]>(review.aiCallLogIdsJson, []),
    resolution: parseJsonOr<MapDraftReviewResolution | null>(
      review.resolutionJson,
      null
    )
  };
}

export async function resolveMapDraftQualityReview(input: {
  domainId: string;
  reviewId: string;
  decision: "dismiss_semantic" | "acknowledge_unavailable";
  rationale: string;
}) {
  const rationale = input.rationale.trim();
  if (rationale.length < 8) {
    throw new Error("请用至少 8 个字符说明裁决理由。");
  }
  if (rationale.length > 1000) {
    throw new Error("裁决理由不能超过 1000 个字符。");
  }

  const [review, roadmap] = await Promise.all([
    prisma.mapDraftQualityReview.findFirst({
      where: { domainId: input.domainId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }]
    }),
    getRoadmapByDomain(input.domainId)
  ]);
  if (!review || review.id !== input.reviewId) {
    throw new Error("MAP_REVIEW_STALE: 只能裁决当前路线草稿的最新复审。");
  }
  if (!roadmap?.draft || !roadmap.draftCourseDesignAiCallLogId) {
    throw new Error("MAP_REVIEW_STALE: 当前没有可裁决的路线草稿。");
  }

  const currentState = evaluateMapDraftReview({
    draft: roadmap.draft,
    baseRevision: roadmap.mapRevision,
    courseDesignAiCallLogId: roadmap.draftCourseDesignAiCallLogId,
    review
  });
  const expectedState =
    input.decision === "dismiss_semantic" ? "blocked" : "unavailable";
  if (currentState !== expectedState) {
    throw new Error(
      currentState === "stale"
        ? "MAP_REVIEW_STALE: 路线草稿已变化，请重新复审。"
        : "当前复审状态不允许这个裁决。"
    );
  }

  const resolution: MapDraftReviewResolution = {
    kind:
      input.decision === "dismiss_semantic"
        ? "dismissed"
        : "unavailable_acknowledged",
    rationale,
    draftHash: review.draftHash,
    resolvedAt: new Date().toISOString()
  };
  const updated = await prisma.mapDraftQualityReview.updateMany({
    where: {
      id: review.id,
      domainId: input.domainId,
      resolutionJson: null
    },
    data: { resolutionJson: JSON.stringify(resolution) }
  });
  if (updated.count !== 1) {
    throw new Error("MAP_REVIEW_STALE: 复审已经被裁决，请刷新后重试。");
  }

  return {
    reviewId: review.id,
    state: "resolved" as const,
    resolution
  };
}
