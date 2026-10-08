import { prisma } from "../prisma";
import { planningLogTasks, type PlanningLogSummary, type PlanningLogDetail } from "./planningLogTypes";

export class PlanningLogReadError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
const summarySelect = {
  id: true, taskType: true, provider: true, model: true, status: true, inputSummary: true, outputSummary: true, errorMessage: true,
  createdAt: true, finishedAt: true, latencyMs: true, promptVersion: true, providerRequestId: true,
  runId: true, attempt: true, retryOfLogId: true, retryReason: true, failureStage: true
} as const;
const scope = (domainId: string) => ({
  taskType: { in: [...planningLogTasks] },
  OR: [{ domainId }, { domainId: null, canvasId: domainId }]
});
async function requireDomain(domainId: string) {
  if (!await prisma.domain.findUnique({ where: { id: domainId }, select: { id: true } })) throw new PlanningLogReadError("未找到学习领域。", 404);
}
const decode = (value: string | null): unknown => {
  if (value === null) return null;
  try { return JSON.parse(value); } catch { return value; }
};
function summary(row: Omit<PlanningLogSummary, "createdAt" | "finishedAt"> & {createdAt: Date; finishedAt: Date | null}): PlanningLogSummary {
  return { ...row, createdAt: row.createdAt.toISOString(), finishedAt: row.finishedAt?.toISOString() || null };
}

export async function listPlanningLogs(domainId: string, options: {cursor?: string; limit?: number} = {}) {
  await requireDomain(domainId);
  const limit = options.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new PlanningLogReadError("每次读取记录数量必须为 1 到 50。", 400);
  if (options.cursor && !await prisma.aiCallLog.findFirst({where:{id:options.cursor,...scope(domainId)},select:{id:true}})) throw new PlanningLogReadError("记录分页位置不存在。", 404);
  const rows = await prisma.aiCallLog.findMany({
    where: scope(domainId), select: summarySelect, orderBy: [{createdAt:"desc"},{id:"desc"}], take: limit + 1,
    ...(options.cursor ? { cursor: { id: options.cursor }, skip: 1 } : {})
  });
  return { logs: rows.slice(0, limit).map(summary), nextCursor: rows.length > limit ? rows[limit - 1].id : null };
}

export async function getPlanningLog(domainId: string, logId: string): Promise<PlanningLogDetail> {
  await requireDomain(domainId);
  const row = await prisma.aiCallLog.findFirst({where:{id:logId,...scope(domainId)}});
  if (!row) throw new PlanningLogReadError("未找到本领域的课程规划记录。", 404);
  const attempts = row.runId ? await prisma.aiCallLog.findMany({where:{runId:row.runId,...scope(domainId)},select:summarySelect,orderBy:{attempt:"asc"}}) : [];
  const { requestMessagesJson, rawOutput, providerResponseJson, parsedOutputJson, validatedOutputJson, validationIssuesJson, researchSourcesJson, ...rest } = row;
  // Explicit selection keeps internal association fields out of the response.
  const selected = Object.fromEntries(Object.keys(summarySelect).map(key => [key, rest[key as keyof typeof rest]])) as Parameters<typeof summary>[0];
  return {
    ...summary(selected), requestMessages: decode(requestMessagesJson) as PlanningLogDetail["requestMessages"], rawOutput,
    providerResponse: decode(providerResponseJson), parsedOutput: decode(parsedOutputJson), validatedOutput: decode(validatedOutputJson),
    validationIssues: (decode(validationIssuesJson) || []) as PlanningLogDetail["validationIssues"], researchSources: decode(researchSourcesJson), relatedAttempts: attempts.map(summary)
  };
}
