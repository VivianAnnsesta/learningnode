import { listPersonalKnowledge, createPersonalKnowledge } from "../../../lib/learning/personalKnowledgeService";
import { teachingRoute,readTeachingRequest } from "../../../lib/learning/nodeTeachingRoute";
export async function GET(r:Request){const q=new URL(r.url).searchParams;return teachingRoute(()=>listPersonalKnowledge(q.get("q")||"",q.get("domainId")||undefined,{offset:q.get("offset"),limit:q.get("limit"),collectionId:q.get("collectionId")||undefined,kind:q.get("kind")||undefined,sort:q.get("sort")||undefined}));}
export async function POST(r:Request){return teachingRoute(async()=>createPersonalKnowledge(await readTeachingRequest(r)));}
