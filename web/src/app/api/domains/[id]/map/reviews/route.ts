import {
  AiConfigurationError,
  AiProviderError
} from "../../../../../../lib/ai/provider";
import { reviewRoadmapDraftQuality } from "../../../../../../lib/ai/tutorService";
import { getCourseDesignState } from "../../../../../../lib/learning/courseDesignService";
import {
  getRoadmapByDomain,
  saveRoadmapDraft,
  type RoadmapStageInput
} from "../../../../../../lib/learning/roadmapService";
import {
  evaluateMapDraftReview,
  getBoundMapDraftReview,
  recordMapDraftQualityReview
} from "../../../../../../lib/learning/mapDraftReviewService";
import { AiLogPersistenceError } from "../../../../../../lib/ai/generationEvidence";
import { aiFailureReference, validationIssues } from "../../../../../../lib/ai/validationEvidence";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: domainId } = await context.params;
  let unavailableContext:
    | {
        roadmap: NonNullable<Awaited<ReturnType<typeof getRoadmapByDomain>>>;
        courseDesignAiCallLogId: string;
        scope: "skeleton" | "map";
        stageKey?: string;
      }
    | null = null;
  try {
    const requestText = await request.text();
    const payload: unknown = requestText.trim() ? JSON.parse(requestText) : {};
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      throw new Error("复核请求必须是 JSON 对象。");
    }
    const options = payload as { scope?: unknown; stageKey?: unknown; feedback?: unknown };
    if (options.feedback !== undefined && (typeof options.feedback !== "string" || options.feedback.length > 6000)) throw new Error("修订意见必须是6000字符以内的文字。");
    if (options.stageKey !== undefined && (typeof options.stageKey !== "string" || !options.stageKey.trim())) {
      throw new Error("请提供有效的目标 Stage key。");
    }
    let stageKey = typeof options.stageKey === "string" ? options.stageKey.trim() : undefined;
    if (options.scope === "stage" && !stageKey) {
      throw new Error("阶段复核需要提供目标 Stage key。");
    }
    const [courseDesignState, roadmap] = await Promise.all([
      getCourseDesignState(domainId),
      getRoadmapByDomain(domainId)
    ]);

    if (
      !courseDesignState.draft ||
      !["draft", "confirmed"].includes(courseDesignState.status) ||
      !courseDesignState.draft.qualityGate.passed ||
      !courseDesignState.aiCallLogId
    ) {
      throw new Error("课程设计方向已失效，请重新研究后再复审路线。");
    }
    if (!roadmap?.draft || roadmap.draft.planningVersion !== 3) {
      throw new Error("旧版或缺失的路线草稿必须重新生成分层蓝图。");
    }
    if (
      roadmap.draftCourseDesignAiCallLogId !== courseDesignState.aiCallLogId
    ) {
      throw new Error("MAP_REVIEW_STALE: 路线草稿绑定的是旧课程设计，请重新生成。");
    }
    const scope = roadmap.draft.stages?.some(
      (stage: { status?: string | null; modules?: unknown[] }) =>
        stage.status === "expanded" || Boolean(stage.modules?.length)
    )
      ? "map"
      : "skeleton";
    // An empty retry request can recover the previous Stage repair boundary,
    // but only while that receipt still matches the server's current draft.
    if (!stageKey && options.scope === undefined) {
      const previousReview = await getBoundMapDraftReview(domainId);
      if (previousReview?.stageKey && evaluateMapDraftReview({
        draft: roadmap.draft,
        baseRevision: roadmap.mapRevision,
        courseDesignAiCallLogId: courseDesignState.aiCallLogId,
        review: previousReview
      }) !== "stale") {
        stageKey = previousReview.stageKey;
      }
    }
    if (stageKey && !roadmap.draft.stages?.some((stage: RoadmapStageInput) => stage.key === stageKey && stage.status === "expanded")) {
      throw new Error("只能复核当前草稿中已展开的目标阶段。");
    }
    unavailableContext = {
      roadmap,
      courseDesignAiCallLogId: courseDesignState.aiCallLogId,
      scope,
      stageKey
    };

    const reviewed = await reviewRoadmapDraftQuality(domainId, {
      courseDesign: courseDesignState.draft,
      draft: roadmap.draft,
      scope,
      stageKey,
      feedback: typeof options.feedback === "string" ? options.feedback : null
    });
    const saved = await saveRoadmapDraft(
      domainId,
      reviewed.draft,
      courseDesignState.aiCallLogId,
      { expectedCurrentDraft: roadmap.draft }
    );
    const receipt = await recordMapDraftQualityReview({
      domainId,
      scope,
      stageKey,
      draft: saved.draft,
      baseRevision: saved.mapRevision,
      courseDesignAiCallLogId: courseDesignState.aiCallLogId,
      report: reviewed.qualityReport,
      aiCallLogIds: reviewed.aiCallLogIds
    });
    const report = receipt.report;

    if (report.status === "blocked" || report.knowledgeReview?.verdict === "confirmed_error") {
      return Response.json(
        {
          error: `MAP_QUALITY_BLOCKED: ${report.knowledgeReview?.verdict === "confirmed_error" ? report.knowledgeReview.summary : report.summary}`,
          draft: saved.draft,
          mapRevision: saved.mapRevision,
          reviewState: "blocked",
          qualityReview: {
            id: receipt.id,
            availability: "available"
          },
          qualityReport: report,
          aiCallLogIds: receipt.aiCallLogIds,
          repairAttempts: reviewed.repairAttempts
        },
        { status: 422 }
      );
    }

    return Response.json({
      draft: saved.draft,
      mapRevision: saved.mapRevision,
      reviewState: "passed",
      qualityReview: {
        id: receipt.id,
        availability: "available"
      },
      qualityReport: report,
      aiCallLogIds: receipt.aiCallLogIds,
      repairAttempts: reviewed.repairAttempts
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "路线复审失败。";
    if (
      unavailableContext &&
      (error instanceof AiConfigurationError || error instanceof AiProviderError)
    ) {
      const report = {
        status: "blocked" as const,
        summary: "AI 语义复审暂不可用；这不是路线内容缺陷。",
        blockingIssues: [],
        warnings: [
          {
            code: "reviewUnavailable",
            targetKey: null,
            message,
            suggestion: "稍后重试，或在人工核对结构后明确确认风险。"
          }
        ]
      };
      const failure = aiFailureReference(error);
      const failureLogIds = [...new Set([...(failure.aiCallLogIds || []), ...(failure.aiCallLogId ? [failure.aiCallLogId] : [])])];
      const receipt = await recordMapDraftQualityReview({
        domainId,
        scope: unavailableContext.scope,
        stageKey: unavailableContext.stageKey,
        draft: unavailableContext.roadmap.draft!,
        baseRevision: unavailableContext.roadmap.mapRevision,
        courseDesignAiCallLogId:
          unavailableContext.courseDesignAiCallLogId,
        report,
        aiCallLogIds: failureLogIds,
        availability: "unavailable"
      });
      const knowledgeBlocked = receipt.report.knowledgeReview?.verdict === "confirmed_error";
      return Response.json({
        ...(knowledgeBlocked ? { error: `MAP_QUALITY_BLOCKED: ${receipt.report.knowledgeReview!.summary}` } : {}),
        draft: unavailableContext.roadmap.draft,
        mapRevision: unavailableContext.roadmap.mapRevision,
        reviewState: knowledgeBlocked ? "blocked" : "unavailable",
        qualityReport: receipt.report,
        qualityReview: {
          id: receipt.id,
          availability: "unavailable"
        },
        aiCallLogIds: receipt.aiCallLogIds,
        repairAttempts: 0
      }, { status: knowledgeBlocked ? 422 : 200 });
    }
    const status =
      error instanceof AiLogPersistenceError
        ? 500
        : error instanceof AiConfigurationError
        ? 503
        : message.includes("MAP_REVIEW_STALE") || message.includes("地图已更新")
          ? 409
          : message.includes("MAP_QUALITY_BLOCKED")
            ? 422
            : 400;
    return Response.json({ error: message, ...aiFailureReference(error), validationIssues: validationIssues(error) }, { status });
  }
}
