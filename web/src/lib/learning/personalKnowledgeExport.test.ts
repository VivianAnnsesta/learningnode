import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import nodeProcess from "node:process";
import { createHash } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { capturePersonalKnowledgeExport, preparePersonalKnowledgeExport } from "./personalKnowledgeExport";
import { defaultKnowledgeViewConfig } from "./knowledgeViewContracts";
import { KNOWLEDGE_EXPORT_MAX_BYTES, parseKnowledgeExportRequest, type KnowledgeExportManifest, type KnowledgeExportRequest } from "./knowledgeExportContracts";
import { getPersonalKnowledge, listPersonalKnowledge, revisePersonalKnowledge } from "./personalKnowledgeService";
import * as archives from "../exports/knowledgeExportArchive";
import { POST as postExport } from "../../app/api/knowledge-points/export/route";

const deps = vi.hoisted(() => ({ db: null as PrismaClient | null, ai: vi.fn() }));
vi.mock("../prisma", () => ({ get prisma() { return deps.db!; } }));
vi.mock("../ai/tutorService", () => ({ runJsonTask: deps.ai }));
let directory: string, filename: string, db: PrismaClient;
function connect() { db = new PrismaClient({ datasources: { db: { url: `file:${filename.replace(/\\/g, "/")}` } } }); deps.db = db; }
beforeAll(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), "englishnode-export-")); filename = path.join(directory, "isolated.db"); fs.copyFileSync(path.resolve("prisma/seed.db"), filename); connect(); });
beforeEach(async () => {
  const slot = (nodeProcess as typeof nodeProcess & { [key: symbol]: unknown })[Symbol.for("englishnode.knowledgeExportOperation.v1")] as { active: symbol | null } | undefined;
  if (slot?.active) throw new Error("The previous export has not settled; refusing fixture reset.");
  await db.knowledgeGraphEdge.deleteMany(); await db.knowledgeGraphMembership.deleteMany(); await db.knowledgeGraphNode.deleteMany(); await db.learningNodeKnowledgePoint.deleteMany();
  await db.knowledgePoint.updateMany({ data: { currentRevisionId: null } }); await db.knowledgePoint.deleteMany(); await db.learningProgress.deleteMany(); await db.nodeTeachingSession.deleteMany(); await db.learningNode.deleteMany(); await db.domain.deleteMany(); await db.aiCallLog.deleteMany(); deps.ai.mockReset();
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
afterAll(async () => { await db?.$disconnect(); if (directory && path.dirname(directory) === path.resolve(os.tmpdir())) fs.rmSync(directory, { recursive: true, force: true }); });
type Fixture = { id: string; title?: string; body?: string; aliasesJson?: string; sourcesJson?: string; recordDate?: string | null; recordDateTimeZone?: string | null; sourceType?: string; kind?: string; domainId?: string; createdAt?: string; updatedAt?: string };
async function points(rows: Fixture[]) {
  await db.$transaction(async tx => {
    await tx.knowledgePoint.createMany({ data: rows.map(row => ({ id: row.id, title: "旧镜像", recordKind: row.kind || "note", domainId: row.domainId, createdAt: new Date(row.createdAt || "2026-01-05T12:00:00Z"), updatedAt: new Date(row.updatedAt || "2026-01-05T12:00:00Z") })) });
    await tx.knowledgePointRevision.createMany({ data: rows.map(row => ({ id: `${row.id}-r1`, knowledgePointId: row.id, sequence: 1, title: row.title || row.id, body: row.body ?? "个人正文", sourceType: row.sourceType ?? "user", aliasesJson: row.aliasesJson ?? "[]", sourcesJson: row.sourcesJson ?? "[]", recordDate: row.recordDate ?? null, recordDateTimeZone: row.recordDateTimeZone ?? null })) });
    await tx.$executeRaw(Prisma.sql`UPDATE KnowledgePoint SET currentRevisionId=id||'-r1' WHERE id IN (${Prisma.join(rows.map(row => row.id))})`);
  });
}
const view = (filters: Record<string, unknown> = {}, includeHistory = false, observedDateWindow: unknown = null): KnowledgeExportRequest => parseKnowledgeExportRequest({ scope: { mode: "view", filters: { ...defaultKnowledgeViewConfig().filters, ...filters }, observedDateWindow }, includeHistory });
const record = (pointId: string, includeHistory = false): KnowledgeExportRequest => ({ scope: { mode: "record", pointId }, includeHistory });
const request = (value: unknown, signal?: AbortSignal) => new Request("http://localhost/api/knowledge-points/export", { method: "POST", body: JSON.stringify(value), signal });
const gate = () => { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; };
async function facts() { return { points: await db.knowledgePoint.count(), revisions: await db.knowledgePointRevision.count(), audit: await db.learningProgress.count(), sessions: await db.nodeTeachingSession.count(), relations: await db.knowledgeGraphEdge.count(), ai: await db.aiCallLog.count() }; }
/** Test-only independent central-directory reader; ZIP CRC/format tests belong to the archive suite. */
async function manifest(response: Response) {
  const bytes = Buffer.from(await response.arrayBuffer()); expect(bytes.readUInt32LE(bytes.length - 22)).toBe(0x06054b50);
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(response.headers.get("X-EnglishNode-Export-Sha256"));
  let offset = bytes.readUInt32LE(bytes.length - 6); const files: string[] = [];
  for (let index = 0; index < bytes.readUInt16LE(bytes.length - 12); index++) {
    expect(bytes.readUInt32LE(offset)).toBe(0x02014b50); const nameLength = bytes.readUInt16LE(offset + 28), extra = bytes.readUInt16LE(offset + 30), comment = bytes.readUInt16LE(offset + 32), name = bytes.subarray(offset + 46, offset + 46 + nameLength).toString("utf8"); files.push(name);
    if (name === "manifest.json") {
      const local = bytes.readUInt32LE(offset + 42), size = bytes.readUInt32LE(offset + 24), start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
      return { value: JSON.parse(bytes.subarray(start, start + size).toString("utf8")) as KnowledgeExportManifest, bytes, files };
    }
    offset += 46 + nameLength + extra + comment;
  }
  throw new Error("Archive has no manifest.json");
}

describe("个人知识导出：真实隔离SQLite与正式二进制HTTP", { timeout: 30000 }, () => {
  it("当前检索335条完整读取，超过128扫描和300页面且顺序等同正式列表", async () => {
    const rows = Array.from({ length: 335 }, (_, i) => ({ id: `all-${String(i).padStart(3, "0")}`, title: `条目${String(334 - i).padStart(3, "0")}` })); await points(rows);
    const first = await listPersonalKnowledge("", undefined, { sort: "title_asc", limit: 300 }); expect(first.page.total).toBe(335); expect(first.knowledgePoints).toHaveLength(300);
    const snapshot = await capturePersonalKnowledgeExport(view({ sort: "title_asc" })); expect(snapshot.records).toHaveLength(335); expect(snapshot.orderedRecordIds.slice(0, 300)).toEqual(first.knowledgePoints.map(row => row.id)); expect(snapshot.orderedRecordIds[334]).toBe("all-000");
    expect(snapshot.records.map(row => row.id)).toEqual(snapshot.orderedRecordIds);
  });

  it("历史开关保留完整raw正文/JSON/坏日期，kind只归当前point", async () => {
    await points([{ id: "raw", body: "原😀\r\n正文\r末\0", sourcesJson: "{invalid-source", aliasesJson: "{invalid-alias", recordDate: "2026-02-30", recordDateTimeZone: " UTC ", kind: "question" }]);
    const old = await db.knowledgePointRevision.findUniqueOrThrow({ where: { id: "raw-r1" } });
    const next = await db.knowledgePointRevision.create({ data: { knowledgePointId: "raw", sequence: 2, title: "当前标题", body: "当前正文", sourceType: "unknown-source", sourcesJson: '[{"kind":"future","raw":true}]', aliasesJson: '["当前别名"]' } }); await db.knowledgePoint.update({ where: { id: "raw" }, data: { currentRevisionId: next.id } });
    const single = await capturePersonalKnowledgeExport(record("raw")); expect(single.records[0].revisions.map(row => row.id)).toEqual([next.id]);
    const all = await capturePersonalKnowledgeExport(record("raw", true)), prior = all.records[0].revisions[0]; expect(prior).toEqual({ ...old, createdAt: old.createdAt.toISOString() }); expect(prior.recordDate).toBe("2026-02-30"); expect(all.records[0].currentRecordKind).toBe("question"); expect(prior).not.toHaveProperty("kind"); expect(prior).not.toHaveProperty("recordKind");
    expect((await getPersonalKnowledge("raw")).revisions.find(row => row.id === old.id)?.recordDate).toBeNull();
  });

  it("当前指针指向早修订时history关闭不猜latest，history开启仍含所有owned行", async () => {
    await points([{ id: "old-current" }]); const latest = await db.knowledgePointRevision.create({ data: { knowledgePointId: "old-current", sequence: 9, title: "不是当前", body: "不得代替当前", sourceType: "user" } });
    expect((await capturePersonalKnowledgeExport(record("old-current"))).records[0].revisions.map(row => row.id)).toEqual(["old-current-r1"]);
    expect((await capturePersonalKnowledgeExport(record("old-current", true))).records[0].revisions.map(row => row.id)).toEqual(["old-current-r1", latest.id]);
  });

  it("null指针保留真实legacyFallback、不造修订或历史kind，即使存在非当前历史", async () => {
    await db.knowledgePoint.create({ data: { id: "legacy", title: "旧标题", userUnderstanding: "旧理解\r\n原文", coreEssence: "旧核心", recordKind: "experience" } });
    const prior = await db.knowledgePointRevision.create({ data: { knowledgePointId: "legacy", sequence: 4, title: "非当前历史", body: "旧修订", sourceType: "legacy_user" } });
    const current = (await capturePersonalKnowledgeExport(record("legacy"))).records[0]; expect(current.currentRevisionId).toBeNull(); expect(current.currentTitle).toBe("旧标题"); expect(current.legacyFallback).toEqual({ title: "旧标题", userUnderstanding: "旧理解\r\n原文", coreEssence: "旧核心" }); expect(current.revisions).toEqual([]);
    expect((await capturePersonalKnowledgeExport(record("legacy", true))).records[0].revisions.map(row => row.id)).toEqual([prior.id]);
  });

  it("既有归属trigger拒绝跨记录当前指针，失败不改变导出原始身份", async () => {
    await points([{ id: "owner" }, { id: "other" }]); const foreign = await db.knowledgePointRevision.create({ data: { knowledgePointId: "other", sequence: 2, title: "其他owned", body: "不归本记录", sourceType: "user" } });
    await expect(db.knowledgePoint.update({ where: { id: "owner" }, data: { currentRevisionId: foreign.id } })).rejects.toThrow(); expect((await capturePersonalKnowledgeExport(record("owner"))).records[0].currentRevisionId).toBe("owner-r1");
  });

  it("最近规则冻结页面已观察civil窗口，跨午夜导出不重算now", async () => {
    await points([{ id: "observed", recordDate: "2026-03-08", recordDateTimeZone: "Asia/Tokyo" }, { id: "new-day", recordDate: "2026-03-09", recordDateTimeZone: "UTC" }]);
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-03-10T12:00:00Z"));
    const window = { field: "recorded", timeZone: "America/Los_Angeles", from: "2026-03-08", to: "2026-03-08" }, snapshot = await capturePersonalKnowledgeExport(view({ date: { mode: "last_days", field: "recorded", timeZone: window.timeZone, days: 1 } }, false, window));
    expect(snapshot.orderedRecordIds).toEqual(["observed"]); expect(snapshot.effectiveDateWindow).toEqual(window); expect(snapshot.request.scope.mode === "view" && snapshot.request.scope.filters.date.mode).toBe("last_days"); expect(snapshot.effectiveFilters?.date.mode).toBe("range");
  });

  it("按创建时间的DST日与本人日期坏raw沿用现有过滤，无日期模式仍可保留问题数据", async () => {
    await points([{ id: "before", createdAt: "2026-03-08T07:59:59Z", recordDate: "2026-03-08", recordDateTimeZone: "UTC" }, { id: "inside", createdAt: "2026-03-08T08:00:00Z", recordDate: "bad", recordDateTimeZone: "UTC" }, { id: "last", createdAt: "2026-03-09T06:59:59Z" }, { id: "after", createdAt: "2026-03-09T07:00:00Z" }]);
    const date = { mode: "range", field: "created", timeZone: "America/Los_Angeles", from: "2026-03-08", to: "2026-03-08" }, window = { field: date.field, timeZone: date.timeZone, from: date.from, to: date.to };
    expect((await capturePersonalKnowledgeExport(view({ date }, false, window))).orderedRecordIds.sort()).toEqual(["inside", "last"]);
    const assigned = { ...date, field: "recorded" }; expect((await capturePersonalKnowledgeExport(view({ date: assigned }, false, { ...window, field: "recorded" }))).orderedRecordIds).toEqual(["before"]);
    expect((await capturePersonalKnowledgeExport(view())).records.find(row => row.id === "inside")?.revisions[0].recordDate).toBe("bad");
  });

  it("q/别名字面%_/领域/主题/类型/来源在准确选择前统一应用", async () => {
    await db.domain.createMany({ data: [{ id: "d1", name: "一" }, { id: "d2", name: "二" }] }); const rows: Fixture[] = Array.from({ length: 270 }, (_, i) => ({ id: `page-${String(i).padStart(3, "0")}`, domainId: "d1", kind: "question", sourceType: "accepted_ai", aliasesJson: JSON.stringify([i === 0 || i === 269 ? "Ｘ_100%" : "other"]) }));
    rows.push({ id: "wrong", domainId: "d2", kind: "question", sourceType: "accepted_ai", aliasesJson: '["x_100%"]' }); await points(rows); await db.knowledgeGraphNode.create({ data: { id: "topic", title: "主题", nodeType: "topic" } }); await db.knowledgeGraphMembership.createMany({ data: rows.map(row => ({ groupNodeId: "topic", knowledgePointId: row.id })) });
    const snapshot = await capturePersonalKnowledgeExport(view({ q: "x_100%", domainId: "d1", kind: "question", sourceType: "accepted_ai", collectionId: "topic", sort: "title_asc" })); expect(snapshot.orderedRecordIds).toEqual(["page-000", "page-269"]);
  });

  it("未知/空source只读归legacy_unknown，不拿引用来源或历史分类代替当前", async () => {
    await points([{ id: "unknown", sourceType: "retired", sourcesJson: '[{"kind":"record","sourceType":"accepted_ai"}]' }, { id: "empty", sourceType: "" }, { id: "user" }]); await db.knowledgePoint.create({ data: { id: "legacy", title: "无修订" } });
    expect((await capturePersonalKnowledgeExport(view({ sourceType: "legacy_unknown" }))).orderedRecordIds.sort()).toEqual(["empty", "legacy", "unknown"]); expect((await capturePersonalKnowledgeExport(record("unknown"))).records[0].revisions[0].sourceType).toBe("retired");
  });

  it("缺失scope409与缺记录404不扩大；归档scope可导出，合法零项200空ZIP", async () => {
    await db.domain.create({ data: { id: "archived", name: "归档", status: "archived" } }); await points([{ id: "inside", domainId: "archived" }]);
    for (const filters of [{ domainId: "removed" }, { collectionId: "removed" }]) { const response = await postExport(request(view(filters))); expect(response.status).toBe(409); expect(response.headers.get("Content-Type")).toContain("application/json"); expect(response.headers.has("Content-Disposition")).toBe(false); }
    expect((await postExport(request(record("missing")))).status).toBe(404); expect((await capturePersonalKnowledgeExport(view({ domainId: "archived" }))).orderedRecordIds).toEqual(["inside"]);
    const response = await postExport(request(view({ q: "nothing-matches" }))); expect(response.status).toBe(200); const { value } = await manifest(response); expect(value.records).toEqual([]); expect(value.orderedRecordIds).toEqual([]); expect(response.headers.get("X-EnglishNode-Export-Record-Count")).toBe("0");
  });

  it("topic/membership/domain/node/graph上下文只白名单，不导出位置或学习内容", async () => {
    await db.domain.create({ data: { id: "context", name: "上下文域", goal: "不应导出教学目标" } }); await points([{ id: "selected", domainId: "context" }]);
    await db.learningNode.create({ data: { id: "node", domainId: "context", title: "任务标签", orderIndex: 0, objective: "private-learning-objective" } }); await db.learningNodeKnowledgePoint.create({ data: { nodeId: "node", knowledgePointId: "selected" } });
    await db.knowledgeGraphNode.createMany({ data: [{ id: "topic", nodeType: "topic", title: "主题", domainId: "context", positionX: 999 }, { id: "graph", knowledgePointId: "selected", title: "显式域引用", domainId: "context", status: "confirmed", positionY: 888 }] }); await db.knowledgeGraphMembership.create({ data: { groupNodeId: "topic", knowledgePointId: "selected" } });
    const snapshot = await capturePersonalKnowledgeExport(record("selected")); expect(snapshot.collections[0]).toMatchObject({ id: "topic", nodeType: "topic" }); expect(snapshot.collections[0]).not.toHaveProperty("positionX"); expect(snapshot.graphNodes[0]).not.toHaveProperty("positionY"); expect(snapshot.nodes).toEqual([{ id: "node", domainId: "context", title: "任务标签" }]); expect(snapshot.domains).toEqual([{ id: "context", name: "上下文域" }]); expect(JSON.stringify(snapshot)).not.toContain("private-learning-objective");
  });

  it("incident关系去重且保candidate/rejected/evidence/raw，外端只id与当前标题不取body", async () => {
    const rows = Array.from({ length: 130 }, (_, i) => ({ id: `selected-${String(i).padStart(3, "0")}` })); await points([...rows, { id: "outside", title: "外端标签", body: "outside-private-body" }]);
    await db.knowledgeGraphNode.create({ data: { id: "outside-node", title: "外节点标签", nodeType: "unknown", status: "candidate" } });
    await db.knowledgeGraphEdge.createMany({ data: [{ id: "between", fromKnowledgePointId: rows[0].id, toKnowledgePointId: rows[129].id, relationType: "related", status: "confirmed" }, { id: "incident", fromKnowledgePointId: "outside", toKnowledgePointId: rows[0].id, fromNodeId: "outside-node", relationType: "contrast", status: "rejected", evidenceStrength: "weak", userExplanation: "保留方向", aiAssessment: "{bad-json", legacyVariantsJson: "{legacy", applicability: "条件", misuseRisk: "提醒" }] });
    const snapshot = await capturePersonalKnowledgeExport(view({ q: "selected-" })); expect(snapshot.relations.map(row => row.id)).toEqual(["between", "incident"]); expect(snapshot.relations[1]).toMatchObject({ fromKnowledgePointId: "outside", status: "rejected", evidenceStrength: "weak", aiAssessment: "{bad-json", legacyVariantsJson: "{legacy" }); expect(snapshot.externalEndpoints).toEqual([{ id: "outside", title: "外端标签" }]); expect(snapshot.externalNodes).toEqual([{ id: "outside-node", domainId: null, title: "外节点标签", nodeType: "unknown", status: "candidate" }]); expect(JSON.stringify(snapshot)).not.toContain("outside-private-body"); expect(snapshot.records).toHaveLength(130);
  });

  it("固定record引用只解析已包括的精确修订，否则保留stored snapshot不跟随current", async () => {
    await points([{ id: "fixed-target", body: "旧固定正文" }]); const old = await db.knowledgePointRevision.findUniqueOrThrow({ where: { id: "fixed-target-r1" } }); const current = await db.knowledgePointRevision.create({ data: { knowledgePointId: old.knowledgePointId, sequence: 2, title: "fixed-current", body: "新正文不得替换引用", sourceType: "user" } }); await db.knowledgePoint.update({ where: { id: old.knowledgePointId }, data: { currentRevisionId: current.id } });
    const sourcesJson = JSON.stringify([{ kind: "record", knowledgePointId: old.knowledgePointId, revisionId: old.id, title: old.title, body: old.body, sourceType: old.sourceType }]); await points([{ id: "fixed-owner", sourcesJson }]);
    for (const includeHistory of [false, true]) { const response = await postExport(request(view({ q: "fixed-" }, includeHistory))); expect(response.status).toBe(200); const { value } = await manifest(response); expect(value.records.find(row => row.id === "fixed-owner")?.revisions[0].sourcesJson).toBe(sourcesJson); expect(value.references[0].resolution).toBe(includeHistory ? "included_revision" : "stored_snapshot"); }
    const outside = await capturePersonalKnowledgeExport(record("fixed-owner")); expect(outside.orderedRecordIds).toEqual(["fixed-owner"]); expect(outside.externalEndpoints).toEqual([]);
  });

  it("显式列白名单排除掌握、AI日志和系统数据，所有读取不写业务事实", async () => {
    await points([{ id: "kept" }]); await db.knowledgePoint.update({ where: { id: "kept" }, data: { masteryStatus: "legacy-private-status", sentenceSample: "private-legacy-sentence" } }); await db.aiCallLog.create({ data: { taskType: "fixture", provider: "fixture", rawOutput: "private-ai-log" } });
    const before = await facts(), raw = await db.knowledgePointRevision.findMany(), snapshot = await capturePersonalKnowledgeExport(record("kept", true)); const response = await postExport(request(record("kept", true))); expect(response.status).toBe(200); await manifest(response);
    for (const privateText of ["legacy-private-status", "private-legacy-sentence", "private-ai-log", "masteryStatus", "rawOutput", "AI_SETTINGS_PATH"]) expect(JSON.stringify(snapshot)).not.toContain(privateText);
    expect(await facts()).toEqual(before); expect(await db.knowledgePointRevision.findMany()).toEqual(raw); expect(deps.ai).not.toHaveBeenCalled();
  });

  it("请求严格白名单与已观察窗口无效时400，不发ZIP或吞掉scope", async () => {
    const good = view(); for (const value of [null, {}, { ...good, offset: 0 }, { ...good, includeHistory: undefined }, { ...good, includeHistory: "false" }, { scope: { mode: "record", pointId: "x", filters: {} }, includeHistory: false }, { scope: { mode: "view", filters: {}, observedDateWindow: null }, includeHistory: false }]) { const response = await postExport(request(value)); expect(response.status).toBe(400); expect(response.headers.get("Cache-Control")).toContain("no-store"); expect(response.headers.has("Content-Disposition")).toBe(false); }
  });

  it("二进制HTTP安全头/长度/摘要/真实manifest计数且文件名不采用恶意标题或ID", async () => {
    await points([{ id: "../outside\\CON", title: "恶意\r\n标题/../CON", body: "正文😀\r\n\0" }]); const response = await postExport(request(record("../outside\\CON"))); expect(response.status).toBe(200); expect(response.headers.get("Content-Type")).toBe("application/zip"); expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff"); expect(response.headers.get("Content-Disposition")).toMatch(/^attachment; filename="englishnode-knowledge-\d{8}T\d{9}Z\.zip"$/);
    const { value, bytes } = await manifest(response); expect(Number(response.headers.get("Content-Length"))).toBe(bytes.length); expect(value.records[0].id).toBe("../outside\\CON"); expect(value.files.every(file => !file.path.includes("..") && !file.path.includes("\\"))).toBe(true);
  });

  it("并发保存与导出共享单一读快照，不混旧指针/新修订，实际writer随后完成", async () => {
    await points([{ id: "concurrent", body: "旧正文" }]); const entered = gate(), release = gate(), writer = new PrismaClient({ datasources: { db: { url: `file:${filename.replace(/\\/g, "/")}` } } });
    await writer.$connect();
    let write: Promise<unknown> | undefined;
    const exporting = capturePersonalKnowledgeExport(record("concurrent", true), { afterSelection: async () => { entered.release(); await release.promise; } });
    try {
      await entered.promise; deps.db = writer;
      write = revisePersonalKnowledge("concurrent", { title: "新标题", body: "新正文", kind: "question", expectedRevisionId: "concurrent-r1" });
      await new Promise<void>(resolve => setImmediate(resolve));
      release.release(); const [snapshot] = await Promise.all([exporting, write]); expect(snapshot.records[0].currentRevisionId).toBe("concurrent-r1"); expect(snapshot.records[0].revisions.map(row => row.sequence)).toEqual([1]); expect(snapshot.records[0].currentRecordKind).toBe("note"); expect((await capturePersonalKnowledgeExport(record("concurrent", true))).records[0].revisions.map(row => row.sequence)).toEqual([1, 2]);
    } finally { release.release(); await Promise.allSettled([exporting, ...(write ? [write] : [])]); deps.db = db; await writer.$disconnect(); }
  });

  it("取消后单slot保持至formatter实际settle，不允许取消响应后重叠导出", async () => {
    await points([{ id: "cancel" }]); const entered = gate(), finish = gate(), controller = new AbortController(), original = archives.buildKnowledgeExportArchive;
    vi.spyOn(archives, "buildKnowledgeExportArchive").mockImplementationOnce(async (...args) => { entered.release(); await finish.promise; return original(...args); });
    const running = preparePersonalKnowledgeExport(record("cancel"), { signal: controller.signal });
    try { await entered.promise; const cancelled = expect(running).rejects.toMatchObject({ status: 499 }); controller.abort(); await cancelled; expect((await postExport(request(record("cancel")))).status).toBe(503); }
    finally { finish.release(); await Promise.allSettled([running]); await new Promise<void>(resolve => setImmediate(resolve)); }
    expect((await postExport(request(record("cancel")))).status).toBe(200);
  });

  it("预先取消不读取，HTTP64000边界保留，超长和非法JSON返回结构化错误", async () => {
    await points([{ id: "http" }]); const before = await facts(), controller = new AbortController(); controller.abort(); await expect(preparePersonalKnowledgeExport(record("http"), { signal: controller.signal })).rejects.toMatchObject({ status: 499 });
    const payload = JSON.stringify(record("http")), at = " ".repeat(64000 - payload.length) + payload; expect((await postExport(new Request("http://localhost/api/export", { method: "POST", body: at }))).status).toBe(200);
    expect((await postExport(new Request("http://localhost/api/export", { method: "POST", body: " " + at }))).status).toBe(413); expect((await postExport(new Request("http://localhost/api/export", { method: "POST", body: "{" }))).status).toBe(400); expect(await facts()).toEqual(before);
  });

  it("原始snapshot超过真实64MiB整体413，不截来源、不返回部分ZIP、不改数据", async () => {
    await db.knowledgePoint.create({ data: { id: "large", title: "大来源" } });
    await db.$executeRaw(Prisma.sql`INSERT INTO KnowledgePointRevision(id,knowledgePointId,sequence,title,body,sourceType,sourcesJson,aliasesJson) VALUES('large-r1','large',1,'大来源','正文','user',replace(hex(zeroblob(${KNOWLEDGE_EXPORT_MAX_BYTES / 2 + 1})), '0','x'),'[]')`);
    await db.knowledgePoint.update({ where: { id: "large" }, data: { currentRevisionId: "large-r1" } }); const before = await facts();
    const response = await postExport(request(record("large"))); expect(response.status).toBe(413); expect(response.headers.get("Content-Type")).toContain("application/json"); expect(response.headers.has("Content-Disposition")).toBe(false); expect(await facts()).toEqual(before);
    const raw = await db.$queryRaw<{ size: bigint }[]>(Prisma.sql`SELECT length(CAST(sourcesJson AS BLOB)) AS size FROM KnowledgePointRevision WHERE id='large-r1'`); expect(Number(raw[0].size)).toBe(KNOWLEDGE_EXPORT_MAX_BYTES + 2);
    const small = await db.knowledgePointRevision.create({ data: { knowledgePointId: "large", sequence: 2, title: "小当前", body: "只导出这段", sourceType: "user" } }); await db.knowledgePoint.update({ where: { id: "large" }, data: { currentRevisionId: small.id } }); const checkpoint = await facts();
    const currentOnly = await postExport(request(record("large"))); expect(currentOnly.status).toBe(200); expect((await manifest(currentOnly)).value.records[0].revisions.map(row => row.id)).toEqual([small.id]);
    expect((await postExport(request(record("large", true)))).status).toBe(413); expect(await facts()).toEqual(checkpoint);
  });
});
