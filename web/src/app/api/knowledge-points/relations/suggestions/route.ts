import { suggestPersonalRelations } from "../../../../../lib/learning/personalKnowledgeService";
import { teachingRoute,readTeachingRequest } from "../../../../../lib/learning/nodeTeachingRoute";
export async function POST(r:Request){return teachingRoute(async()=>suggestPersonalRelations(await readTeachingRequest(r)));}
