import {
  getLegacyCoreReview,
  LegacyCoreReviewError,
  saveLegacyCoreReview,
  type SaveLegacyCoreReviewInput
} from "../../../../../lib/learning/coreReviewService";

// Legacy compatibility endpoint. PRD v1.2 learning flows no longer depend on this route.

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const { searchParams } = new URL(request.url);
  const canvasId = searchParams.get("canvasId")?.trim();

  if (!canvasId) {
    return Response.json({ error: "canvasId 不能为空。" }, { status: 400 });
  }

  try {
    return Response.json(await getLegacyCoreReview(params.id, canvasId));
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取复盘失败。";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const { searchParams } = new URL(request.url);
  const canvasId = searchParams.get("canvasId")?.trim();

  if (!canvasId) {
    return Response.json({ error: "canvasId 不能为空。" }, { status: 400 });
  }

  let payload: SaveLegacyCoreReviewInput;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "请求体不是合法的 JSON。" }, { status: 400 });
  }

  try {
    return Response.json(await saveLegacyCoreReview(params.id, canvasId, payload));
  } catch (error) {
    if (error instanceof LegacyCoreReviewError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : "保存复盘失败。";
    return Response.json({ error: message }, { status: 500 });
  }
}
