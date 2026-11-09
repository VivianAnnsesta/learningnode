import { listPersonalRelations,createPersonalRelation } from "../../../../lib/learning/personalKnowledgeService";
import { teachingRoute,readTeachingRequest } from "../../../../lib/learning/nodeTeachingRoute";
export async function GET(r:Request){return teachingRoute(()=>listPersonalRelations(new URL(r.url).searchParams.get("domainId")||undefined));}
export async function POST(r:Request){return teachingRoute(async()=>createPersonalRelation(await readTeachingRequest(r)));}
