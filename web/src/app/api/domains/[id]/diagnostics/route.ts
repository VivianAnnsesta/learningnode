import {
  createDiagnosticSession,
  listDiagnosticSessions,
  type DiagnosticSessionInput
} from "../../../../../lib/learning/diagnosticService";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  try {
    const sessions = await listDiagnosticSessions(params.id);
    return Response.json({ sessions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "读取诊断会话失败。";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  let payload: DiagnosticSessionInput;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "请求体不是合法的 JSON。" }, { status: 400 });
  }

  try {
    const session = await createDiagnosticSession(params.id, payload);
    return Response.json({ session });
  } catch (error) {
    const message = error instanceof Error ? error.message : "创建诊断会话失败。";
    const status =
      message.includes("不存在") || message.includes("not found") ? 404 : 500;
    return Response.json({ error: message }, { status });
  }
}
