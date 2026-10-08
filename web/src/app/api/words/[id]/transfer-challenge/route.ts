import { generateTransferChallenge } from "../../../../../lib/ai/tutorService";
import {
  readOptionalJsonBody,
  runAiRoute
} from "../../../../../lib/learning/legacyAiRoute";

type TransferChallengeRequestBody = {
  canvasId?: string | null;
  userGoal?: string | null;
};

// Legacy compatibility endpoint. PRD v1.2 pages do not depend on this route.
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const payload = await readOptionalJsonBody<TransferChallengeRequestBody>(request);
  return runAiRoute(
    () => generateTransferChallenge(params.id, payload),
    "生成迁移挑战失败。"
  );
}
