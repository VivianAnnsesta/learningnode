import { getPlanningLog, PlanningLogReadError } from "../../../../../../lib/ai/planningLogService";

export async function GET(_request: Request, context: {params: Promise<{id: string;logId: string}>}) {
  const { id, logId } = await context.params;
  try {
    return Response.json({log:await getPlanningLog(id,logId)}, {headers:{"Cache-Control":"no-store"}});
  } catch (error) {
    return Response.json({error:error instanceof Error ? error.message : "读取生成详情失败。"}, {status:error instanceof PlanningLogReadError ? error.status : 500});
  }
}
