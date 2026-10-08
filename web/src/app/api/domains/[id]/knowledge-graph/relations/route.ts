import {
  createKnowledgeGraphRelation,
  getKnowledgeGraph,
  type KnowledgeGraphRelationInput
} from "../../../../../../lib/learning/knowledgeGraphService";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  try {
    const graph = await getKnowledgeGraph(params.id);
    return Response.json(graph);
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取知识体系图谱失败。";
    const status = message.toLowerCase().includes("not found") ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  let payload: KnowledgeGraphRelationInput;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "请求体不是合法的 JSON。" }, { status: 400 });
  }

  try {
    const relation = await createKnowledgeGraphRelation(params.id, payload);
    return Response.json({ relation });
  } catch (error) {
    const message = error instanceof Error ? error.message : "创建关系失败。";
    return Response.json({ error: message }, { status: 400 });
  }
}
