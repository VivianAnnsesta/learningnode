import {
  assertLearningNodeInDomain,
  completeLearningNode
} from "../../../../../../../lib/learning/domainMapService";
import type { LearningNodeProgressInput } from "../../../../../../../lib/learning/roadmapService";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; nodeId: string }> }
) {
  const params = await context.params;
  let payload: LearningNodeProgressInput = {};

  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  try {
    await assertLearningNodeInDomain(params.id, params.nodeId);
    const result = await completeLearningNode(params.nodeId, payload);
    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "完成学习节点失败。";
    const status =
      message.includes("not found") ||
      message.includes("不存在") ||
      message.includes("不属于")
        ? 404
        : 400;
    return Response.json({ error: message }, { status });
  }
}
