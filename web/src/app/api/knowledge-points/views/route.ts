import { createSavedKnowledgeView, listSavedKnowledgeViews } from "../../../../lib/learning/savedKnowledgeViewService";
import { NodeTeachingError } from "../../../../lib/learning/nodeTeaching";
import { readTeachingRequest, teachingRoute } from "../../../../lib/learning/nodeTeachingRoute";

export async function GET(request: Request) {
  return teachingRoute(async () => {
    const query = new URL(request.url).searchParams;
    const seen = new Set<string>();
    for (const [key] of query) {
      if (!["offset", "limit"].includes(key) || seen.has(key)) throw new NodeTeachingError("已保存视图的列表条件无效。");
      seen.add(key);
    }
    return listSavedKnowledgeViews({ offset: query.get("offset"), limit: query.get("limit") });
  });
}

export async function POST(request: Request) {
  return teachingRoute(async () => createSavedKnowledgeView(await readTeachingRequest(request)));
}
