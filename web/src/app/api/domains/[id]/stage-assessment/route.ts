import {
  applyStageAssessment,
  getStageAssessmentSummaries
} from "../../../../../lib/learning/roadmapService";

type StageAssessmentApplyInput = {
  stageId?: string | null;
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  try {
    const data = await getStageAssessmentSummaries(params.id);
    return Response.json(data);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "读取阶段测评失败。";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  let payload: StageAssessmentApplyInput;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "无效的 JSON。" }, { status: 400 });
  }

  const stageId = payload.stageId?.trim();
  if (!stageId) {
    return Response.json({ error: "stageId 不能为空。" }, { status: 400 });
  }

  try {
    const result = await applyStageAssessment(params.id, stageId);
    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "应用阶段测评失败。";
    const status = message.includes("不存在") ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}
