import { getPersonalKnowledgeCalendar } from "../../../../lib/learning/personalKnowledgeCalendar";
import { teachingRoute } from "../../../../lib/learning/nodeTeachingRoute";

export async function GET(request: Request) {
  return teachingRoute(() => getPersonalKnowledgeCalendar(new URL(request.url).searchParams));
}
