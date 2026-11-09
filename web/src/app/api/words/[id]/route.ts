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

export async function PATCH() { return Response.json({error:"兼容写入已退役，请使用个人记录与关系入口。"},{status:410}); }

export async function DELETE() { return Response.json({error:"兼容写入已退役，请使用个人记录与关系入口。"},{status:410}); }
