import { getNodeTeaching, prepareNodeTeaching, saveNodeTeachingProgress } from "../../../../../../../lib/learning/progressiveTeachingService";
import { readTeachingRequest, teachingRoute } from "../../../../../../../lib/learning/nodeTeachingRoute";

type Context = { params: Promise<{ id: string; nodeId: string }> };
export async function GET(request: Request, context: Context) {
  const { id, nodeId } = await context.params;
  return teachingRoute(() => getNodeTeaching(id, nodeId, new URL(request.url).searchParams.get("sessionId") || undefined));
}
export async function POST(request: Request, context: Context) {
  const { id, nodeId } = await context.params;
  return teachingRoute(async () => prepareNodeTeaching(id, nodeId, await readTeachingRequest(request)));
}
export async function PATCH(request: Request, context: Context) {
  const { id, nodeId } = await context.params;
  return teachingRoute(async () => saveNodeTeachingProgress(id, nodeId, await readTeachingRequest(request)));
}
