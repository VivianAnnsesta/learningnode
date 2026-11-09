import {
  KnowledgeWordError,
  searchKnowledgeWords,
} from "../../../lib/learning/knowledgeService";


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

export async function POST() { return Response.json({error:"兼容写入已退役，请使用个人记录与关系入口。"},{status:410}); }
