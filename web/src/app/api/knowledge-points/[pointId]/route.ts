import { getPersonalKnowledge, revisePersonalKnowledge, deletePersonalKnowledge } from "../../../../lib/learning/personalKnowledgeService";
import { teachingRoute,readTeachingRequest } from "../../../../lib/learning/nodeTeachingRoute";
type Context={params:Promise<{pointId:string}>};
export async function GET(_r:Request,c:Context){const{pointId}=await c.params;return teachingRoute(()=>getPersonalKnowledge(pointId));}
export async function PATCH(r:Request,c:Context){const{pointId}=await c.params;return teachingRoute(async()=>revisePersonalKnowledge(pointId,await readTeachingRequest(r)));}
export async function DELETE(r:Request,c:Context){const{pointId}=await c.params;return teachingRoute(async()=>deletePersonalKnowledge(pointId,await readTeachingRequest(r)));}
