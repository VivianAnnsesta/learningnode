import { acceptRouteSuggestion } from "../../../../../lib/learning/routeSuggestionService";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const payload = await request.json().catch(() => ({}));
  try {
    const result = await acceptRouteSuggestion(params.id, {
      confirmationReason:
        typeof payload.confirmationReason === "string"
          ? payload.confirmationReason
          : null
    });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "接受路线建议失败。";
    const status = message.includes("not found") ? 404 : 400;
    return Response.json({ error: message }, { status });
  }
}
