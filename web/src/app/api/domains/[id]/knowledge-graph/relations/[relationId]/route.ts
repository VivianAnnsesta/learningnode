import {
  deleteKnowledgeGraphRelation,
  updateKnowledgeGraphRelation,
  type KnowledgeGraphRelationUpdateInput
} from "../../../../../../../lib/learning/knowledgeGraphService";
import { KnowledgeRelationError } from "../../../../../../../lib/learning/knowledgeService";

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string; relationId: string }> }
) {
  const params = await context.params;
  let payload: KnowledgeGraphRelationUpdateInput;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "无效的 JSON。" }, { status: 400 });
  }

  try {
    const relation = await updateKnowledgeGraphRelation(
      params.id,
      params.relationId,
      payload
    );
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
  _request: Request,
  context: { params: Promise<{ id: string; relationId: string }> }
) {
  const params = await context.params;
  try {
    await deleteKnowledgeGraphRelation(params.id, params.relationId);
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
