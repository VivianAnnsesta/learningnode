import {
  deleteLearningDomain,
  getLearningDomain,
  updateLearningDomain,
  type LearningDomainInput
} from "../../../../lib/learning/domainService";
import { getDomainMap } from "../../../../lib/learning/domainMapService";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  try {
    const domain = await getLearningDomain(params.id);
    if (!domain) {
      return Response.json({ error: "未找到领域。" }, { status: 404 });
    }
    const map = await getDomainMap(params.id).catch(() => null);
    return Response.json({ domain, mapSummary: map?.progress || null });
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取学习领域失败。";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  let payload: LearningDomainInput;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "请求体不是合法的 JSON。" }, { status: 400 });
  }

  try {
    const domain = await updateLearningDomain(params.id, payload);
    return Response.json({ domain });
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新学习领域失败。";
    return Response.json({ error: message }, { status: 400 });
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
    const message = error instanceof Error ? error.message : "删除学习领域失败。";
    return Response.json({ error: message }, { status: 500 });
  }
}
