import { organizeKnowledgeGraphCoreConcepts } from "../../../../../../lib/ai/tutorService";
import { runAiRoute } from "../../../../../../lib/learning/legacyAiRoute";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  return runAiRoute(
    () => organizeKnowledgeGraphCoreConcepts(params.id),
    "整理核心概念失败。"
  );
}
