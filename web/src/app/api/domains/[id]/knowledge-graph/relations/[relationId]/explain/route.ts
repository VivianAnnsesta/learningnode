import { explainKnowledgeRelation } from "../../../../../../../../lib/ai/tutorService";
import { buildAiRouteErrorResponse } from "../../../../../../../../lib/learning/legacyAiRoute";
import { KnowledgeRelationError } from "../../../../../../../../lib/learning/knowledgeService";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string; relationId: string }> }
) {
  const params = await context.params;
  try {
    return Response.json(
      await explainKnowledgeRelation(params.id, params.relationId)
    );
  } catch (error) {
    if (error instanceof KnowledgeRelationError && error.code === "not_found") {
      return Response.json({ error: error.message }, { status: 404 });
    }
    return buildAiRouteErrorResponse(error, "解释关系失败。");
  }
}
