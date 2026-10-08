import {
  KnowledgeWordError,
  updateKnowledgeWordPosition
} from "../../../../../lib/learning/knowledgeService";

type PositionInput = {
  x?: number;
  y?: number;
};

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const { searchParams } = new URL(request.url);
  const canvasId = searchParams.get("canvasId")?.trim();
  if (!canvasId) {
    return Response.json({ error: "画布 ID 不能为空。" }, { status: 400 });
  }

  let payload: PositionInput;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "无效的 JSON" }, { status: 400 });
  }

  try {
    const word = await updateKnowledgeWordPosition(params.id, canvasId, payload);
    return Response.json({ id: word.id, positionX: word.positionX, positionY: word.positionY });
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新位置失败。";
    const status =
      error instanceof KnowledgeWordError
        ? error.code === "not_found"
          ? 404
          : 400
        : 500;
    return Response.json({ error: message }, { status });
  }
}
