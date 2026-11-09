// Compatibility route for legacy canvas relation editing.
// New PRD v1.2 pages should write relations through domain knowledge graph APIs.
import {
  createKnowledgeRelation,
  KnowledgeRelationError,
  listKnowledgeRelations,
  type KnowledgeRelationUpdateInput
} from "../../../lib/learning/knowledgeService";

type RelationInput = KnowledgeRelationUpdateInput & {
  canvasId?: string;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const wordId = searchParams.get("wordId")?.trim();
  const canvasId = searchParams.get("canvasId")?.trim();

  if (!canvasId) {
    return Response.json({ error: "canvasId 不能为空。" }, { status: 400 });
  }

  try {
    const relations = await listKnowledgeRelations(canvasId, wordId);
    return Response.json({ relations });
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取关系失败。";
    const status =
      error instanceof KnowledgeRelationError && error.code === "missing_canvas"
        ? 400
        : 500;
    return Response.json({ error: message }, { status });
  }
}

export async function POST() { return Response.json({error:"兼容写入已退役，请使用个人记录与关系入口。"},{status:410}); }
