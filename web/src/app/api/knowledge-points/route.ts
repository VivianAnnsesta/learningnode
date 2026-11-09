import { listPersonalKnowledge, createPersonalKnowledge } from "../../../lib/learning/personalKnowledgeService";
import { teachingRoute,readTeachingRequest } from "../../../lib/learning/nodeTeachingRoute";
import { knowledgeViewConfigFromQuery } from "../../../lib/learning/knowledgeViewContracts";
import { NodeTeachingError } from "../../../lib/learning/nodeTeaching";
export async function GET(r:Request){return teachingRoute(async()=>{const query=new URL(r.url).searchParams;let config;try{config=knowledgeViewConfigFromQuery(query,{allowPagination:true});}catch(error){throw new NodeTeachingError(error instanceof Error?error.message:"检索地址无效。");}const f=config.filters;return listPersonalKnowledge(f.q,f.domainId,{offset:query.get("offset"),limit:query.get("limit"),collectionId:f.collectionId,kind:f.kind,sourceType:f.sourceType,sort:f.sort,date:f.date});});}
export async function POST(r:Request){return teachingRoute(async()=>createPersonalKnowledge(await readTeachingRequest(r)));}
