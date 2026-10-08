import { createRouteSuggestionsForNode } from "../../../../../../../lib/learning/routeSuggestionService";
import { assertLearningNodeInDomain } from "../../../../../../../lib/learning/domainMapService";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string; nodeId: string }> }
) {
  const params = await context.params;
  try {
    await assertLearningNodeInDomain(params.id, params.nodeId);
    const suggestions = await createRouteSuggestionsForNode(params.nodeId);
    return Response.json({ suggestions });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "生成路线建议失败。";
    const status =
      message.includes("not found") ||
      message.includes("不存在") ||
      message.includes("不属于")
        ? 404
        : 500;
    return Response.json({ error: message }, { status });
  }
}
