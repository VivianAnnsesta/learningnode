import {
  saveDiagnosticAnswer,
  type DiagnosticAnswerInput
} from "../../../../../lib/learning/diagnosticService";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  let payload: DiagnosticAnswerInput;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "请求体不是合法的 JSON。" }, { status: 400 });
  }

  try {
    const answer = await saveDiagnosticAnswer(params.id, payload);
    return Response.json({ answer });
  } catch (error) {
    const message = error instanceof Error ? error.message : "保存诊断回答失败。";
    const status = message.includes("不能为空")
      ? 400
      : message.includes("不存在") || message.includes("not found")
        ? 404
        : 500;
    return Response.json({ error: message }, { status });
  }
}
