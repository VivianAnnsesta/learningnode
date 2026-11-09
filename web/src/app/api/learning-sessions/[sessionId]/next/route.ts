import {getNextLearningActions} from "../../../../../lib/learning/nextLearningActionService";
import {teachingRoute} from "../../../../../lib/learning/nodeTeachingRoute";
export async function GET(_r:Request,c:{params:Promise<{sessionId:string}>}){return teachingRoute(async()=>getNextLearningActions((await c.params).sessionId));}
