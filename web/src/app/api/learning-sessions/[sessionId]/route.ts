import { getLearningSession, saveLearningProgress } from "../../../../lib/learning/learningSessionService";
import { readTeachingRequest, teachingRoute } from "../../../../lib/learning/nodeTeachingRoute";
type Context={params:Promise<{sessionId:string}>};
export async function GET(_r:Request,c:Context){const{sessionId}=await c.params;return teachingRoute(()=>getLearningSession(sessionId));}
export async function PATCH(r:Request,c:Context){const{sessionId}=await c.params;return teachingRoute(async()=>saveLearningProgress(sessionId,await readTeachingRequest(r)));}
