// Compatibility route for the legacy canvas workspace.
// New PRD v1.2 pages should use /api/domains instead.
import {
  createLearningDomain,
  listLearningDomains,
  type LearningDomainInput
} from "../../../lib/learning/domainService";

type CanvasInput = LearningDomainInput;

export async function GET() {
  try {
    const canvases = await listLearningDomains();
    return Response.json({ canvases });
  } catch (error) {
    console.error("\n[API ERROR in GET /api/canvas]:", error, "\n");
    const message = error instanceof Error ? error.message : "读取失败";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let payload: CanvasInput;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "无效的 JSON" }, { status: 400 });
  }

  if (!payload.name?.trim()) {
    return Response.json({ error: "name 不能为空" }, { status: 400 });
  }

  try {
    const canvas = await createLearningDomain(payload);
    return Response.json({ canvas });
  } catch (error) {
    console.error("\n[API ERROR in POST /api/canvas]:", error, "\n");
    const message = error instanceof Error ? error.message : "创建失败";
    return Response.json({ error: message }, { status: 500 });
  }
}
