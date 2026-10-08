import {
  deleteKnowledgeRelation,
  KnowledgeRelationError,
  type KnowledgeRelationUpdateInput,
  updateKnowledgeRelation
} from "../../../../lib/learning/knowledgeService";

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const { searchParams } = new URL(request.url);
  const canvasId = searchParams.get("canvasId")?.trim();

  if (!canvasId) {
    return Response.json({ error: "画布 ID 不能为空。" }, { status: 400 });
  }

  let payload: KnowledgeRelationUpdateInput;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "无效的 JSON" }, { status: 400 });
  }

  try {
    const relation = await updateKnowledgeRelation(params.id, canvasId, payload);
    return Response.json({ relation });
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新关系失败。";
    const status =
      error instanceof KnowledgeRelationError ||
      message === "未提供可更新字段。" ||
      message === "不允许跨画布创建关系。" ||
      message === "起点不属于该画布。" ||
      message === "画布 ID 不能为空。"
        ? 400
        : message === "该关系不属于当前画布。" || message === "目标节点不存在。"
          ? 404
          : 500;
    return Response.json({ error: message }, { status });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const { searchParams } = new URL(request.url);
  const canvasId = searchParams.get("canvasId")?.trim();

  if (!canvasId) {
    return Response.json({ error: "画布 ID 不能为空。" }, { status: 400 });
  }

  try {
    await deleteKnowledgeRelation(params.id, canvasId);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "删除关系失败。";
    const status =
      message === "该关系不属于当前画布。"
        ? 404
        : message === "画布 ID 不能为空。"
          ? 400
          : 500;
    return Response.json({ error: message }, { status });
  }
}
