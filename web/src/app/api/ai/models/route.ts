import {
  discoverAiModels,
  type AiModelDiscoveryInput
} from "../../../../lib/ai/modelDiscoveryService";

export async function POST(request: Request) {
  let payload: AiModelDiscoveryInput;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "无效的 JSON" }, { status: 400 });
  }

  try {
    return Response.json(await discoverAiModels(payload));
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取模型列表失败";
    return Response.json({ error: message }, { status: 400 });
  }
}
