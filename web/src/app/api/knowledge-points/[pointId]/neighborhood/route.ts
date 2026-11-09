import { getPersonalKnowledgeNeighborhood } from "../../../../../lib/learning/personalKnowledgeDiscovery";
import { teachingRoute } from "../../../../../lib/learning/nodeTeachingRoute";

export async function GET(request: Request, context: { params: Promise<{ pointId: string }> }) {
  const { pointId } = await context.params;
  return teachingRoute(() => getPersonalKnowledgeNeighborhood(pointId, new URL(request.url).searchParams.get("depth")));
}
