import { getLearningNodeDetails } from "../../../../../../lib/learning/domainMapService";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; nodeId: string }> }
) {
  const params = await context.params;
  try {
    const details = await getLearningNodeDetails(params.nodeId);
    if (details.domain.id !== params.id) {
      return Response.json({ error: "学习节点不属于该领域。" }, { status: 404 });
    }
    return Response.json(details);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "读取学习节点失败。";
    const status =
      message.includes("not found") || message.includes("未找到") ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}

export async function PATCH(
  _request: Request,
  _context: { params: Promise<{ id: string; nodeId: string }> }
) {
  return Response.json(
    { error: "请通过完成节点接口提交自己的理解；此接口不接受掌握状态写入。" },
    { status: 405, headers: { Allow: "GET" } }
  );
}
