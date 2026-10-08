import { generateIslandReactivationPlan } from "../../../../../lib/ai/tutorService";
import {
  readOptionalJsonBody,
  runAiRoute
} from "../../../../../lib/learning/legacyAiRoute";

type ReactivationPlanRequestBody = {
  canvasId?: string | null;
};

// Legacy compatibility endpoint. PRD v1.2 pages do not depend on this route.
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const payload = await readOptionalJsonBody<ReactivationPlanRequestBody>(request);
  return runAiRoute(
    () => generateIslandReactivationPlan(params.id, payload),
    "生成知识孤岛回收建议失败。"
  );
}
