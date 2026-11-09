import { updateKnowledgeCollection,deleteKnowledgeCollection } from "../../../../lib/learning/personalKnowledgeService";
import { teachingRoute,readTeachingRequest } from "../../../../lib/learning/nodeTeachingRoute";
type Context={params:Promise<{collectionId:string}>};
export async function PATCH(r:Request,c:Context){const{collectionId}=await c.params;return teachingRoute(async()=>updateKnowledgeCollection(collectionId,await readTeachingRequest(r)));}
export async function DELETE(_r:Request,c:Context){const{collectionId}=await c.params;return teachingRoute(()=>deleteKnowledgeCollection(collectionId));}
