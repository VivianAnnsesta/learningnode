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

export async function POST(request: Request) {
  let payload: RelationInput;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "无效的 JSON。" }, { status: 400 });
  }

  const canvasId = payload.canvasId?.trim() || "";

  try {
    const relation = await createKnowledgeRelation(canvasId, payload, {
      defaultStatus: "candidate",
      defaultWormholeStatus: "wormhole_candidate"
    });
    return Response.json({ relation });
  } catch (error) {
    const message = error instanceof Error ? error.message : "创建关系失败。";
    const status =
      error instanceof KnowledgeRelationError
        ? error.code === "target_not_found"
          ? 404
          : 400
        : 500;
    return Response.json({ error: message }, { status });
  }
}
