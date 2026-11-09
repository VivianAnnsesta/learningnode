import { createLearningSession, listLearningSessions } from "../../../lib/learning/learningSessionService";
import { readTeachingRequest, teachingRoute } from "../../../lib/learning/nodeTeachingRoute";
export async function GET(request:Request){const q=new URL(request.url).searchParams;return teachingRoute(()=>listLearningSessions({offset:q.get("offset"),limit:q.get("limit")}));}
export async function POST(request:Request){return teachingRoute(async()=>createLearningSession(await readTeachingRequest(request)));}
