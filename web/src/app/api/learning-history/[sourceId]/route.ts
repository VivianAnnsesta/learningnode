import { getHistorySource } from "../../../../lib/learning/historyService";
import { teachingRoute } from "../../../../lib/learning/nodeTeachingRoute";
export async function GET(r:Request,c:{params:Promise<{sourceId:string}>}){const{sourceId}=await c.params;const query=new URL(r.url).searchParams;return teachingRoute(()=>getHistorySource(sourceId,{offset:Number(query.get('offset')||0),showReferences:query.get('references')==='show'}));}
