import { AiConfigurationError } from "../../../../../../../lib/ai/provider";
import { generateLearningNodeHint } from "../../../../../../../lib/ai/tutorService";
import { assertLearningNodeInDomain } from "../../../../../../../lib/learning/domainMapService";

type HintPayload = {
  hintLevel?: number;
  userQuestion?: string | null;
  currentUnderstanding?: string | null;
  currentCoreEssence?: string | null;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; nodeId: string }> }
) {
  const params = await context.params;
  let payload: HintPayload = {};

  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  try {
    await assertLearningNodeInDomain(params.id, params.nodeId);
    const result = await generateLearningNodeHint(params.nodeId, payload);
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "生成提示失败。";
    const status =
      error instanceof AiConfigurationError
        ? 503
        : message.includes("不存在") || message.includes("不属于")
          ? 404
          : 500;
    return Response.json({ error: message }, { status });
  }
}
