import { generateLearningNodePractice } from "../../../../../../../lib/ai/tutorService";
import {
  readOptionalJsonBody,
  runAiRoute
} from "../../../../../../../lib/learning/legacyAiRoute";
import { assertLearningNodeInDomain } from "../../../../../../../lib/learning/domainMapService";

type PracticePayload = {
  userGoal?: string | null;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string; nodeId: string }> }
) {
  const params = await context.params;
  const payload = await readOptionalJsonBody<PracticePayload>(request);
  try {
    await assertLearningNodeInDomain(params.id, params.nodeId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "学习节点不存在。";
    return Response.json({ error: message }, { status: 404 });
  }
  return runAiRoute(
    () => generateLearningNodePractice(params.nodeId, payload),
    "生成练习失败。"
  );
}
