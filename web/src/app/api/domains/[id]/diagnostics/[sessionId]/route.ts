import { getDiagnosticSession } from "../../../../../../lib/learning/diagnosticService";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; sessionId: string }> }
) {
  const params = await context.params;
  try {
    const session = await getDiagnosticSession(params.id, params.sessionId);
    if (!session) {
      return Response.json({ error: "未找到诊断会话。" }, { status: 404 });
    }
    return Response.json({ session });
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取诊断会话失败。";
    return Response.json({ error: message }, { status: 500 });
  }
}
