import { deleteKnowledgeRecordTemplate, getKnowledgeRecordTemplate, updateKnowledgeRecordTemplate } from "../../../../../lib/learning/knowledgeRecordTemplateService";
import { readTeachingRequest, teachingRoute } from "../../../../../lib/learning/nodeTeachingRoute";

type Context = { params: Promise<{ templateId: string }> };

export async function GET(_request: Request, context: Context) {
  return teachingRoute(async () => getKnowledgeRecordTemplate((await context.params).templateId));
}

export async function PATCH(request: Request, context: Context) {
  return teachingRoute(async () => updateKnowledgeRecordTemplate((await context.params).templateId, await readTeachingRequest(request)));
}

export async function DELETE(request: Request, context: Context) {
  return teachingRoute(async () => deleteKnowledgeRecordTemplate((await context.params).templateId, await readTeachingRequest(request)));
}
