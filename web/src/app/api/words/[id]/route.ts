import {
  deleteKnowledgeWord,
  getKnowledgeWord,
  KnowledgeWordError,
  type KnowledgeWordUpdateInput,
  updateKnowledgeWord
} from "../../../../lib/learning/knowledgeService";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const { searchParams } = new URL(request.url);
  const canvasId = searchParams.get("canvasId")?.trim();

  if (!canvasId) {
    return Response.json({ error: "canvasId 不能为空。" }, { status: 400 });
  }

  try {
    const word = await getKnowledgeWord(params.id, canvasId);
    return Response.json({ word });
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取失败。";
    const status =
      error instanceof KnowledgeWordError
        ? error.code === "not_found"
          ? 404
          : 400
        : 500;
    return Response.json({ error: message }, { status });
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const { searchParams } = new URL(request.url);
  const canvasId = searchParams.get("canvasId")?.trim();

  if (!canvasId) {
    return Response.json({ error: "canvasId 不能为空。" }, { status: 400 });
  }

  let payload: KnowledgeWordUpdateInput;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "请求体不是合法的 JSON。" }, { status: 400 });
  }

  try {
    const word = await updateKnowledgeWord(params.id, canvasId, payload);
    return Response.json({ word });
  } catch (error) {
    const message = error instanceof Error ? error.message : "更新失败。";
    const status =
      error instanceof KnowledgeWordError
        ? error.code === "not_found"
          ? 404
          : 400
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
    return Response.json({ error: "canvasId 不能为空。" }, { status: 400 });
  }

  try {
    await deleteKnowledgeWord(params.id, canvasId);
    return Response.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "删除失败。";
    const status =
      error instanceof KnowledgeWordError
        ? error.code === "not_found"
          ? 404
          : 400
        : 500;
    return Response.json({ error: message }, { status });
  }
}
