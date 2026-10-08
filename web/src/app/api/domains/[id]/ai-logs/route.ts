import { listPlanningLogs, PlanningLogReadError } from "../../../../../lib/ai/planningLogService";

export async function GET(request: Request, context: {params: Promise<{id: string}>}) {
  const { id } = await context.params;
  try {
    const query = new URL(request.url).searchParams;
    return Response.json(await listPlanningLogs(id, {cursor:query.get("cursor") || undefined,limit:query.has("limit") ? Number(query.get("limit")) : undefined}), {headers:{"Cache-Control":"no-store"}});
  } catch (error) {
    return Response.json({error:error instanceof Error ? error.message : "读取生成记录失败。"}, {status:error instanceof PlanningLogReadError ? error.status : 500});
  }
}
