import { AiConfigurationError } from "../ai/provider";
import { NodeTeachingError } from "./nodeTeaching";

export async function teachingRoute(action: () => Promise<unknown>) {
  try { return Response.json(await action()); }
  catch (error) {
    const status = error instanceof NodeTeachingError ? error.status : 503;
    const message = error instanceof NodeTeachingError ? error.message
      : error instanceof AiConfigurationError
        ? "AI 配置不可用，请前往 AI 设置检查服务地址、模型和凭据。"
        : "教学服务暂时不可用，请重试；已保存的学习记录会保留。";
    return Response.json({ error: message }, { status });
  }
}

export async function readTeachingRequest(request: Request) {
  const body = await request.text();
  if (body.length > 20000) throw new NodeTeachingError("教学请求过长。", 413);
  try { return JSON.parse(body) as unknown; }
  catch { throw new NodeTeachingError("教学请求不是有效 JSON。"); }
}
