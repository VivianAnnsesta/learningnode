import { createHash } from "node:crypto";
import { prisma } from "../prisma";
import type { MapDraftQualityReport } from "../ai/tasks";
import { createUncertainPlanningKnowledgeReview } from "../ai/planningKnowledgeReview";
import { getRoadmapByDomain, type RoadmapInput } from "./roadmapService";
import { buildPlanningTeachingEvidence } from "./planningTeachingEvidence";

export type MapDraftReviewBinding = {
  status: string;
  scope?: string | null;
  stageKey?: string | null;
  draftHash: string;
  baseRevision: number;
  courseDesignAiCallLogId: string;
  availability?: string | null;
  resolutionJson?: string | null;
  reportJson?: string | null;
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
  const knowledge = parseJsonOr<MapDraftQualityReport | null>(input.review.reportJson || null, null)?.knowledgeReview;
  // A structural receipt can remain passed while an independent knowledge failure blocks acceptance.
  if (knowledge?.verdict === "confirmed_error") return "blocked";
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
  const draftHash = canonicalMapDraftDigest(input.draft);
  const availability = input.availability || "available";
  return prisma.$transaction(async (tx) => {
    let knowledgeReview = input.report.knowledgeReview;
    let inheritedLogIds: string[] = [];
    // A later opinion cannot erase a known error without changing the actual
    // candidate. Keep the original evidence across scopes and retry outcomes.
    const previous = await tx.mapDraftQualityReview.findMany({
      where: {
        domainId: input.domainId,
        draftHash,
        baseRevision: input.baseRevision,
        courseDesignAiCallLogId: input.courseDesignAiCallLogId
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { reportJson: true, aiCallLogIdsJson: true }
    });
    for (const review of previous) {
      const priorKnowledge = parseJsonOr<MapDraftQualityReport | null>(review.reportJson, null)?.knowledgeReview;
      if (priorKnowledge?.verdict === "confirmed_error") {
        knowledgeReview = priorKnowledge;
        inheritedLogIds = [
          ...parseJsonOr<string[]>(review.aiCallLogIdsJson, []),
          ...(priorKnowledge.aiCallLogIds || [])
        ];
        break;
      }
    }
    const aiCallLogIds = [...new Set([
      ...inheritedLogIds,
      ...(input.aiCallLogIds || []),
      ...(input.report.knowledgeReview?.aiCallLogIds || []),
      ...(knowledgeReview?.aiCallLogIds || [])
    ])];
    knowledgeReview ||= createUncertainPlanningKnowledgeReview(
      input.draft,
      [],
      availability === "unavailable"
        ? "AI 语义复审不可用，未取得本候选的独立知识核对报告。"
        : "本次规划回执未提供独立知识核对报告；结构通过不能证明知识正确。",
      aiCallLogIds
    );
    const report = {
      ...input.report,
      knowledgeReview: { ...knowledgeReview, acceptedDraftHash: draftHash },
      teachingEvidence: buildPlanningTeachingEvidence(input.draft, { ...input.report, knowledgeReview }, input.courseDesignAiCallLogId)
    };
    const receipt = await tx.mapDraftQualityReview.create({
      data: {
        domainId: input.domainId,
        scope: input.scope,
        stageKey: input.stageKey || null,
        baseRevision: input.baseRevision,
        draftHash,
        courseDesignAiCallLogId: input.courseDesignAiCallLogId,
        status: report.status,
        availability,
        createdAt: new Date(),
        reportJson: JSON.stringify(report),
        aiCallLogIdsJson: JSON.stringify(aiCallLogIds)
      }
    });
    return { ...receipt, report, aiCallLogIds };
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
  if (parseJsonOr<MapDraftQualityReport | null>(review.reportJson, null)?.knowledgeReview?.verdict === "confirmed_error") {
    throw new Error("MAP_QUALITY_BLOCKED: 明确知识错误必须先修正并重新核对；不能用结构裁决代替事实更正。");
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
