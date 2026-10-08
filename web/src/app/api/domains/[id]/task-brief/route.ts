import { confirmTaskBrief } from "../../../../../lib/learning/domainService";

export async function PATCH(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  try {
    const domain = await confirmTaskBrief(params.id);
    return Response.json({ domain });
  } catch (error) {
    const message = error instanceof Error ? error.message : "确认任务书失败。";
    const status = message === "学习领域不存在" ? 404 : 400;
    return Response.json({ error: message }, { status });
  }
}
