import { listKnowledgeCollections,createKnowledgeCollection } from "../../../lib/learning/personalKnowledgeService";
import { teachingRoute,readTeachingRequest } from "../../../lib/learning/nodeTeachingRoute";
export async function GET(){return teachingRoute(listKnowledgeCollections);}
export async function POST(r:Request){return teachingRoute(async()=>createKnowledgeCollection(await readTeachingRequest(r)));}
