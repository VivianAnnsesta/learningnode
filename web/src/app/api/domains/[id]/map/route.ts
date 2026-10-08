import {
  confirmDomainMap,
  getDomainMap,
  patchDomainMapStatus
} from "../../../../../lib/learning/domainMapService";
import { validateCourseDesignDraft } from "../../../../../lib/ai/tasks";
import type { RoadmapInput } from "../../../../../lib/learning/roadmapService";
import {
  getRoadmapByDomain,
  saveRoadmapDraft
} from "../../../../../lib/learning/roadmapService";
import {
  evaluateMapDraftReview,
  getBoundMapDraftReview
} from "../../../../../lib/learning/mapDraftReviewService";

type MapMutationPayload = {
  draft?: RoadmapInput;
  roadmap?: RoadmapInput;
  reason?: string | null;
  status?: string | null;
  courseDesign?: unknown;
  courseDesignAiCallLogId?: string | null;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  try {
    const [map, roadmap] = await Promise.all([
      getDomainMap(params.id),
      getRoadmapByDomain(params.id)
    ]);
    const boundReview = roadmap?.draft
      ? await getBoundMapDraftReview(params.id)
      : null;
    const reviewState =
      roadmap?.draft && roadmap.draftCourseDesignAiCallLogId
        ? evaluateMapDraftReview({
            draft: roadmap.draft,
            baseRevision: roadmap.mapRevision,
            courseDesignAiCallLogId:
              roadmap.draftCourseDesignAiCallLogId,
            review: boundReview
          })
        : null;
    return Response.json({
      map,
      draft: roadmap?.draft || null,
      mapRevision: roadmap?.mapRevision || 0,
      draftStatus: roadmap?.status || "draft",
      draftCourseDesignAiCallLogId:
        roadmap?.draftCourseDesignAiCallLogId || null,
      qualityReview: boundReview
        ? {
            id: boundReview.id,
            state: reviewState,
            availability: boundReview.availability,
            scope: boundReview.scope,
            stageKey: boundReview.stageKey,
            report: boundReview.report,
            resolution: boundReview.resolution,
            aiCallLogIds: boundReview.aiCallLogIds,
            createdAt: boundReview.createdAt
          }
        : reviewState
          ? { state: reviewState, report: null }
          : null
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取领域地图失败。";
    const status = message.includes("not found") ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  let payload: MapMutationPayload;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "请求体不是合法的 JSON。" }, { status: 400 });
  }

  const draft = payload.draft || payload.roadmap || (payload as RoadmapInput);

  try {
    let courseDesign: ReturnType<typeof validateCourseDesignDraft> | undefined;
    if (payload.courseDesign) {
      courseDesign = validateCourseDesignDraft(payload.courseDesign);
      if (!courseDesign.qualityGate.passed) {
        return Response.json(
          {
            error: "课程设计方向未通过质量门，不能确认领域地图。",
            qualityGate: courseDesign.qualityGate
          },
          { status: 400 }
        );
      }
    }

    const roadmap = await confirmDomainMap(
      params.id,
      draft,
      payload.reason,
      courseDesign
    );
    const map = await getDomainMap(params.id);
    return Response.json({ roadmap, map });
  } catch (error) {
    const message = error instanceof Error ? error.message : "确认领域地图失败。";
    const status =
      message.includes("MAP_REVIEW_STALE") || message.includes("地图已更新")
        ? 409
        : message.includes("MAP_QUALITY_BLOCKED")
          ? 422
          : 400;
    return Response.json({ error: message }, { status });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  let payload: MapMutationPayload;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "请求体不是合法的 JSON。" }, { status: 400 });
  }

  try {
    if (payload.draft) {
      const saved = await saveRoadmapDraft(
        params.id,
        payload.draft,
        payload.courseDesignAiCallLogId
      );
      const boundReview = await getBoundMapDraftReview(params.id);
      const reviewState = evaluateMapDraftReview({
        draft: saved.draft,
        baseRevision: saved.mapRevision,
        courseDesignAiCallLogId: saved.courseDesignAiCallLogId,
        review: boundReview
      });
      return Response.json({ ...saved, reviewState });
    }
    if (!payload.status?.trim()) {
      return Response.json({ error: "draft 或 status 至少提供一项。" }, { status: 400 });
    }
    const roadmap = await patchDomainMapStatus(
      params.id,
      payload.status,
      payload.reason
    );
    const map = await getDomainMap(params.id);
    return Response.json({ roadmap, map });
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新领域地图失败。";
    const status = message.includes("地图已更新") ? 409 : 400;
    return Response.json({ error: message }, { status });
  }
}
