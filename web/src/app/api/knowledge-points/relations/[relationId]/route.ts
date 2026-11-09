import { updatePersonalRelation,deletePersonalRelation } from "../../../../../lib/learning/personalKnowledgeService";
import { teachingRoute,readTeachingRequest } from "../../../../../lib/learning/nodeTeachingRoute";
type Context={params:Promise<{relationId:string}>};
export async function PATCH(r:Request,c:Context){const{relationId}=await c.params;return teachingRoute(async()=>updatePersonalRelation(relationId,await readTeachingRequest(r)));}
export async function DELETE(_r:Request,c:Context){const{relationId}=await c.params;return teachingRoute(()=>deletePersonalRelation(relationId));}
