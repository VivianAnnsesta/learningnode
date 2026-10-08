import { getDomainWorkflowSnapshot } from "../../../../../lib/learning/domainWorkflowService";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  try {
    return Response.json({ workflow: await getDomainWorkflowSnapshot(id) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取学习工作流失败。";
    return Response.json(
      { error: message },
      { status: message.includes("不存在") ? 404 : 500 }
    );
  }
}
