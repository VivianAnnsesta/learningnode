import { AiConfigurationError } from "../../../../../../lib/ai/provider";
import { generateRelationCandidates } from "../../../../../../lib/ai/tutorService";
import { prisma } from "../../../../../../lib/prisma";

type RelationCandidateRequestBody = {
  sourceKnowledgePointId?: string | null;
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

  const sourceKnowledgePointId = payload.sourceKnowledgePointId?.trim();
  if (!sourceKnowledgePointId) {
    return Response.json(
      { error: "sourceKnowledgePointId 不能为空。" },
      { status: 400 }
    );
  }

  const source = await prisma.knowledgePoint.findFirst({
    where: { id: sourceKnowledgePointId, domainId: params.id },
    select: { id: true }
  });
  if (!source) {
    return Response.json({ error: "起点不属于该领域。" }, { status: 404 });
  }

  try {
    const result = await generateRelationCandidates(sourceKnowledgePointId, {
      canvasId: params.id,
      userQuestion: payload.userQuestion
    });
    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "生成关系候选失败。";
    const status = error instanceof AiConfigurationError ? 503 : 500;
    return Response.json({ error: message }, { status });
  }
}
