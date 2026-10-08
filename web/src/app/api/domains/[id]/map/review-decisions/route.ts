import { resolveMapDraftQualityReview } from "../../../../../../lib/learning/mapDraftReviewService";

type ReviewDecisionRequest = {
  reviewId?: unknown;
  decision?: unknown;
  rationale?: unknown;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id: domainId } = await context.params;
  try {
    const body = (await request.json()) as ReviewDecisionRequest;
    const reviewId = typeof body.reviewId === "string" ? body.reviewId.trim() : "";
    const rationale = typeof body.rationale === "string" ? body.rationale.trim() : "";
    const decision = body.decision;
    if (!reviewId || !rationale) {
      return Response.json(
        { error: "reviewId 和裁决理由不能为空。" },
        { status: 400 }
      );
    }
    if (
      decision !== "dismiss_semantic" &&
      decision !== "acknowledge_unavailable"
    ) {
      return Response.json({ error: "不支持的复审裁决。" }, { status: 400 });
    }

    const result = await resolveMapDraftQualityReview({
      domainId,
      reviewId,
      decision,
      rationale
    });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "记录复审裁决失败。";
    const status = message.includes("MAP_REVIEW_STALE") ? 409 : 400;
    return Response.json({ error: message }, { status });
  }
}
