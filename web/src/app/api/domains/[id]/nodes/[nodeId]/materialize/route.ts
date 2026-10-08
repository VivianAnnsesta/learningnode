import { assertLearningNodeInDomain } from "../../../../../../../lib/learning/domainMapService";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string; nodeId: string }> }
) {
  const params = await context.params;
  try {
    await assertLearningNodeInDomain(params.id, params.nodeId);
    return Response.json(
      { error: "请先提交自己的理解，并通过完成节点接口确认沉淀。" },
      { status: 409 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "沉淀知识点失败。";
    const status = message.includes("不存在") ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}
