// Compatibility route for the legacy canvas graph payload.
// New PRD v1.2 pages should use domain map and knowledge graph APIs instead.
import { getLegacyCanvasGraphPayload } from "../../../lib/learning/knowledgeGraphService";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const canvasId = searchParams.get("canvasId")?.trim();
  if (!canvasId) {
    return Response.json({ error: "canvasId 不能为空。" }, { status: 400 });
  }

  try {
    const graph = await getLegacyCanvasGraphPayload(canvasId);
    return Response.json(graph);
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取图谱失败。";
    return Response.json({ error: message }, { status: 500 });
  }
}
