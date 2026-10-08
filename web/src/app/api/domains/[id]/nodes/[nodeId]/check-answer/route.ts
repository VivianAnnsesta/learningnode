import { assertLearningNodeInDomain } from "../../../../../../../lib/learning/domainMapService";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string; nodeId: string }> }
) {
  const params = await context.params;
  try {
    await assertLearningNodeInDomain(params.id, params.nodeId);
    return Response.json({error:"个人自我解释由你保存、修订和确认，不再交给 AI 复核。你可以继续学习或直接确认沉淀。",code:"SELF_EXPLANATION_REVIEW_REMOVED"},{status:410});
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "检查答案失败。";
    const status =
      message.includes("不存在") || message.includes("不属于")
          ? 404
          : 400;
    return Response.json({ error: message }, { status });
  }
}
