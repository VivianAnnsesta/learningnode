import { AiConfigurationError } from "../../../../../../lib/ai/provider";
import {
  generateCourseDesignDraft,
  repairCourseDesignDraft
} from "../../../../../../lib/ai/tutorService";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  const payload = await request.json().catch(() => ({}));

  try {
    const result =
      payload.mode === "repair"
        ? await repairCourseDesignDraft(params.id)
        : await generateCourseDesignDraft(params.id, {
            feedback:
              typeof payload.feedback === "string" ? payload.feedback : null
          });
    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "生成课程设计方向失败。";
    const status = error instanceof AiConfigurationError ? 503 : 400;
    return Response.json({ error: message }, { status });
  }
}
