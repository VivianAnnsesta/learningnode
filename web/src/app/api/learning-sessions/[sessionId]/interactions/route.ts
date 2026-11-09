import { submitLearningInteraction } from "../../../../../lib/learning/learningSessionService";
import { teachingRoute,readTeachingRequest } from "../../../../../lib/learning/nodeTeachingRoute";
export async function POST(r:Request,c:{params:Promise<{sessionId:string}>}){const{sessionId}=await c.params;return teachingRoute(async()=>submitLearningInteraction(sessionId,await readTeachingRequest(r)));}
