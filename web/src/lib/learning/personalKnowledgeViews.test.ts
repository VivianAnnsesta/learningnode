import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getPersonalKnowledge, listPersonalKnowledge } from "./personalKnowledgeService";
import { createSavedKnowledgeView, getSavedKnowledgeView, listSavedKnowledgeViews } from "./savedKnowledgeViewService";
import { defaultKnowledgeViewConfig, type KnowledgeDateFilter, type KnowledgeViewConfig } from "./knowledgeViewContracts";
import { digest } from "./teachingSources";
import { GET as getRecords } from "../../app/api/knowledge-points/route";
import { GET as getViews, POST as postView } from "../../app/api/knowledge-points/views/route";
import { GET as getView, PATCH as patchView, DELETE as deleteView } from "../../app/api/knowledge-points/views/[viewId]/route";

const deps = vi.hoisted(() => ({ db: null as PrismaClient | null, ai: vi.fn() }));
vi.mock("../prisma", () => ({ get prisma() { return deps.db!; } }));
vi.mock("../ai/tutorService", () => ({ runJsonTask: deps.ai }));
let directory: string, filename: string, db: PrismaClient;
function connect() { db = new PrismaClient({ datasources: { db: { url: `file:${filename.replace(/\\/g, "/")}` } } }); deps.db = db; }
beforeAll(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "englishnode-knowledge-views-"));
  filename = path.join(directory, "isolated.db"); fs.copyFileSync(path.resolve("prisma/seed.db"), filename); connect();
});
beforeEach(async () => {
  await db.savedKnowledgeView.deleteMany(); await db.knowledgeGraphEdge.deleteMany(); await db.knowledgeGraphMembership.deleteMany(); await db.knowledgeGraphNode.deleteMany();
  await db.knowledgePoint.updateMany({ data: { currentRevisionId: null } }); await db.knowledgePoint.deleteMany();
  await db.learningProgress.deleteMany(); await db.nodeTeachingSession.deleteMany(); await db.learningNode.deleteMany(); await db.domain.deleteMany(); deps.ai.mockReset();
});
afterEach(() => vi.useRealTimers());
afterAll(async () => {
  await db?.$disconnect();
  if (directory && path.dirname(directory) === path.resolve(os.tmpdir())) fs.rmSync(directory, { recursive: true, force: true });
});

type Fixture = { id: string; title?: string; body?: string; aliases?: string[]; sourceType?: string; sourcesJson?: string; createdAt?: string; updatedAt?: string; domainId?: string; kind?: string };
async function points(rows: Fixture[]) {
  await db.$transaction(async tx => {
    await tx.knowledgePoint.createMany({ data: rows.map(row => ({ id: row.id, title: "旧镜像", recordKind: row.kind || "note", domainId: row.domainId, createdAt: new Date(row.createdAt || "2026-01-05T12:00:00Z"), updatedAt: new Date(row.updatedAt || "2026-01-05T12:00:00Z") })) });
    await tx.knowledgePointRevision.createMany({ data: rows.map(row => ({ id: `${row.id}-v1`, knowledgePointId: row.id, sequence: 1, title: row.title || row.id, body: row.body || "当前正文", aliasesJson: JSON.stringify(row.aliases || []), sourceType: row.sourceType ?? "user", sourcesJson: row.sourcesJson || "[]" })) });
    await tx.$executeRaw(Prisma.sql`UPDATE KnowledgePoint SET currentRevisionId = id || '-v1' WHERE id IN (${Prisma.join(rows.map(row => row.id))})`);
  });
}
const request = (method: string, value: unknown) => new Request("http://localhost/api/knowledge-points/views", { method, body: JSON.stringify(value) });
const context = (viewId: string) => ({ params: Promise.resolve({ viewId }) });
const config = (filters: Record<string, unknown> = {}, displayFields?: string[]) => ({ ...defaultKnowledgeViewConfig(), filters: { ...defaultKnowledgeViewConfig().filters, ...filters }, ...(displayFields ? { displayFields } : {}) });
const create = (requestId: string, overrides: Record<string, unknown> = {}) => createSavedKnowledgeView({ requestId, title: "阅读视图", config: config(), ...overrides });
async function facts() {
  const [records, revisions, edges, audit, sessions, ai] = await Promise.all([db.knowledgePoint.count(), db.knowledgePointRevision.count(), db.knowledgeGraphEdge.count(), db.learningProgress.count(), db.nodeTeachingSession.count(), db.aiCallLog.count()]);
  return { records, revisions, edges, audit, sessions, ai };
}
const ids = (result: Awaited<ReturnType<typeof listPersonalKnowledge>>) => result.knowledgePoints.map(point => point.id);
const range = (field: "created" | "updated", from: string, to = from, timeZone = "UTC"): KnowledgeDateFilter => ({ mode: "range", field, from, to, timeZone });

describe("保存检索视图、来源及日期：隔离SQLite与正式HTTP", { timeout: 30000 }, () => {
  it("六类来源独立，未知raw/空raw/无修订只读归历史未注明，不读取历史或引用来源冒充当前", async () => {
    const sources = ["user", "accepted_ai", "excerpt", "legacy_user", "legacy_ai_or_unknown", "legacy_unknown"];
    await points([...sources.map((sourceType, i) => ({ id: `source-${i}`, sourceType, ...(i === 0 ? { sourcesJson: JSON.stringify([{ kind: "record", knowledgePointId: "source-1", revisionId: "source-1-v1", title: "引用来源", body: "快照正文", sourceType: "accepted_ai" }]) } : {}) })), { id: "unknown", sourceType: "retired-provider" }, { id: "empty-source", sourceType: "" }]);
    await db.knowledgePoint.create({ data: { id: "unrevised", title: "旧记录", userUnderstanding: "旧理解" } });
    await db.knowledgePointRevision.create({ data: { knowledgePointId: "source-0", sequence: 2, title: "非当前", body: "非当前", sourceType: "accepted_ai" } });
    const before = await db.knowledgePointRevision.findMany({ orderBy: { id: "asc" } }), counts = await facts();
    for (const [index, sourceType] of sources.entries()) {
      const result = await listPersonalKnowledge("", undefined, { sourceType });
      expect(ids(result).sort()).toEqual(sourceType === "legacy_unknown" ? ["empty-source", "source-5", "unknown", "unrevised"] : [`source-${index}`]);
      expect(result.knowledgePoints.every(row => row.sourceCategory === sourceType)).toBe(true);
    }
    expect((await getPersonalKnowledge("unknown")).knowledgePoint).toMatchObject({ sourceType: "retired-provider", sourceCategory: "legacy_unknown" });
    expect((await getPersonalKnowledge("empty-source")).knowledgePoint.sourceType).toBe("");
    expect((await getPersonalKnowledge("unrevised")).knowledgePoint).toMatchObject({ sourceType: "legacy_unknown", sourceCategory: "legacy_unknown", body: "旧理解" });
    expect(await db.knowledgePointRevision.findMany({ orderBy: { id: "asc" } })).toEqual(before);
    expect(await facts()).toEqual(counts); expect(deps.ai).not.toHaveBeenCalled();
  });

  it("q/来源/日期与领域类型主题先于跨128条扫描的准确total和尾页，%与_仍为字面量", async () => {
    await db.domain.createMany({ data: [{ id: "d1", name: "领域一" }, { id: "d2", name: "领域二" }] });
    const rows: Fixture[] = Array.from({ length: 270 }, (_, i) => ({ id: `page-${String(i).padStart(3, "0")}`, title: `条目${String(i).padStart(3, "0")}`, aliases: [i === 0 || i === 269 ? "ＤＳＴ_100%" : "other"], sourceType: "accepted_ai", kind: "question", domainId: "d1" }));
    rows.push({ id: "wrong-source", aliases: ["DST_100%"], sourceType: "user", kind: "question", domainId: "d1" }, { id: "wrong-date", aliases: ["DST_100%"], sourceType: "accepted_ai", kind: "question", domainId: "d1", updatedAt: "2026-01-06T00:00:00Z" }, { id: "wrong-kind", aliases: ["DST_100%"], sourceType: "accepted_ai", kind: "note", domainId: "d1" }, { id: "wrong-domain", aliases: ["DST_100%"], sourceType: "accepted_ai", kind: "question", domainId: "d2" }, { id: "wrong-theme", aliases: ["DST_100%"], sourceType: "accepted_ai", kind: "question", domainId: "d1" });
    await points(rows);
    await db.knowledgeGraphNode.create({ data: { id: "theme", title: "主题", nodeType: "topic" } });
    await db.knowledgeGraphMembership.createMany({ data: rows.filter(row => row.id !== "wrong-theme").map(row => ({ groupNodeId: "theme", knowledgePointId: row.id })) });
    const before = await facts(), options = { kind: "question", collectionId: "theme", sourceType: "accepted_ai", date: range("updated", "2026-01-05"), sort: "title_asc", limit: 1 };
    const first = await listPersonalKnowledge("dst_100%", "d1", options), last = await listPersonalKnowledge("dst_100%", "d1", { ...options, offset: first.page.nextOffset });
    expect(first.page.total).toBe(2); expect(first.page.nextOffset).toBe(1); expect(last.page.total).toBe(2); expect(last.page.nextOffset).toBeNull();
    expect([...ids(first), ...ids(last)]).toEqual(["page-000", "page-269"]);
    expect(first.knowledgePoints[0].matchedAliases).toEqual(["ＤＳＴ_100%"]);
    expect(first.dateWindow).toEqual({ field: "updated", timeZone: "UTC", from: "2026-01-05", to: "2026-01-05" });
    const past = await listPersonalKnowledge("dst_100%", "d1", { ...options, offset: 2 });
    expect(past.page.total).toBe(2); expect(ids(past)).toEqual([]); expect(past.page.nextOffset).toBeNull();
    expect(await facts()).toEqual(before); expect(deps.ai).not.toHaveBeenCalled();
  });

  it("按记录点创建/更新时间覆盖春季23小时和秋季25小时本地日，不取修订时间", async () => {
    await points([
      { id: "spring-before", createdAt: "2026-03-08T07:59:59Z", updatedAt: "2026-11-01T20:00:00Z" },
      { id: "spring-first", createdAt: "2026-03-08T08:00:00Z", updatedAt: "2026-11-01T20:00:00Z" },
      { id: "spring-last", createdAt: "2026-03-09T06:59:59Z", updatedAt: "2026-11-01T20:00:00Z" },
      { id: "spring-after", createdAt: "2026-03-09T07:00:00Z", updatedAt: "2026-11-01T20:00:00Z" },
      { id: "fall-before", createdAt: "2026-11-01T06:59:59Z" }, { id: "fall-first", createdAt: "2026-11-01T07:00:00Z" },
      { id: "fall-last", createdAt: "2026-11-02T07:59:59Z" }, { id: "fall-after", createdAt: "2026-11-02T08:00:00Z" }
    ]);
    expect(ids(await listPersonalKnowledge("spring", undefined, { date: range("created", "2026-03-08", "2026-03-08", "America/Los_Angeles") })).sort()).toEqual(["spring-first", "spring-last"]);
    expect(ids(await listPersonalKnowledge("fall", undefined, { date: range("created", "2026-11-01", "2026-11-01", "America/Los_Angeles") })).sort()).toEqual(["fall-first", "fall-last"]);
    expect((await listPersonalKnowledge("spring", undefined, { date: range("updated", "2026-11-01", "2026-11-01", "America/Los_Angeles") })).page.total).toBe(4);
    expect((await listPersonalKnowledge("spring", undefined, { date: range("updated", "2026-03-08") })).page.total).toBe(0);
    expect((await listPersonalKnowledge("", undefined, { date: { mode: "all", field: "created", timeZone: "America/Los_Angeles" } })).dateWindow).toBeNull();
  });

  it("最近N天包含本地今天并按公历日跨DST，跨日分页可从dateWindow识别变化", async () => {
    await points([{ id: "before", createdAt: "2026-03-07T07:59:59Z" }, { id: "first", createdAt: "2026-03-07T08:00:00Z" }, { id: "last", createdAt: "2026-03-09T06:59:59Z" }, { id: "tomorrow", createdAt: "2026-03-09T07:00:00Z" }]);
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-03-09T06:30:00Z"));
    const date: KnowledgeDateFilter = { mode: "last_days", field: "created", days: 2, timeZone: "America/Los_Angeles" };
    const first = await listPersonalKnowledge("", undefined, { date, limit: 1 });
    expect(first.page.total).toBe(2); expect(first.dateWindow).toEqual({ field: "created", timeZone: "America/Los_Angeles", from: "2026-03-07", to: "2026-03-08" });
    const page = await listPersonalKnowledge("", undefined, { date, offset: 1, limit: 1 });
    expect([...ids(first), ...ids(page)].sort()).toEqual(["first", "last"]);
    vi.setSystemTime(new Date("2026-03-09T07:01:00Z"));
    const changed = await listPersonalKnowledge("", undefined, { date, offset: 1, limit: 1 });
    expect(changed.dateWindow).toEqual({ field: "created", timeZone: "America/Los_Angeles", from: "2026-03-08", to: "2026-03-09" });
    expect(changed.page.total).toBe(2);
  });

  it("HTTP拒绝重复/未知/非法来源日期及显示字段，不静默扩大查询", async () => {
    await points([{ id: "record" }]); const before = await facts();
    for (const query of ["sourceType=ai_verified", "sourceType=user&sourceType=excerpt", "dateMode=range&dateFrom=2026-02-30", "dateMode=range&dateFrom=2026-01-01&dateDays=2", "dateFrom=2026-01-01", "dateMode=last_days&dateDays=2&timeZone=%2B01%3A00", "dateField=learned", "fields=formula", "fields=summary,summary", "viewId=broken", "unsupported=1", "limit=1&limit=2", "offset=-1"]) {
      expect((await getRecords(new Request(`http://localhost/api/knowledge-points?${query}`))).status, query).toBe(400);
    }
    const visible = await getRecords(new Request("http://localhost/api/knowledge-points?sourceType=user&fields=none"));
    expect(visible.status).toBe(200); expect((await visible.json()).page.total).toBe(1);
    expect(await facts()).toEqual(before);
  });

  it("失效领域/主题返回原条件与空结果，归档领域仍可读且不能把普通图节点当主题", async () => {
    await db.domain.create({ data: { id: "archived", name: "归档领域", status: "archived" } });
    await points([{ id: "archived-point", domainId: "archived" }, { id: "outside" }]);
    await db.knowledgeGraphNode.create({ data: { id: "not-topic", title: "普通图节点", nodeType: "knowledge" } });
    expect(ids(await listPersonalKnowledge("", "archived"))).toEqual(["archived-point"]);
    for (const q of ["", "当前"]) {
      const missingDomain = await listPersonalKnowledge(q, "removed-domain");
      expect(ids(missingDomain)).toEqual([]); expect(missingDomain.filters.domainId).toBe("removed-domain"); expect(missingDomain.unavailableReason).toBeTruthy();
      const missingTheme = await listPersonalKnowledge(q, undefined, { collectionId: "not-topic", sourceType: "user" });
      expect(missingTheme.page.total).toBe(0); expect(missingTheme.filters.collectionId).toBe("not-topic"); expect(missingTheme.unavailableReason).toBeTruthy();
    }
  });

  it("明确POST按规范化标题配置幂等复用，同号不同配置409且保存不写内容或学习事实", async () => {
    await points([{ id: "kept", body: "不可被视图改写" }]); const before = await facts();
    const body = { requestId: "same-request", title: "  我的视图  ", config: config({ sourceType: "user" }, ["updatedAt", "summary"]) };
    const response = await postView(request("POST", body)); expect(response.status).toBe(200);
    const saved = (await response.json()).view;
    expect(saved).toMatchObject({ id: `view:${digest("same-request")}`, title: "我的视图", schemaVersion: 1, version: 1, config: { displayFields: ["summary", "updatedAt"] } });
    const retried = await postView(request("POST", { ...body, title: "我的视图", config: config({ sourceType: "user" }, ["summary", "updatedAt"]) }));
    expect(retried.status).toBe(200); expect((await retried.json()).view).toEqual(saved);
    expect((await postView(request("POST", { ...body, title: "另一标题" }))).status).toBe(409);
    expect((await postView(request("POST", { ...body, config: config({ q: "其他" }) }))).status).toBe(409);
    expect(await db.savedKnowledgeView.count()).toBe(1); expect(await facts()).toEqual(before); expect(deps.ai).not.toHaveBeenCalled();
  });

  it("同请求并发创建只保存一份配置，异请求允许同名视图", async () => {
    const body = { requestId: "race-create", title: "同名", config: config() };
    const responses = await Promise.all([postView(request("POST", body)), postView(request("POST", body))]);
    expect(responses.map(response => response.status)).toEqual([200, 200]);
    const [a, b] = await Promise.all(responses.map(response => response.json())); expect(a.view.id).toBe(b.view.id);
    const other = await create("different-request", { title: "同名" }); expect(other.view.id).not.toBe(a.view.id);
    expect(await db.savedKnowledgeView.count()).toBe(2);
  });

  it("PATCH和DELETE按版本CAS，冲突及无效版本不覆盖或删除新配置", async () => {
    await points([{ id: "kept" }]); const before = await facts(), saved = (await create("edit")).view;
    const updated = await patchView(request("PATCH", { title: "更新名称", config: config({ q: "当前" }, []), expectedVersion: saved.version }), context(saved.id));
    expect(updated.status).toBe(200); const latest = (await updated.json()).view; expect(latest.version).toBe(2); expect(latest.config.displayFields).toEqual([]);
    expect((await patchView(request("PATCH", { title: "旧窗口覆盖", config: config(), expectedVersion: 1 }), context(saved.id))).status).toBe(409);
    expect((await deleteView(request("DELETE", { expectedVersion: 1 }), context(saved.id))).status).toBe(409);
    for (const expectedVersion of [0, -1, "2", 1.5, 9007199254740991, null]) expect((await deleteView(request("DELETE", { expectedVersion }), context(saved.id))).status).toBe(400);
    expect((await (await getView(new Request("http://localhost/api/views"), context(saved.id))).json()).view).toEqual(latest);
    expect((await deleteView(request("DELETE", { expectedVersion: 2 }), context(saved.id))).status).toBe(200);
    expect((await getView(new Request("http://localhost/api/views"), context(saved.id))).status).toBe(404);
    expect(await facts()).toEqual(before);
  });

  it("两个真实并发更新同一版本仅一个成功，另一个409保留胜出的完整配置", async () => {
    const saved = (await create("race-update")).view;
    const results = await Promise.all(["窗口甲", "窗口乙"].map(title => patchView(request("PATCH", { title, config: config({ q: title }), expectedVersion: 1 }), context(saved.id))));
    expect(results.map(response => response.status).sort()).toEqual([200, 409]);
    const successful = await results.find(response => response.status === 200)!.json();
    const current = await getSavedKnowledgeView(saved.id);
    expect(current.view.version).toBe(2); expect(current.view.title).toBe(successful.view.title); expect(current.view.config).toEqual(successful.view.config);
    expect(await db.savedKnowledgeView.count()).toBe(1);
  });

  it("保存拒绝失效scope并原子回滚，后来删除scope只显示不可用且保留原配置", async () => {
    await db.domain.create({ data: { id: "scope", name: "有效领域" } });
    await db.knowledgeGraphNode.create({ data: { id: "scope-theme", title: "有效主题", nodeType: "topic" } });
    await points([{ id: "outside" }]); const counts = await facts();
    const saved = (await create("scope-view", { config: config({ domainId: "scope", collectionId: "scope-theme" }) })).view;
    const stored = await db.savedKnowledgeView.findUniqueOrThrow({ where: { id: saved.id } });
    expect((await postView(request("POST", { requestId: "missing", title: "失效", config: config({ domainId: "missing" }) }))).status).toBe(400);
    expect((await patchView(request("PATCH", { expectedVersion: 1, title: "不应保存", config: config({ collectionId: "missing" }) }), context(saved.id))).status).toBe(400);
    expect(await db.savedKnowledgeView.findUniqueOrThrow({ where: { id: saved.id } })).toEqual(stored);
    expect(await db.savedKnowledgeView.count()).toBe(1);
    await db.domain.delete({ where: { id: "scope" } }); await db.knowledgeGraphNode.delete({ where: { id: "scope-theme" } });
    const unavailable = (await getSavedKnowledgeView(saved.id)).view;
    expect(unavailable.config).toEqual(saved.config); expect(unavailable.unavailableReason).toBeTruthy();
    expect((await listSavedKnowledgeViews()).views[0].unavailableReason).toBeTruthy();
    const records = await listPersonalKnowledge("", saved.config!.filters.domainId, { collectionId: saved.config!.filters.collectionId });
    expect(records.page.total).toBe(0); expect(records.unavailableReason).toBeTruthy();
    expect(await db.savedKnowledgeView.findUniqueOrThrow({ where: { id: saved.id } })).toEqual(stored);
    expect(await facts()).toEqual(counts);
  });

  it("未知schema和损坏配置读取明确不可运行且不改raw，不能POST覆盖或PATCH降级，显式DELETE可清理", async () => {
    const futureId = `view:${digest("future")}`, futureJson = '{"future":"原配置"}';
    await db.savedKnowledgeView.createMany({ data: [
      { id: futureId, title: "未来版本", schemaVersion: 99, configJson: futureJson },
      { id: "broken", title: "损坏配置", schemaVersion: 1, configJson: "not-json" },
      { id: "bad-filter", title: "未知条件", schemaVersion: 1, configJson: '{"filters":{"unknown":true}}' },
      { id: "empty-config", title: "缺少所有字段", schemaVersion: 1, configJson: "{}" },
      { id: "missing-domain", title: "丢失范围字段", schemaVersion: 1, configJson: JSON.stringify({ ...config(), filters: { ...config().filters, domainId: undefined } }) },
      { id: "missing-date", title: "丢失日期字段", schemaVersion: 1, configJson: JSON.stringify({ ...config(), filters: { ...config().filters, date: undefined } }) }
    ] });
    const before = await db.savedKnowledgeView.findMany({ orderBy: { id: "asc" } });
    const listed = await listSavedKnowledgeViews(); expect(listed.views).toHaveLength(6);
    expect(listed.views.every(view => view.config === null && !!view.unavailableReason)).toBe(true);
    expect((await getSavedKnowledgeView(futureId)).view.config).toBeNull();
    expect((await postView(request("POST", { requestId: "future", title: "未来版本", config: config() }))).status).toBe(409);
    expect((await patchView(request("PATCH", { expectedVersion: 1, title: "不能降级", config: config() }), context(futureId))).status).toBe(400);
    expect(await db.savedKnowledgeView.findMany({ orderBy: { id: "asc" } })).toEqual(before);
    expect((await deleteView(request("DELETE", { expectedVersion: 1 }), context(futureId))).status).toBe(200);
    expect(await db.savedKnowledgeView.count()).toBe(5);
  });

  it("视图列表默认50且准确分页/尾页/越界，读取和客户端重连后配置不变", async () => {
    const configuration = config({ sourceType: "legacy_user", date: { mode: "all", field: "created", timeZone: "US/Pacific" } }, ["createdAt"]);
    await db.savedKnowledgeView.createMany({ data: Array.from({ length: 131 }, (_, i) => ({ id: `view-${String(i).padStart(3, "0")}`, title: `视图${i}`, configJson: JSON.stringify(configuration), updatedAt: new Date("2026-01-01T00:00:00Z") })) });
    const before = await db.savedKnowledgeView.findMany({ orderBy: { id: "asc" } });
    const firstResponse = await getViews(new Request("http://localhost/api/knowledge-points/views")); expect(firstResponse.status).toBe(200);
    const first = await firstResponse.json(); expect(first.views).toHaveLength(50); expect(first.page).toEqual({ offset: 0, limit: 50, total: 131, nextOffset: 50 });
    const last = await listSavedKnowledgeViews({ offset: 130, limit: 1 }); expect(last.views.map(view => view.id)).toEqual(["view-130"]); expect(last.page.nextOffset).toBeNull();
    const past = await listSavedKnowledgeViews({ offset: 131 }); expect(past.views).toEqual([]); expect(past.page.total).toBe(131);
    for (const query of ["limit=0", "offset=-1", "limit=1&limit=2", "q=ignored"]) expect((await getViews(new Request(`http://localhost/api/knowledge-points/views?${query}`))).status).toBe(400);
    await db.$disconnect(); connect();
    const reloaded = await getSavedKnowledgeView("view-000"); expect(reloaded.view.config).toEqual(configuration as KnowledgeViewConfig);
    expect(await db.savedKnowledgeView.findMany({ orderBy: { id: "asc" } })).toEqual(before); expect(deps.ai).not.toHaveBeenCalled();
  });
});
