import {reviewLearningContent} from "../../../../../lib/learning/learningSessionService";
import {readTeachingRequest,teachingRoute} from "../../../../../lib/learning/nodeTeachingRoute";
export async function POST(r:Request,c:{params:Promise<{sessionId:string}>}){return teachingRoute(async()=>reviewLearningContent((await c.params).sessionId,await readTeachingRequest(r)));}
