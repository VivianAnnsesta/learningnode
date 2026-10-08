import { generateLongTermReviewInsightPack } from "../../../../../lib/ai/tutorService";
import { runAiRoute } from "../../../../../lib/learning/legacyAiRoute";
import { getLongTermReviewSummary } from "../../../../../lib/learning/roadmapService";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  try {
    const summary = await getLongTermReviewSummary(params.id);
    return Response.json({ summary });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "读取长期复盘数据失败。";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  return runAiRoute(
    () => generateLongTermReviewInsightPack(params.id),
    "生成长期学习包失败。"
  );
}
