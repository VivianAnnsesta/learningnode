import { linkPersonalKnowledge } from "../../../../../lib/learning/personalKnowledgeService";
import { teachingRoute,readTeachingRequest } from "../../../../../lib/learning/nodeTeachingRoute";
export async function POST(r:Request,c:{params:Promise<{pointId:string}>}){const{pointId}=await c.params;return teachingRoute(async()=>linkPersonalKnowledge(pointId,await readTeachingRequest(r)));}
