import { getPersonalKnowledgeMentions } from "../../../../../lib/learning/personalKnowledgeDiscovery";
import { teachingRoute } from "../../../../../lib/learning/nodeTeachingRoute";

export async function GET(request: Request, context: { params: Promise<{ pointId: string }> }) {
  const { pointId } = await context.params;
  const query = new URL(request.url).searchParams;
  return teachingRoute(() => getPersonalKnowledgeMentions(pointId, { offset: query.get("offset"), limit: query.get("limit") }));
}
