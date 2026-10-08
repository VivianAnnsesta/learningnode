import {
  deleteLearningDomain,
  updateLearningDomain,
  type LearningDomainInput
} from "../../../../lib/learning/domainService";

type CanvasUpdateInput = LearningDomainInput;

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  let payload: CanvasUpdateInput;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "无效的 JSON" }, { status: 400 });
  }

  try {
    const canvas = await updateLearningDomain(params.id, payload);
    return Response.json({ canvas });
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新失败";
    const status = message.includes("不能为空") || message.includes("未提供")
      ? 400
      : 500;
    return Response.json({ error: message }, { status });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  try {
    await deleteLearningDomain(params.id);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "删除失败";
    return Response.json({ error: message }, { status: 500 });
  }
}
