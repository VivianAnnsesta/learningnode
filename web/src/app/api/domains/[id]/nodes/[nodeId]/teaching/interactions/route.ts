import { submitTeachingInteraction } from "../../../../../../../../lib/learning/progressiveTeachingService";
import { readTeachingRequest, teachingRoute } from "../../../../../../../../lib/learning/nodeTeachingRoute";

export async function POST(request: Request, context: { params: Promise<{ id: string; nodeId: string }> }) {
  const { id, nodeId } = await context.params;
  return teachingRoute(async () => submitTeachingInteraction(id, nodeId, await readTeachingRequest(request)));
}
