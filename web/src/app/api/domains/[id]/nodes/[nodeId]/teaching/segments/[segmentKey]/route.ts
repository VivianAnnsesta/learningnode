import { prepareTeachingSegment } from "../../../../../../../../../lib/learning/progressiveTeachingService";
import { readTeachingRequest, teachingRoute } from "../../../../../../../../../lib/learning/nodeTeachingRoute";
export async function POST(request: Request, context: {params: Promise<{id:string;nodeId:string;segmentKey:string}>}) {
  const {id,nodeId,segmentKey}=await context.params;
  return teachingRoute(async () => prepareTeachingSegment(id,nodeId,segmentKey,await readTeachingRequest(request)));
}
