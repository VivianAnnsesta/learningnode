import { AiConfigurationError } from "../../../../../../lib/ai/provider";
import { generateTaskBriefDraft } from "../../../../../../lib/ai/tutorService";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  try {
    const result = await generateTaskBriefDraft(params.id);
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "生成任务书草稿失败。";
    const status = error instanceof AiConfigurationError ? 503 : 500;
    return Response.json({ error: message }, { status });
  }
}
