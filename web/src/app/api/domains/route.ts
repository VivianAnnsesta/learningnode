import {
  createLearningDomain,
  type LearningDomainInput
} from "../../../lib/learning/domainService";
import { listDomainCards } from "../../../lib/learning/domainMapService";

export async function GET() {
  try {
    const domains = await listDomainCards();
    return Response.json({ domains });
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取学习领域失败。";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let payload: LearningDomainInput;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "请求体不是合法的 JSON。" }, { status: 400 });
  }

  try {
    const domain = await createLearningDomain(payload);
    return Response.json({ domain });
  } catch (error) {
    console.error("\n[API ERROR in POST /api/domains]:", error, "\n");
    const message = error instanceof Error ? error.message : "创建学习领域失败。";
    const status = message === "学习领域名称不能为空" ? 400 : 500;
    return Response.json({ error: message }, { status });
  }
}
