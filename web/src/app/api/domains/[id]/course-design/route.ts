import {
  confirmCourseDesign,
  getCourseDesignState
} from "../../../../../lib/learning/courseDesignService";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  try {
    const courseDesign = await getCourseDesignState(params.id);
    return Response.json({ courseDesign });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "读取课程设计方向失败。";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  try {
    const courseDesign = await confirmCourseDesign(params.id);
    return Response.json({ courseDesign });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "确认课程设计方向失败。";
    return Response.json({ error: message }, { status: 400 });
  }
}
