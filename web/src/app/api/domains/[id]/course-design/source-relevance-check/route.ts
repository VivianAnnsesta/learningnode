import { AiConfigurationError } from "../../../../../../lib/ai/provider";
import { runSourceRelevanceCheck } from "../../../../../../lib/ai/tutorService";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;

  try {
    const result = await runSourceRelevanceCheck(params.id);
    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "复核来源相关性失败。";
    const status = error instanceof AiConfigurationError ? 503 : 400;
    return Response.json({ error: message }, { status });
  }
}
