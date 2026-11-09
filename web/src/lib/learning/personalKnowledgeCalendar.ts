import { prisma } from "../prisma";
import { NodeTeachingError } from "./nodeTeaching";
import { calendarMonthBounds, getCivilDay } from "./civilDateContracts";
import { parseKnowledgeCalendarQuery, type KnowledgeRecordCalendarResult } from "./knowledgeCalendarContracts";
import { createKnowledgeDateMatcher, recordSourceCategory } from "./knowledgeViewContracts";
import { matchRecordSearch, readRecordAliases } from "./recordNames";
import { readAssignedRecordDate } from "./recordDateContracts";
import { personalKnowledgeBaseWhere } from "./personalKnowledgeService";
import { knowledgeViewScopeIssue } from "./savedKnowledgeViewService";

export async function getPersonalKnowledgeCalendar(query: URLSearchParams, now = new Date()): Promise<KnowledgeRecordCalendarResult> {
  let parsed: ReturnType<typeof parseKnowledgeCalendarQuery>;
  try { parsed = parseKnowledgeCalendarQuery(query); }
  catch (error) { throw new NodeTeachingError(error instanceof Error ? error.message : "月历地址无效。"); }
  const { field, timeZone } = parsed.filters.date, today = getCivilDay(now, timeZone);
  const month = parsed.month || today.slice(0, 7), bounds = calendarMonthBounds(month);
  const dateWindow = { field, timeZone, from: bounds.from, to: bounds.to };
  const filters = { ...parsed.filters, date: { mode: "range" as const, ...dateWindow } };
  const matcher = createKnowledgeDateMatcher(filters.date, now), where = personalKnowledgeBaseWhere(filters);
  return prisma.$transaction(async tx => {
    const result = { month, field, timeZone, today, dateWindow, filters, days: [] as { date: string; count: number }[], total: 0, undatedCount: 0, unavailableDateCount: 0 };
    const unavailableReason = await knowledgeViewScopeIssue(filters, tx);
    if (unavailableReason) return { ...result, unavailableReason };
    const counts = new Map(bounds.days.map(day => [day, 0]));
    let cursor: string | undefined;
    for (;;) {
      const rows = await tx.knowledgePoint.findMany({ where: { AND: [where, ...(cursor ? [{ id: { gt: cursor } }] : [])] }, orderBy: { id: "asc" }, take: 128, select: {
        id: true, title: true, createdAt: true, updatedAt: true, ...(filters.q ? { userUnderstanding: true, coreEssence: true } : {}),
        currentRevision: { select: { title: true, sourceType: true, recordDate: true, recordDateTimeZone: true, ...(filters.q ? { body: true, aliasesJson: true } : {}) } }
      } });
      for (const row of rows) {
        if (filters.sourceType && recordSourceCategory(row.currentRevision?.sourceType) !== filters.sourceType) continue;
        if (filters.q && !matchRecordSearch({ title: row.currentRevision ? row.currentRevision.title : row.title, body: row.currentRevision ? row.currentRevision.body || "" : row.userUnderstanding || row.coreEssence || "", aliases: readRecordAliases(row.currentRevision?.aliasesJson) }, filters.q).matches) continue;
        const assigned = readAssignedRecordDate(row.currentRevision?.recordDate ?? null, row.currentRevision?.recordDateTimeZone ?? null);
        if (field === "recorded" && !assigned.recordDate) {
          if (assigned.recordDateUnavailableReason) result.unavailableDateCount++;
          else result.undatedCount++;
        }
        const day = matcher.dateOf({ ...row, ...assigned });
        if (day !== null && counts.has(day)) { counts.set(day, counts.get(day)! + 1); result.total++; }
      }
      if (rows.length < 128) break;
      cursor = rows[rows.length - 1].id;
    }
    return { ...result, days: [...counts].map(([date, count]) => ({ date, count })) };
  }, { timeout: 30000 });
}
