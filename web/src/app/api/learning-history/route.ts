import { listHistorySources } from "../../../lib/learning/historyService";
import { teachingRoute } from "../../../lib/learning/nodeTeachingRoute";
export async function GET(){return teachingRoute(listHistorySources);}
