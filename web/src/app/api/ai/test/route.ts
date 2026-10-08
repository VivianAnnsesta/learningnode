import { testAiProviderConnection } from "../../../../lib/ai/providerHealthService";

export async function POST() {
  try {
    const result = await testAiProviderConnection();
    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "AI 连接测试失败。";
    return Response.json(
      {
        ok: false,
        provider: "unknown",
        baseUrl: "",
        model: "",
        latencyMs: 0,
        responsePreview: null,
        aiCallLogId: null,
        error: message
      },
      { status: 200 }
    );
  }
}
