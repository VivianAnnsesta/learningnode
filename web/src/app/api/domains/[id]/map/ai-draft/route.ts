import {
  AiConfigurationError,
  AiProviderError
} from "../../../../../../lib/ai/provider";
import {
  generateRoadmapSkeletonDraft,
  generateRoadmapStageDraft,
  reviewRoadmapDraftQuality
} from "../../../../../../lib/ai/tutorService";
import {
  validateCourseDesignDraft,
  type MapDraftQualityReport
} from "../../../../../../lib/ai/tasks";
import { getCourseDesignState } from "../../../../../../lib/learning/courseDesignService";
import {
  getRoadmapByDomain,
  mergeRoadmapStageDraft,
  roadmapDraftToSkeleton,
  roadmapSkeletonToDraft,
  saveRoadmapDraft,
  type RoadmapInput
} from "../../../../../../lib/learning/roadmapService";
import {
  evaluateMapDraftReview,
  getBoundMapDraftReview,
  recordMapDraftQualityReview
} from "../../../../../../lib/learning/mapDraftReviewService";
import { checkLayeredStageContentRisk } from "../../../../../../lib/ai/roadmapPlanningQuality";
import { aiFailureReference, validationIssues } from "../../../../../../lib/ai/validationEvidence";
import { AiLogPersistenceError } from "../../../../../../lib/ai/generationEvidence";

type RoadmapAiDraftPayload = {
  step?: "skeleton" | "stage";
  skeleton?: unknown;
  stageIndex?: number;
  stageKey?: string;
  baseRevision?: number;
  courseDesign?: unknown;
  courseDesignAiCallLogId?: string | null;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  try {
    const payload = (await request.json().catch(() => ({}))) as RoadmapAiDraftPayload;
    const state = await getCourseDesignState(params.id);
    let courseDesign;
    if (payload.courseDesign) {
      validateCourseDesignDraft(payload.courseDesign);
      if (state.status !== "draft" || !state.draft) {
        throw new Error("课程设计方向已失效，请重新研究后再生成领域地图。");
      }
      courseDesign = state.draft;
    } else {
      if (state.status !== "confirmed" || !state.draft) {
        throw new Error("请先确认课程设计方向，再生成或确认领域地图。");
      }
      courseDesign = state.draft;
    }
    if (!courseDesign.qualityGate.passed) {
      throw new Error("课程设计方向未通过质量门禁，不能生成领域地图。");
    }
    if (!state.aiCallLogId) {
      throw new Error("课程设计方向缺少 AI 生成凭据，请重新研究后再生成领域地图。");
    }
    if (
      payload.courseDesignAiCallLogId &&
      payload.courseDesignAiCallLogId !== state.aiCallLogId
    ) {
      throw new Error("课程设计方向已更新，请刷新后重新生成领域地图。");
    }
    const step = payload.step || "skeleton";
    if (step === "skeleton") {
      const roadmap = await getRoadmapByDomain(params.id);
      const baseRevision = roadmap?.mapRevision || 0;
      const expectedCurrentDraft = roadmap?.draft || null;
      const result = await generateRoadmapSkeletonDraft(params.id, {
        courseDesign
      });
      const draft = roadmapSkeletonToDraft(result.skeleton, baseRevision);
      const saved = await saveRoadmapDraft(
        params.id,
        draft,
        state.aiCallLogId,
        { expectedCurrentDraft }
      );
      const receipt = await recordMapDraftQualityReview({
        domainId: params.id,
        scope: "skeleton",
        draft: saved.draft,
        baseRevision: saved.mapRevision,
        courseDesignAiCallLogId: state.aiCallLogId,
        report: result.qualityReport,
        aiCallLogIds: result.aiCallLogIds,
        availability: result.reviewAvailability
      });

      if (result.reviewAvailability === "unavailable") {
        return Response.json({
          ...result,
          draft: saved.draft,
          mapRevision: saved.mapRevision,
          reviewState: "unavailable",
          qualityReview: {
            id: receipt.id,
            availability: "unavailable"
          },
          courseDesignAiCallLogId: state.aiCallLogId
        });
      }

      if (result.qualityReport.status === "blocked") {
        return Response.json(
          {
            error: `MAP_QUALITY_BLOCKED: ${result.qualityReport.summary}`,
            ...result,
            draft: saved.draft,
            mapRevision: saved.mapRevision,
            reviewState: "blocked",
            qualityReview: {
              id: receipt.id,
              availability: "available"
            },
            courseDesignAiCallLogId: state.aiCallLogId
          },
          { status: 422 }
        );
      }

      return Response.json({
        ...result,
        draft: saved.draft,
        mapRevision: saved.mapRevision,
        reviewState: "passed",
        qualityReview: {
          id: receipt.id,
          availability: "available"
        },
        courseDesignAiCallLogId: state.aiCallLogId
      });
    }

    const roadmap = await getRoadmapByDomain(params.id);
    const serverDraft: RoadmapInput | null =
      roadmap?.draft ||
      (roadmap?.planningVersion === 3
        ? {
            planningVersion: 3 as const,
            ...(roadmap.contentCoverageVersion?{contentCoverageVersion:roadmap.contentCoverageVersion}:{}),
            learningGoals: roadmap.learningGoals,
            title: roadmap.title,
            status: "draft",
            baseRevision: roadmap.mapRevision,
            stages: roadmap.stages
          }
        : null);
    if (!roadmap || !serverDraft || serverDraft.planningVersion !== 3) {
      throw new Error("请先生成并保存分层路线蓝图，再展开 Stage。");
    }
    if (
      roadmap.draft &&
      roadmap.draftCourseDesignAiCallLogId !== state.aiCallLogId
    ) {
      throw new Error("课程设计方向已更新，请重新生成领域地图草稿。");
    }
    if (
      !Number.isInteger(payload.baseRevision) ||
      payload.baseRevision !== roadmap.mapRevision
    ) {
      throw new Error(
        `地图已更新，请刷新后重试。当前版本 ${roadmap.mapRevision}。`
      );
    }
    const stageKey = payload.stageKey?.trim();
    if (!stageKey) {
      throw new Error("请提供要展开的 Stage key。");
    }
    const skeleton = roadmapDraftToSkeleton(serverDraft);
    const stageIndex = skeleton.stages.findIndex(
      (stage) => stage.key === stageKey
    );
    if (stageIndex < 0) {
      throw new Error(`路线蓝图中不存在 Stage "${stageKey}"。`);
    }
    const isCurrentConfirmedV3Baseline =
      !roadmap.draft &&
      roadmap.status === "confirmed" &&
      roadmap.planningVersion === 3;
    const priorReviewState = isCurrentConfirmedV3Baseline
      ? "passed"
      : evaluateMapDraftReview({
          draft: serverDraft,
          baseRevision: roadmap.mapRevision,
          courseDesignAiCallLogId: state.aiCallLogId,
          review: await getBoundMapDraftReview(params.id)
        });
    const generated = await generateRoadmapStageDraft(params.id, {
      courseDesign,
      skeleton,
      stageIndex,
      knownConcepts: (serverDraft.stages || []).flatMap(stage=>(stage.modules || []).flatMap(module=>(module.items || []).map(item=>({key:item.key!,title:item.title!,concept:item.concept}))))
    });
    let draft = mergeRoadmapStageDraft(
      serverDraft,
      stageKey,
      generated.stage
    );
    const risk = checkLayeredStageContentRisk(
      generated.stage,
      skeleton.stages[stageIndex]
    );
    let qualityReport: MapDraftQualityReport = {
      status: "passed" as const,
      summary: "规划问题覆盖完整，未发现需要额外 AI 复审的语义风险。",
      blockingIssues: [],
      warnings: []
    };
    const generatedLogIds: Array<string | null | undefined> =
      generated.aiCallLogIds || [generated.aiCallLogId];
    let aiCallLogIds = generatedLogIds.filter(
      (id): id is string => Boolean(id)
    );
    let repairAttempts = 0;
    const requiresSemanticReview =
      draft.planningVersion === 3 || risk.needsAiReview || !["passed", "resolved"].includes(priorReviewState);
    const reviewScope = requiresSemanticReview ? "map" : "stage";
    let reviewAvailability: "available" | "unavailable" = "available";
    if (requiresSemanticReview) {
      try {
        const reviewed = await reviewRoadmapDraftQuality(params.id, {
          courseDesign,
          draft,
          scope: reviewScope,
          stageKey
        });
        draft = reviewed.draft;
        qualityReport = reviewed.qualityReport;
        aiCallLogIds = [...aiCallLogIds, ...reviewed.aiCallLogIds].filter(
          (id): id is string => Boolean(id)
        );
        repairAttempts = reviewed.repairAttempts;
      } catch (error) {
        if (
          !(error instanceof AiConfigurationError) &&
          !(error instanceof AiProviderError)
        ) {
          throw error;
        }
        reviewAvailability = "unavailable";
        qualityReport = {
          status: "blocked",
          summary: "AI 语义复审暂不可用；这不是路线内容缺陷。",
          blockingIssues: [],
          warnings: [
            {
              code: "reviewUnavailable",
              targetKey: stageKey,
              message: error.message,
              suggestion: "稍后重试，或在人工核对结构后明确确认风险。"
            }
          ]
        };
      }
    }
    const saved = await saveRoadmapDraft(
      params.id,
      draft,
      state.aiCallLogId,
      { expectedCurrentDraft: roadmap.draft || null }
    );
    const receipt = await recordMapDraftQualityReview({
      domainId: params.id,
      scope: reviewScope,
      stageKey,
      draft: saved.draft,
      baseRevision: saved.mapRevision,
      courseDesignAiCallLogId: state.aiCallLogId,
      report: qualityReport,
      aiCallLogIds,
      availability: reviewAvailability
    });
    const savedStage = saved.draft.stages?.find(
      (stage) => stage.key === stageKey
    );

    if (reviewAvailability === "unavailable") {
      return Response.json({
        ...generated,
        stage: savedStage || generated.stage,
        draft: saved.draft,
        qualityReport,
        reviewState: "unavailable",
        qualityReview: {
          id: receipt.id,
          availability: "unavailable"
        },
        aiCallLogIds,
        repairAttempts,
        courseDesignAiCallLogId: state.aiCallLogId
      });
    }

    if (qualityReport.status === "blocked") {
      return Response.json(
        {
          error: `MAP_QUALITY_BLOCKED: ${qualityReport.summary}`,
          stage: savedStage || generated.stage,
          draft: saved.draft,
          qualityReport,
          reviewState: "blocked",
          qualityReview: {
            id: receipt.id,
            availability: "available"
          },
          aiCallLogIds,
          repairAttempts,
          courseDesignAiCallLogId: state.aiCallLogId
        },
        { status: 422 }
      );
    }

    return Response.json({
      ...generated,
      stage: savedStage || generated.stage,
      draft: saved.draft,
      qualityReport,
      reviewState: "passed",
      qualityReview: {
        id: receipt.id,
        availability: "available"
      },
      aiCallLogIds,
      repairAttempts,
      courseDesignAiCallLogId: state.aiCallLogId
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "生成领域地图草稿失败。";
    const status =
      error instanceof AiLogPersistenceError
        ? 500
        : error instanceof AiConfigurationError
        ? 503
        : message.includes("地图已更新")
          ? 409
          : message.includes("MAP_QUALITY_BLOCKED")
            ? 422
            : 400;
    const evidence = aiFailureReference(error);
    return Response.json({ error: message, ...evidence, ...(evidence.aiCallLogId && error instanceof Error && "issues" in error ? { validationIssues: validationIssues(error) } : {}) }, { status });
  }
}
