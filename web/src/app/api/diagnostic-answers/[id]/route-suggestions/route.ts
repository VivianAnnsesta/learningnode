import { createRouteSuggestionsFromDiagnosticAnswer } from "../../../../../lib/learning/routeSuggestionService";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  try {
    const suggestions = await createRouteSuggestionsFromDiagnosticAnswer(params.id);
    return Response.json({ suggestions });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "生成诊断路线建议失败。";
    const status = message.includes("not found") ? 404 : 400;
    return Response.json({ error: message }, { status });
  }
}
