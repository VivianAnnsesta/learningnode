// Compatibility route for legacy canvas clients.
// New PRD v1.2 pages should use /api/domains/[id]/knowledge-graph/relation-candidates.
import { AiConfigurationError } from "../../../../../lib/ai/provider";
import { generateRelationCandidates } from "../../../../../lib/ai/tutorService";

type RelationCandidateRequestBody = {
  canvasId?: string | null;
  userQuestion?: string | null;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  let payload: RelationCandidateRequestBody = {};

  try {
    payload = await request.json();
  } catch {
    payload = {};
  }

  try {
    const result = await generateRelationCandidates(params.id, payload);
    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "生成关系候选失败";
    const status = error instanceof AiConfigurationError ? 503 : 500;
    return Response.json({ error: message }, { status });
  }
}
