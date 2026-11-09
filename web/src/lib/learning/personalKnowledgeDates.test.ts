import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPersonalKnowledge, getPersonalKnowledge, listPersonalKnowledge, revisePersonalKnowledge } from "./personalKnowledgeService";
import { getPersonalKnowledgeCalendar } from "./personalKnowledgeCalendar";
import { createSavedKnowledgeView, getSavedKnowledgeView } from "./savedKnowledgeViewService";
import { defaultKnowledgeViewConfig, type KnowledgeDateFilter } from "./knowledgeViewContracts";
import { digest } from "./teachingSources";
import { POST as postRecord, GET as getRecords } from "../../app/api/knowledge-points/route";
import { PATCH as patchRecord } from "../../app/api/knowledge-points/[pointId]/route";
import { GET as getCalendar } from "../../app/api/knowledge-points/calendar/route";

const deps = vi.hoisted(() => ({ db: null as PrismaClient | null, ai: vi.fn() }));
vi.mock("../prisma", () => ({ get prisma() { return deps.db!; } }));
vi.mock("../ai/tutorService", () => ({ runJsonTask: deps.ai }));
let directory: string, filename: string, db: PrismaClient;
function connect() { db = new PrismaClient({ datasources: { db: { url: `file:${filename.replace(/\\/g, "/")}` } } }); deps.db = db; }
beforeAll(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "englishnode-record-dates-"));
  filename = path.join(directory, "isolated.db"); fs.copyFileSync(path.resolve("prisma/seed.db"), filename); connect();
});
beforeEach(async () => {
  await db.knowledgeRecordTemplate.deleteMany(); await db.savedKnowledgeView.deleteMany(); await db.knowledgeGraphEdge.deleteMany(); await db.knowledgeGraphMembership.deleteMany(); await db.knowledgeGraphNode.deleteMany();
  await db.knowledgePoint.updateMany({ data: { currentRevisionId: null } }); await db.knowledgePoint.deleteMany();
  await db.learningProgress.deleteMany(); await db.nodeTeachingSession.deleteMany(); await db.learningNode.deleteMany(); await db.domain.deleteMany(); deps.ai.mockReset();
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
afterAll(async () => {
  await db?.$disconnect();
  if (directory && path.dirname(directory) === path.resolve(os.tmpdir())) fs.rmSync(directory, { recursive: true, force: true });
});

type Fixture = { id: string; title?: string; body?: string; aliases?: string[]; sourceType?: string; sourcesJson?: string; createdAt?: string; updatedAt?: string; domainId?: string; kind?: string; recordDate?: string | null; recordDateTimeZone?: string | null };
async function points(rows: Fixture[]) {
  await db.$transaction(async tx => {
    await tx.knowledgePoint.createMany({ data: rows.map(row => ({ id: row.id, title: "旧镜像", recordKind: row.kind || "note", domainId: row.domainId, createdAt: new Date(row.createdAt || "2026-01-05T12:00:00Z"), updatedAt: new Date(row.updatedAt || "2026-01-05T12:00:00Z") })) });
    await tx.knowledgePointRevision.createMany({ data: rows.map(row => ({ id: `${row.id}-v1`, knowledgePointId: row.id, sequence: 1, title: row.title || row.id, body: row.body || "当前正文", aliasesJson: JSON.stringify(row.aliases || []), sourceType: row.sourceType ?? "user", sourcesJson: row.sourcesJson || "[]", recordDate: row.recordDate ?? null, recordDateTimeZone: row.recordDateTimeZone ?? null })) });
    await tx.$executeRaw(Prisma.sql`UPDATE KnowledgePoint SET currentRevisionId = id || '-v1' WHERE id IN (${Prisma.join(rows.map(row => row.id))})`);
  });
}
const tuple = (date = "2026-03-08", timeZone = "America/Los_Angeles") => ({ date, timeZone });
const input = (requestId: string, overrides: Record<string, unknown> = {}) => ({ requestId, title: "个人日常记录", body: "亲自写下的正文", kind: "note", sourceType: "user", ...overrides });
const request = (method: string, value: unknown) => new Request("http://localhost/api/knowledge-points", { method, body: JSON.stringify(value) });
const context = (pointId: string) => ({ params: Promise.resolve({ pointId }) });
const range = (from: string, to = from, field: "recorded" | "created" | "updated" = "recorded", timeZone = "UTC"): KnowledgeDateFilter => ({ mode: "range", field, from, to, timeZone });
const ids = (result: Awaited<ReturnType<typeof listPersonalKnowledge>>) => result.knowledgePoints.map(point => point.id);
const calendar = (query = "month=2026-03&dateField=recorded&timeZone=UTC", now = new Date("2026-03-09T06:30:00Z")) => getPersonalKnowledgeCalendar(new URLSearchParams(query), now);
async function facts() {
  return {
    records: await db.knowledgePoint.count(), revisions: await db.knowledgePointRevision.count(), audits: await db.learningProgress.count(),
    relations: await db.knowledgeGraphEdge.count(), sessions: await db.nodeTeachingSession.count(), nodes: await db.learningNode.count(), ai: await db.aiCallLog.count()
  };
}

describe("修订本人日期与只读月历：隔离SQLite和正式HTTP", { timeout: 30000 }, () => {
  it("创建省略和null均未指定，完整日期与时区别名经正式HTTP原样保存", async () => {
    for (const [requestId, extra] of [["omitted", {}], ["null", { recordDate: null }], ["assigned", { recordDate: tuple("2024-02-29", "US/Pacific") }]] as const) {
      const response = await postRecord(request("POST", input(requestId, extra))); expect(response.status).toBe(200);
      const point = (await response.json()).knowledgePoint, expected = requestId === "assigned" ? tuple("2024-02-29", "US/Pacific") : null;
      expect(point.recordDate).toEqual(expected); expect(point.recordDateUnavailableReason).toBeUndefined();
      const raw = await db.knowledgePointRevision.findUniqueOrThrow({ where: { id: point.currentRevisionId } });
      expect([raw.recordDate, raw.recordDateTimeZone]).toEqual(expected ? [expected.date, expected.timeZone] : [null, null]);
    }
    expect(await facts()).toEqual({ records: 3, revisions: 3, audits: 3, relations: 0, sessions: 0, nodes: 0, ai: 0 });
    expect(deps.ai).not.toHaveBeenCalled();
  });

  it("无日期创建保持旧inputHash，null/省略同号复用，非空日期参与幂等身份", async () => {
    const body = input("legacy-hash"), saved = await createPersonalKnowledge(body);
    const audit = await db.learningProgress.findUniqueOrThrow({ where: { id: `record-save:${digest(body.requestId)}` } });
    expect(JSON.parse(audit.payloadJson).inputHash).toBe(digest({ title: body.title, body: body.body, kind: body.kind, sourceType: body.sourceType, domainId: null, nodeIds: [], domainIds: [], sessionId: null, sources: [] }));
    expect((await createPersonalKnowledge({ ...body, recordDate: null })).knowledgePoint.id).toBe(saved.knowledgePoint.id);
    expect((await createPersonalKnowledge(body)).knowledgePoint.id).toBe(saved.knowledgePoint.id);
    await expect(createPersonalKnowledge({ ...body, recordDate: tuple() })).rejects.toMatchObject({ status: 409 });
    const dated = input("date-hash", { recordDate: tuple() }), first = await createPersonalKnowledge(dated);
    expect((await createPersonalKnowledge(dated)).knowledgePoint.id).toBe(first.knowledgePoint.id);
    await expect(createPersonalKnowledge({ ...dated, recordDate: tuple("2026-03-09") })).rejects.toMatchObject({ status: 409 });
    await expect(createPersonalKnowledge({ ...dated, recordDate: tuple("2026-03-08", "UTC") })).rejects.toMatchObject({ status: 409 });
    expect(await db.knowledgePointRevision.count()).toBe(2); expect(await db.learningProgress.count()).toBe(2);
  });

  it("坏日期/时区/半tuple/未知字段写入400，显式undefined也拒绝且原子保留", async () => {
    const saved = (await createPersonalKnowledge(input("valid", { recordDate: tuple() }))).knowledgePoint;
    const before = await db.knowledgePointRevision.findMany(), counts = await facts();
    for (const recordDate of ["2026-03-08", [], {}, { date: "2026-03-08" }, { timeZone: "UTC" }, tuple("2026-02-29"), tuple("2026-04-31"), tuple("0000-01-01"), tuple("10000-01-01"), tuple("2026-3-08"), tuple("2026-03-08 "), tuple("2026-03-08", " UTC"), tuple("2026-03-08", "+01:00"), tuple("2026-03-08", "Missing/Zone"), { ...tuple(), hidden: true }, { date: 20260308, timeZone: "UTC" }]) {
      expect((await postRecord(request("POST", input(crypto.randomUUID(), { recordDate })))).status).toBe(400);
      expect((await patchRecord(request("PATCH", { ...input("unused"), expectedRevisionId: saved.currentRevisionId, recordDate }), context(saved.id))).status).toBe(400);
    }
    await expect(createPersonalKnowledge(input("undefined", { recordDate: undefined }))).rejects.toMatchObject({ status: 400 });
    await expect(revisePersonalKnowledge(saved.id, { ...input("undefined"), expectedRevisionId: saved.currentRevisionId, recordDate: undefined })).rejects.toMatchObject({ status: 400 });
    expect(await db.knowledgePointRevision.findMany()).toEqual(before); expect(await facts()).toEqual(counts);
  });

  it("修订省略日期继承expected当前原列，不能借latest非当前修订改变日期/别名/来源", async () => {
    const snapshot = [{ kind: "external", url: "https://example.com/original", title: "原来源", quote: "固定", obtained: false }];
    await points([{ id: "current", recordDate: "2026-03-08", recordDateTimeZone: "US/Pacific", aliases: ["原别名"], sourcesJson: JSON.stringify(snapshot) }]);
    const original = await db.knowledgePointRevision.findUniqueOrThrow({ where: { id: "current-v1" } });
    const other = await db.knowledgePointRevision.create({ data: { knowledgePointId: "current", sequence: 9, title: "非当前", body: "旧分支", sourceType: "user", recordDate: "2026-08-01", recordDateTimeZone: "UTC" } });
    const revised = await revisePersonalKnowledge("current", { title: "明确新正文", body: "当前修改", kind: "note", sourceType: "user", expectedRevisionId: original.id });
    expect(revised.knowledgePoint.recordDate).toEqual(tuple("2026-03-08", "US/Pacific"));
    const latest = await db.knowledgePointRevision.findUniqueOrThrow({ where: { id: revised.knowledgePoint.currentRevisionId! } });
    expect(latest.sequence).toBe(10); expect(latest.aliasesJson).toBe(original.aliasesJson); expect(latest.sourcesJson).toBe(original.sourcesJson);
    expect(await db.knowledgePointRevision.findUnique({ where: { id: original.id } })).toEqual(original);
    expect(await db.knowledgePointRevision.findUnique({ where: { id: other.id } })).toEqual(other);
    expect(revised.revisions.find(row => row.id === other.id)?.recordDate).toEqual(tuple("2026-08-01", "UTC"));
  });

  it("修改与明确清空日期追加新修订，历史逐个显示且全行immutable门继续启用", async () => {
    const first = (await createPersonalKnowledge(input("history", { recordDate: tuple() }))).knowledgePoint;
    const original = await db.knowledgePointRevision.findUniqueOrThrow({ where: { id: first.currentRevisionId! } });
    const secondResponse = await patchRecord(request("PATCH", { ...input("unused"), expectedRevisionId: first.currentRevisionId, recordDate: tuple("2026-03-09", "Asia/Shanghai") }), context(first.id));
    expect(secondResponse.status).toBe(200); const second = (await secondResponse.json()).knowledgePoint;
    const last = await revisePersonalKnowledge(first.id, { ...input("unused"), expectedRevisionId: second.currentRevisionId, recordDate: null });
    expect(last.knowledgePoint.recordDate).toBeNull();
    expect(last.revisions.map(row => row.recordDate)).toEqual([null, tuple("2026-03-09", "Asia/Shanghai"), tuple()]);
    const raw = await db.knowledgePointRevision.findUniqueOrThrow({ where: { id: last.knowledgePoint.currentRevisionId! } });
    expect([raw.recordDate, raw.recordDateTimeZone]).toEqual([null, null]);
    await expect(db.knowledgePointRevision.update({ where: { id: original.id }, data: { recordDate: "2026-12-31" } })).rejects.toThrow();
    expect(await db.knowledgePointRevision.findUnique({ where: { id: original.id } })).toEqual(original);
  });

  it("坏历史raw只在首次INSERT准备，DTO标不可用但普通读取不修复且recorded筛选不匹配", async () => {
    const bad: Fixture[] = [
      { id: "half-date", recordDate: "2026-03-08" }, { id: "half-zone", recordDateTimeZone: "UTC" },
      { id: "impossible", recordDate: "2026-02-30", recordDateTimeZone: "UTC" }, { id: "empty", recordDate: "", recordDateTimeZone: "UTC" },
      { id: "bad-zone", recordDate: "2026-03-08", recordDateTimeZone: "UTC\n" }, { id: "offset", recordDate: "2026-03-08", recordDateTimeZone: "+01:00" }
    ];
    await points([...bad, { id: "unassigned" }, { id: "good", recordDate: "2026-03-08", recordDateTimeZone: "UTC" }]);
    const raw = await db.knowledgePointRevision.findMany({ orderBy: { id: "asc" } }), counts = await facts();
    const all = await listPersonalKnowledge(); expect(all.page.total).toBe(8);
    for (const row of bad) {
      const read = await getPersonalKnowledge(row.id);
      expect(read.knowledgePoint.recordDate).toBeNull(); expect(read.knowledgePoint.recordDateUnavailableReason).toBeTruthy();
      expect(read.revisions[0].recordDate).toBeNull(); expect(read.revisions[0].recordDateUnavailableReason).toBeTruthy();
    }
    expect((await getPersonalKnowledge("unassigned")).knowledgePoint.recordDateUnavailableReason).toBeUndefined();
    expect(ids(await listPersonalKnowledge("", undefined, { date: range("2026-01-01", "2026-12-31") }))).toEqual(["good"]);
    expect(await db.knowledgePointRevision.findMany({ orderBy: { id: "asc" } })).toEqual(raw); expect(await facts()).toEqual(counts);
  });

  it("正文修订不编辑坏日期仍精确保留raw，只有明确日期或null才修复", async () => {
    await points([{ id: "broken", recordDate: "not-a-day", recordDateTimeZone: "UTC" }]);
    const first = await db.knowledgePointRevision.findUniqueOrThrow({ where: { id: "broken-v1" } });
    const retained = await revisePersonalKnowledge("broken", { title: "只写正文", body: "日期暂不编辑", expectedRevisionId: first.id });
    expect(retained.knowledgePoint.recordDateUnavailableReason).toBeTruthy();
    const second = await db.knowledgePointRevision.findUniqueOrThrow({ where: { id: retained.knowledgePoint.currentRevisionId! } });
    expect([second.recordDate, second.recordDateTimeZone]).toEqual([first.recordDate, first.recordDateTimeZone]);
    const repaired = await revisePersonalKnowledge("broken", { title: "明确修正", body: "保留正文", expectedRevisionId: second.id, recordDate: tuple() });
    expect(repaired.knowledgePoint.recordDate).toEqual(tuple()); expect(repaired.knowledgePoint.recordDateUnavailableReason).toBeUndefined();
    expect(await db.knowledgePointRevision.findUnique({ where: { id: first.id } })).toEqual(first);
  });

  it("过期CAS与关联校验失败不部分写日期修订、记录指针或引用", async () => {
    const first = (await createPersonalKnowledge(input("cas", { recordDate: tuple() }))).knowledgePoint;
    const winner = await revisePersonalKnowledge(first.id, { ...input("unused"), expectedRevisionId: first.currentRevisionId, recordDate: null });
    const before = await db.knowledgePointRevision.findMany({ orderBy: { id: "asc" } }), counts = await facts();
    const stale = await patchRecord(request("PATCH", { ...input("unused"), expectedRevisionId: first.currentRevisionId, recordDate: tuple("2026-03-10") }), context(first.id));
    expect(stale.status).toBe(409);
    await expect(revisePersonalKnowledge(first.id, { ...input("unused"), expectedRevisionId: winner.knowledgePoint.currentRevisionId, recordDate: tuple("2026-03-11"), nodeIds: ["missing-node"] })).rejects.toMatchObject({ status: 400 });
    await expect(createPersonalKnowledge(input("bad-domain", { recordDate: tuple(), domainIds: ["missing-domain"] }))).rejects.toMatchObject({ status: 400 });
    expect(await db.knowledgePointRevision.findMany({ orderBy: { id: "asc" } })).toEqual(before); expect(await facts()).toEqual(counts);
    expect((await getPersonalKnowledge(first.id)).knowledgePoint.currentRevisionId).toBe(winner.knowledgePoint.currentRevisionId);
  });

  it("日期不扩写record来源快照，源后续日期/正文改变与retained仍保留固定原文", async () => {
    const source = (await createPersonalKnowledge(input("source", { recordDate: tuple(), aliases: ["原别名"] }))).knowledgePoint;
    const referenced = (await createPersonalKnowledge(input("reference", { recordDate: tuple("2026-03-09"), aliases: ["引用别名"], sources: [{ kind: "record", knowledgePointId: source.id, revisionId: source.currentRevisionId }] }))).knowledgePoint;
    const raw = await db.knowledgePointRevision.findUniqueOrThrow({ where: { id: referenced.currentRevisionId! } });
    expect(Object.keys(referenced.sources[0]).sort()).toEqual(["body", "kind", "knowledgePointId", "revisionId", "sourceType", "title"]);
    await revisePersonalKnowledge(source.id, { ...input("unused", { body: "源新正文" }), expectedRevisionId: source.currentRevisionId, recordDate: tuple("2026-12-31") });
    const updated = await revisePersonalKnowledge(referenced.id, { title: "引用修订", body: "只改引用者", expectedRevisionId: referenced.currentRevisionId, sources: [{ kind: "retained", sourceIndex: 0 }] });
    const next = await db.knowledgePointRevision.findUniqueOrThrow({ where: { id: updated.knowledgePoint.currentRevisionId! } });
    expect(next.sourcesJson).toBe(raw.sourcesJson); expect(next.aliasesJson).toBe(raw.aliasesJson); expect(updated.knowledgePoint.recordDate).toEqual(tuple("2026-03-09"));
    expect(updated.knowledgePoint.sources[0]).toEqual(referenced.sources[0]);
  });

  it("跨128条准确分页与月历共用q/来源/领域/主题/类型，字面%_和当前日期先于total", async () => {
    await db.domain.createMany({ data: [{ id: "d1", name: "领域一" }, { id: "d2", name: "领域二" }] });
    const rows: Fixture[] = Array.from({ length: 270 }, (_, i) => ({ id: `page-${String(i).padStart(3, "0")}`, title: `条目${String(i).padStart(3, "0")}`, aliases: [i === 0 || i === 269 ? "ＤＡＹ_100%" : "other"], sourceType: "accepted_ai", kind: "question", domainId: "d1", recordDate: "2026-03-08", recordDateTimeZone: "Asia/Tokyo" }));
    for (const [id, extra] of [["wrong-date", { recordDate: "2026-02-28" }], ["wrong-source", { sourceType: "user" }], ["wrong-kind", { kind: "note" }], ["wrong-domain", { domainId: "d2" }], ["wrong-theme", {}]] as const) {
      const base: Fixture = { id, aliases: ["DAY_100%"], sourceType: "accepted_ai", kind: "question", domainId: "d1", recordDate: "2026-03-08", recordDateTimeZone: "UTC" };
      rows.push({ ...base, ...extra });
    }
    await points(rows); await db.knowledgeGraphNode.create({ data: { id: "topic", title: "主题", nodeType: "topic" } });
    await db.knowledgeGraphMembership.createMany({ data: rows.filter(row => row.id !== "wrong-theme").map(row => ({ groupNodeId: "topic", knowledgePointId: row.id })) });
    const options = { collectionId: "topic", kind: "question", sourceType: "accepted_ai", sort: "title_asc", date: range("2026-03-08"), limit: 1 }, counts = await facts();
    const first = await listPersonalKnowledge("day_100%", "d1", options), last = await listPersonalKnowledge("day_100%", "d1", { ...options, offset: first.page.nextOffset });
    expect(first.page.total).toBe(2); expect(last.page.total).toBe(2); expect(last.page.nextOffset).toBeNull(); expect([...ids(first), ...ids(last)]).toEqual(["page-000", "page-269"]);
    expect(first.knowledgePoints[0].matchedAliases).toEqual(["ＤＡＹ_100%"]);
    const month = await calendar("month=2026-03&dateField=recorded&q=day_100%25&domainId=d1&collectionId=topic&kind=question&sourceType=accepted_ai&sort=title_asc");
    expect(month.total).toBe(2); expect(month.days.find(day => day.date === "2026-03-08")?.count).toBe(2);
    expect((await listPersonalKnowledge("day_100%", "d1", { ...options, offset: 2 })).page.total).toBe(2);
    expect(await facts()).toEqual(counts);
  });

  it("月历按当前记录计数可同日多条，完整零日与未指定/不可用全域计数不冒充本月", async () => {
    await points([{ id: "same-1", recordDate: "2026-03-08", recordDateTimeZone: "UTC" }, { id: "same-2", recordDate: "2026-03-08", recordDateTimeZone: "Asia/Tokyo" }, { id: "last", recordDate: "2026-03-31", recordDateTimeZone: "UTC" }, { id: "outside", recordDate: "2026-04-01", recordDateTimeZone: "UTC" }, { id: "undated" }, { id: "broken", recordDate: "2026-03-99", recordDateTimeZone: "UTC" }]);
    await db.knowledgePoint.create({ data: { id: "no-revision", title: "历史未修订" } });
    await db.knowledgePointRevision.create({ data: { knowledgePointId: "same-1", sequence: 2, title: "非当前", body: "不计数", sourceType: "user", recordDate: "2026-03-09", recordDateTimeZone: "UTC" } });
    const before = await facts(), raw = await db.knowledgePointRevision.findMany({ orderBy: { id: "asc" } });
    const result = await calendar();
    expect(result).toMatchObject({ month: "2026-03", field: "recorded", timeZone: "UTC", today: "2026-03-09", total: 3, undatedCount: 2, unavailableDateCount: 1, dateWindow: { field: "recorded", timeZone: "UTC", from: "2026-03-01", to: "2026-03-31" } });
    expect(result.days).toHaveLength(31); expect(result.days[0]).toEqual({ date: "2026-03-01", count: 0 }); expect(result.days[30]).toEqual({ date: "2026-03-31", count: 1 });
    expect(result.days.find(day => day.date === "2026-03-08")?.count).toBe(2); expect(result.days.find(day => day.date === "2026-03-09")?.count).toBe(0);
    for (const day of result.days.filter(day => day.count)) expect((await listPersonalKnowledge("", undefined, { date: range(day.date) })).page.total).toBe(day.count);
    expect(result.filters.date).toEqual({ mode: "range", field: "recorded", timeZone: "UTC", from: "2026-03-01", to: "2026-03-31" });
    expect(await facts()).toEqual(before); expect(await db.knowledgePointRevision.findMany({ orderBy: { id: "asc" } })).toEqual(raw); expect(deps.ai).not.toHaveBeenCalled();
  });

  it("created/updated月历与DST本地日列表同口径且不取修订日期，统计不报告recorded未指定", async () => {
    await points([{ id: "before", createdAt: "2026-03-08T07:59:59Z", updatedAt: "2026-11-01T06:59:59Z" }, { id: "first", createdAt: "2026-03-08T08:00:00Z", updatedAt: "2026-11-01T07:00:00Z" }, { id: "last", createdAt: "2026-03-09T06:59:59Z", updatedAt: "2026-11-02T07:59:59Z" }, { id: "after", createdAt: "2026-03-09T07:00:00Z", updatedAt: "2026-11-02T08:00:00Z", recordDate: "broken", recordDateTimeZone: "UTC" }]);
    for (const [field, month, day] of [["created", "2026-03", "2026-03-08"], ["updated", "2026-11", "2026-11-01"]] as const) {
      const result = await calendar(`month=${month}&dateField=${field}&timeZone=America%2FLos_Angeles`);
      expect(result.days.find(value => value.date === day)?.count).toBe(2); expect(result.undatedCount).toBe(0); expect(result.unavailableDateCount).toBe(0);
      expect(ids(await listPersonalKnowledge("", undefined, { date: range(day, day, field, "America/Los_Angeles") })).sort()).toEqual(["first", "last"]);
    }
  });

  it("闰月及0001/9999端点仍按完整月计数，公历边界不转为UTC时间戳", async () => {
    await points([{ id: "leap", recordDate: "2024-02-29", recordDateTimeZone: "Pacific/Kiritimati" }, { id: "first-year", recordDate: "0001-01-01", recordDateTimeZone: "America/Los_Angeles" }, { id: "last-year", recordDate: "9999-12-31", recordDateTimeZone: "UTC" }]);
    for (const [month, date, length] of [["2024-02", "2024-02-29", 29], ["0001-01", "0001-01-01", 31], ["9999-12", "9999-12-31", 31]] as const) {
      const result = await calendar(`month=${month}&dateField=recorded&timeZone=UTC`);
      expect(result.days).toHaveLength(length); expect(result.total).toBe(1); expect(result.days.find(day => day.date === date)?.count).toBe(1);
      expect((await listPersonalKnowledge("", undefined, { date: range(date) })).page.total).toBe(1);
    }
    const ordinary = await calendar("month=2026-02&dateField=recorded"); expect(ordinary.days).toHaveLength(28); expect(ordinary.total).toBe(0);
  });

  it("未指定/不可用统计也先套基础q和来源，未知raw分类不改写且不受月范围截断", async () => {
    await points([{ id: "unassigned-match", aliases: ["ＤＡＹ_100%"], sourceType: "retired-provider" }, { id: "bad-match", aliases: ["DAY_100%"], sourceType: "", recordDate: "2026-04-31", recordDateTimeZone: "UTC" }, { id: "dated-outside", aliases: ["DAY_100%"], sourceType: "legacy_unknown", recordDate: "2027-01-01", recordDateTimeZone: "UTC" }, { id: "bad-query", aliases: ["other"], sourceType: "retired-provider", recordDate: "bad", recordDateTimeZone: "UTC" }, { id: "bad-source", aliases: ["DAY_100%"], sourceType: "user", recordDate: "bad", recordDateTimeZone: "UTC" }]);
    const raw = await db.knowledgePointRevision.findMany({ orderBy: { id: "asc" } });
    const result = await calendar("month=2026-03&dateField=recorded&q=day_100%25&sourceType=legacy_unknown");
    expect(result).toMatchObject({ total: 0, undatedCount: 1, unavailableDateCount: 1 }); expect(result.days.every(day => day.count === 0)).toBe(true);
    expect((await listPersonalKnowledge("day_100%", undefined, { sourceType: "legacy_unknown" })).page.total).toBe(3);
    expect(await db.knowledgePointRevision.findMany({ orderBy: { id: "asc" } })).toEqual(raw);
  });

  it("月缺省和相对窗口共用请求now，recorded日期跨时区不移日，月历只看基础而不套单日范围", async () => {
    await points([{ id: "fixed", recordDate: "2026-03-01", recordDateTimeZone: "Pacific/Kiritimati" }, { id: "next", recordDate: "2026-03-02", recordDateTimeZone: "UTC" }]);
    const instant = new Date("2026-03-01T00:30:00Z");
    expect(await calendar("dateField=recorded&timeZone=America%2FLos_Angeles", instant)).toMatchObject({ month: "2026-02", today: "2026-02-28", total: 0 });
    expect(await calendar("dateField=recorded&timeZone=UTC", instant)).toMatchObject({ month: "2026-03", today: "2026-03-01", total: 2 });
    for (const timeZone of ["Pacific/Kiritimati", "America/Los_Angeles", "UTC"]) expect(ids(await listPersonalKnowledge("", undefined, { date: range("2026-03-01", "2026-03-01", "recorded", timeZone) }))).toEqual(["fixed"]);
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(instant);
    const local = await listPersonalKnowledge("", undefined, { date: { mode: "last_days", field: "recorded", days: 1, timeZone: "America/Los_Angeles" } });
    expect(local.page.total).toBe(0); expect(local.dateWindow).toMatchObject({ from: "2026-02-28", to: "2026-02-28" });
    const utc = await listPersonalKnowledge("", undefined, { date: { mode: "last_days", field: "recorded", days: 1, timeZone: "UTC" } }); expect(ids(utc)).toEqual(["fixed"]);
    expect((await calendar()).total).toBe(2);
  });

  it("月历失效领域/主题保留原scope并显式不可用，归档领域仍能读", async () => {
    await db.domain.create({ data: { id: "archived", name: "归档领域", status: "archived" } });
    await points([{ id: "inside", domainId: "archived", recordDate: "2026-03-08", recordDateTimeZone: "UTC" }, { id: "outside", recordDate: "2026-03-08", recordDateTimeZone: "UTC" }]);
    await db.knowledgeGraphNode.create({ data: { id: "not-topic", title: "普通图节点", nodeType: "knowledge" } });
    expect((await calendar("month=2026-03&dateField=recorded&domainId=archived")).total).toBe(1);
    for (const extra of ["domainId=removed", "collectionId=not-topic"]) {
      const result = await calendar(`month=2026-03&dateField=recorded&${extra}`);
      expect(result.unavailableReason).toBeTruthy(); expect(result.total).toBe(0); expect(result.days).toEqual([]);
      expect(result.undatedCount).toBe(0); expect(result.unavailableDateCount).toBe(0);
      expect(result.filters[extra.startsWith("domain") ? "domainId" : "collectionId"]).toBe(extra.split("=")[1]);
    }
  });

  it("正式calendar拒绝未知/重复/月范围混入/坏月，真实读取错误503而非伪零", async () => {
    await points([{ id: "kept" }]); const before = await facts();
    for (const query of ["month=2026-13", "month=0000-01", "month=2026-3", "month=2026-03&month=2026-04", "dateField=learned", "timeZone=%2B01%3A00", "timeZone=UTC&timeZone=UTC", "dateMode=range", "dateFrom=2026-03-08", "dateTo=2026-03-08", "dateDays=1", "fields=recordDate", "limit=1", "offset=1", "calendarMonth=2026-03", "unknown=1"]) expect((await getCalendar(new Request(`http://localhost/api/knowledge-points/calendar?${query}`))).status, query).toBe(400);
    expect((await getRecords(new Request("http://localhost/api/knowledge-points?dateMode=range&dateField=recorded&dateFrom=2026-03-08&fields=recordDate"))).status).toBe(200);
    vi.spyOn(db, "$transaction").mockRejectedValueOnce(new Error("isolated read failure"));
    const failed = await getCalendar(new Request("http://localhost/api/knowledge-points/calendar?month=2026-03&dateField=recorded")); expect(failed.status).toBe(503); expect(await failed.json()).not.toHaveProperty("days");
    expect(await facts()).toEqual(before);
  });

  it("SavedView完整旧v1形状仍可读，新recorded范围可保存且重连后不回填日期", async () => {
    const oldConfig = { ...defaultKnowledgeViewConfig(), displayFields: ["summary", "aliases", "collections"] };
    await db.savedKnowledgeView.create({ data: { id: "old-view", title: "旧完整配置", configJson: JSON.stringify(oldConfig) } });
    expect((await getSavedKnowledgeView("old-view")).view.config).toEqual(oldConfig);
    const config = { ...defaultKnowledgeViewConfig(), filters: { ...defaultKnowledgeViewConfig().filters, date: range("2026-03-08") }, displayFields: ["summary", "recordDate"] };
    const saved = await createSavedKnowledgeView({ requestId: "date-view", title: "本人日期", config });
    await points([{ id: "legacy" }, { id: "dated", recordDate: "2026-03-08", recordDateTimeZone: "US/Pacific" }]);
    const raw = await db.knowledgePointRevision.findMany({ orderBy: { id: "asc" } }), before = await facts(); await db.$disconnect(); connect();
    expect((await getSavedKnowledgeView(saved.view.id)).view.config).toEqual(config);
    expect((await calendar()).total).toBe(1); expect((await getPersonalKnowledge("legacy")).knowledgePoint.recordDate).toBeNull();
    expect(await db.knowledgePointRevision.findMany({ orderBy: { id: "asc" } })).toEqual(raw); expect(await facts()).toEqual(before); expect(deps.ai).not.toHaveBeenCalled();
  });
});
