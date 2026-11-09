import { deleteSavedKnowledgeView, getSavedKnowledgeView, updateSavedKnowledgeView } from "../../../../../lib/learning/savedKnowledgeViewService";
import { readTeachingRequest, teachingRoute } from "../../../../../lib/learning/nodeTeachingRoute";

type Context = { params: Promise<{ viewId: string }> };

export async function GET(_request: Request, context: Context) {
  return teachingRoute(async () => getSavedKnowledgeView((await context.params).viewId));
}

export async function PATCH(request: Request, context: Context) {
  return teachingRoute(async () => updateSavedKnowledgeView((await context.params).viewId, await readTeachingRequest(request)));
}

export async function DELETE(request: Request, context: Context) {
  return teachingRoute(async () => deleteSavedKnowledgeView((await context.params).viewId, await readTeachingRequest(request)));
}
