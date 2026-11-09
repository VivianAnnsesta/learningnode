import { acceptLearningAction } from "../../../../../../lib/learning/learningSessionService";
import { teachingRoute,readTeachingRequest } from "../../../../../../lib/learning/nodeTeachingRoute";
export async function POST(r:Request,c:{params:Promise<{sessionId:string;interactionId:string}>}){const{sessionId,interactionId}=await c.params;return teachingRoute(async()=>acceptLearningAction(sessionId,interactionId,await readTeachingRequest(r)));}
