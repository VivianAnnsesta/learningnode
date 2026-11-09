import { prepareLearningSegment } from "../../../../../../lib/learning/learningSessionService";
import { teachingRoute,readTeachingRequest } from "../../../../../../lib/learning/nodeTeachingRoute";
export async function POST(r:Request,c:{params:Promise<{sessionId:string;segmentKey:string}>}){const{sessionId,segmentKey}=await c.params;return teachingRoute(async()=>prepareLearningSegment(sessionId,segmentKey,await readTeachingRequest(r)));}
