import {
  KnowledgeWordError,
  searchKnowledgeWords,
  upsertKnowledgeWord,
  type KnowledgeWordUpdateInput
} from "../../../lib/learning/knowledgeService";

type WordInput = KnowledgeWordUpdateInput & {
  canvasId?: string;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  try {
    const words = await searchKnowledgeWords({
      query: searchParams.get("query"),
      canvasId: searchParams.get("canvasId")
    });
    return Response.json({ words });
  } catch (error) {
    console.error("\n[API ERROR in GET /api/words]:", error, "\n");
    const message = error instanceof Error ? error.message : "读取知识点失败。";
    const status =
      error instanceof KnowledgeWordError && error.code === "missing_canvas"
        ? 400
        : 500;
    return Response.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  let payload: WordInput;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "无效的 JSON" }, { status: 400 });
  }

  try {
    const saved = await upsertKnowledgeWord(payload);
    return Response.json({ ok: true, id: saved.id });
  } catch (error) {
    console.error("\n[API ERROR in POST /api/words]:", error, "\n");
    const message = error instanceof Error ? error.message : "保存知识点失败。";
    const status =
      error instanceof KnowledgeWordError &&
      (error.code === "missing_word" ||
        error.code === "missing_canvas" ||
        error.code === "forbidden_mastery_status")
        ? 400
        : 500;
    return Response.json({ error: message }, { status });
  }
}
