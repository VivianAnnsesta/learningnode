import { expect, test, type Download, type Page, type TestInfo } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import type { KnowledgeExportManifest, KnowledgeExportRequest } from "../src/lib/learning/knowledgeExportContracts";
import { defaultKnowledgeViewConfig } from "../src/lib/learning/knowledgeViewContracts";

const db = new PrismaClient(), execute = promisify(execFile), endpoint = "/api/knowledge-points/export";
test.afterAll(async () => db.$disconnect());
type Inspection = { reader: string; zipBytes: number; zipSha256: string; entries: { name: string; bytes: number; sha256: string; crc32: number; base64: string }[]; manifest: KnowledgeExportManifest; bodySlicesVerified: number };
async function inspect(file: string): Promise<Inspection> {
  const result = await execute(process.execPath, [path.resolve("scripts/inspect-knowledge-export-zip.js"), file], { maxBuffer: 256 * 1024 * 1024 });
  return JSON.parse(result.stdout);
}
async function downloadArchive(page: Page, info: TestInfo, name: string, record = false) {
  const started = page.waitForResponse(r => new URL(r.url()).pathname === endpoint && r.request().method() === "POST");
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: record ? "导出这条已保存记录" : "导出整个检索结果", exact: true }).click();
  const response = await started; expect(response.status()).toBe(200);
  const download = await downloading; expect(download.suggestedFilename()).toMatch(/^englishnode-knowledge-\d{8}T\d{9}Z\.zip$/);
  const file = info.outputPath(`${name}.zip`); await download.saveAs(file); expect(await download.failure()).toBeNull();
  const result = await inspect(file);
  expect(result.zipSha256).toBe(response.headers()["x-englishnode-export-sha256"]);
  expect(result.zipBytes).toBe(Number(response.headers()["x-englishnode-export-bytes"]));
  expect(result.entries.length).toBe(Number(response.headers()["x-englishnode-export-file-count"]));
  return { ...result, input: response.request().postDataJSON() as KnowledgeExportRequest };
}
function view(q: string): KnowledgeExportRequest {
  return { scope: { mode: "view", filters: { ...defaultKnowledgeViewConfig().filters, q }, observedDateWindow: null }, includeHistory: true };
}
async function openList(page: Page, query: URLSearchParams) {
  const loaded = page.waitForResponse(r => new URL(r.url()).pathname === "/api/knowledge-points" && r.request().method() === "GET" && new URL(r.url()).searchParams.get("q") === query.get("q"));
  await page.goto(`/learning/knowledge?${query}`); const response = await loaded; expect(response.status()).toBe(200); const data = await response.json();
  await expect(page.getByRole("button", { name: "导出整个检索结果", exact: true })).toBeEnabled(); return data;
}
async function openDetail(page: Page, id: string) {
  await page.goto(`/learning/knowledge/${encodeURIComponent(id)}`);
  await expect(page.getByRole("button", { name: "导出这条已保存记录", exact: true })).toBeEnabled();
}
async function fixture(title: string, body: string, extra: { sourcesJson?: string; aliasesJson?: string; recordDate?: string; recordDateTimeZone?: string } = {}) {
  const point = await db.knowledgePoint.create({ data: { title, recordKind: "note", masteryStatus: "seen" } });
  const revision = await db.knowledgePointRevision.create({ data: { knowledgePointId: point.id, sequence: 1, title, body, sourceType: "user", ...extra } });
  await db.knowledgePoint.update({ where: { id: point.id }, data: { currentRevisionId: revision.id } }); return { point, revision };
}
async function facts() {
  // Compare complete owned rows and learning facts, rather than only record totals.
  return { points: await db.knowledgePoint.findMany({ orderBy: { id: "asc" } }), revisions: await db.knowledgePointRevision.findMany({ orderBy: { id: "asc" } }), relations: await db.knowledgeGraphEdge.findMany({ orderBy: { id: "asc" } }), progress: await db.learningProgress.count(), sessions: await db.nodeTeachingSession.count(), ai: await db.aiCallLog.count(), nodes: await db.learningNode.findMany({ orderBy: { id: "asc" } }) };
}
function bodyOf(result: Inspection, revisionId: string | null) {
  const file = result.manifest.files.find(x => x.revisionId === revisionId && x.role !== "index"); expect(file).toBeTruthy();
  const entry = result.entries.find(x => x.name === file!.path); expect(entry).toBeTruthy();
  return Buffer.from(entry!.base64, "base64").subarray(file!.bodyByteOffset!, file!.bodyByteOffset! + file!.bodyByteLength!).toString("utf8");
}

test("整个匹配结果超过300条仍完整导出，显示字段和未加载分页不缩小范围且零事实写入", async ({ page }, info) => {
  const key = crypto.randomUUID(), rows = Array.from({ length: 305 }, (_, index) => ({ id: `${key}-p-${String(index).padStart(3, "0")}`, title: `${key}-记录-${String(index).padStart(3, "0")}`, recordKind: "note" }));
  await db.knowledgePoint.createMany({ data: rows });
  await db.knowledgePointRevision.createMany({ data: rows.map(row => ({ id: `${row.id}-r`, knowledgePointId: row.id, sequence: 1, title: row.title, body: `原文-${row.id}`, sourceType: "user" })) });
  await db.$transaction(rows.map(row => db.knowledgePoint.update({ where: { id: row.id }, data: { currentRevisionId: `${row.id}-r` } })));
  const outside = await fixture(`不匹配-${crypto.randomUUID()}`, "范围外正文不能混入。");
  const before = await facts(), list = await openList(page, new URLSearchParams({ q: key, sort: "title_asc", fields: "kind" }));
  expect(list.page.total).toBe(305); expect(list.knowledgePoints.length).toBe(50);
  const result = await downloadArchive(page, info, "all-305-matches");
  expect(result.manifest.orderedRecordIds).toEqual(rows.map(x => x.id)); expect(result.manifest.records).toHaveLength(305);
  expect(result.manifest.records.some(x => x.id === outside.point.id)).toBe(false); expect(result.entries).toHaveLength(307);
  expect(result.manifest.request.scope.mode).toBe("view"); expect(result.manifest.request.scope).not.toHaveProperty("displayFields");
  expect(result.bodySlicesVerified).toBe(305); expect(bodyOf(result, `${rows[304].id}-r`)).toBe(`原文-${rows[304].id}`);
  expect(await facts()).toEqual(before); await page.screenshot({ path: info.outputPath("full-query-export-requested.png"), fullPage: true });
});

test("详情只导出已保存内容，当前指针不按最大序号猜测，历史选择和坏raw字段保真且草稿保留", async ({ page }, info) => {
  const key = crypto.randomUUID(), raw = "首行😀\r\n次行\r孤立\n\u0000末尾", aliasesJson = '{"未来别名":true}', sourcesJson = '{bad-json:原始来源';
  const { point, revision } = await fixture(`原保存-${key}`, raw, { aliasesJson, sourcesJson, recordDate: "2026-02-30", recordDateTimeZone: "UTC" });
  const higher = await db.knowledgePointRevision.create({ data: { knowledgePointId: point.id, sequence: 2, title: "非当前的较大序号", body: "不能冒充当前版本。", sourceType: "accepted_ai" } });
  const before = await facts(); await openDetail(page, point.id);
  await page.getByLabel("记录标题", { exact: true }).fill(`未保存标题-${key}`); await page.getByLabel("修订记录内容", { exact: true }).fill("未保存草稿🙂"); await page.getByLabel("记录别名", { exact: true }).fill("未保存别名");
  await page.getByLabel("本人指定记录日期", { exact: true }).fill("2026-03-04");
  const all = await downloadArchive(page, info, "detail-all-history", true), exported = all.manifest.records[0];
  expect(all.manifest.orderedRecordIds).toEqual([point.id]); expect(exported.currentRevisionId).toBe(revision.id); expect(exported.currentRecordKind).toBe("note");
  expect(exported.revisions.map(x => x.id)).toEqual([revision.id, higher.id]); expect(exported.revisions[0]).toMatchObject({ body: raw, aliasesJson, sourcesJson, recordDate: "2026-02-30", recordDateTimeZone: "UTC" });
  expect(bodyOf(all, revision.id)).toBe(raw); expect(bodyOf(all, higher.id)).toBe(higher.body); expect(exported.revisions[1]).not.toHaveProperty("recordKind");
  await page.getByLabel("包含全部历史修订", { exact: true }).uncheck(); const current = await downloadArchive(page, info, "detail-current-only", true);
  expect(current.manifest.records[0].revisions.map(x => x.id)).toEqual([revision.id]); expect(current.entries).toHaveLength(3); expect(bodyOf(current, revision.id)).toBe(raw);
  await expect(page.getByLabel("修订记录内容", { exact: true })).toHaveValue("未保存草稿🙂"); await expect(page.getByLabel("记录标题", { exact: true })).toHaveValue(`未保存标题-${key}`); await expect(page.getByLabel("记录别名", { exact: true })).toHaveValue("未保存别名"); await expect(page.getByLabel("本人指定记录日期", { exact: true })).toHaveValue("2026-03-04");
  expect(await facts()).toEqual(before); await page.screenshot({ path: info.outputPath("saved-export-keeps-unsaved-draft.png"), fullPage: true });
});

test("固定引用只链指定的已包含修订，包外快照不扩张记录范围且候选关系不变成确认", async ({ page }, info) => {
  const key = crypto.randomUUID(), source = await fixture(`选中来源-${key}`, "指定旧修订原文\r\n条件🙂"), outside = await fixture(`包外-${crypto.randomUUID()}`, "外部整条私有正文禁止自动展开");
  const next = await db.knowledgePointRevision.create({ data: { knowledgePointId: source.point.id, sequence: 2, title: source.point.title, body: "来源新正文", sourceType: "user" } });
  await db.knowledgePoint.update({ where: { id: source.point.id }, data: { currentRevisionId: next.id } });
  const sources = [{ kind: "record", knowledgePointId: source.point.id, revisionId: source.revision.id, title: source.revision.title, body: source.revision.body, sourceType: "user" }, { kind: "record", knowledgePointId: outside.point.id, revisionId: "historical-outside-not-current", title: "所存包外标题", body: "仅所存包外片段", sourceType: "user" }];
  const owner = await fixture(`引用持有-${key}`, "用户正文中的 [[符号]] 保持原样", { sourcesJson: JSON.stringify(sources) });
  const candidate = await db.knowledgeGraphEdge.create({ data: { fromKnowledgePointId: owner.point.id, toKnowledgePointId: outside.point.id, relationType: "analogy", status: "candidate", evidenceStrength: "weak", detail: "仍为候选", aiAssessment: "非科学证明" } });
  const confirmed = await db.knowledgeGraphEdge.create({ data: { fromKnowledgePointId: owner.point.id, toKnowledgePointId: source.point.id, relationType: "related", status: "confirmed", evidenceStrength: "unknown", userExplanation: "本人确认而非已证明" } });
  const before = await facts(); await openList(page, new URLSearchParams({ q: key }));
  const all = await downloadArchive(page, info, "fixed-reference-history");
  expect(all.manifest.records.map(x => x.id).sort()).toEqual([source.point.id, owner.point.id].sort());
  expect(all.manifest.references.find(x => x.revisionId === source.revision.id)).toMatchObject({ resolution: "included_revision", outsideSelection: false });
  const insidePath = all.manifest.references.find(x => x.revisionId === source.revision.id)!.path; expect(insidePath).toMatch(/^revisions\//);
  expect(all.manifest.references.find(x => x.knowledgePointId === outside.point.id)).toMatchObject({ resolution: "stored_snapshot", path: null, outsideSelection: true });
  expect(JSON.stringify(all.manifest)).not.toContain(outside.revision.body); expect(all.manifest.externalEndpoints).toContainEqual({ id: outside.point.id, title: outside.point.title });
  expect(all.manifest.relations.find(x => x.id === candidate.id)).toMatchObject({ status: "candidate", evidenceStrength: "weak" }); expect(all.manifest.relations.find(x => x.id === confirmed.id)).toMatchObject({ status: "confirmed", evidenceStrength: "unknown" });
  await page.getByLabel("包含全部历史修订", { exact: true }).uncheck(); const current = await downloadArchive(page, info, "fixed-reference-without-history");
  expect(current.manifest.references.find(x => x.revisionId === source.revision.id)).toMatchObject({ resolution: "stored_snapshot", path: null, outsideSelection: false });
  expect(bodyOf(current, owner.revision.id)).toBe(owner.revision.body); expect(JSON.stringify(current.manifest)).toContain(source.revision.body.replace(/\r/g, "\\r").replace(/\n/g, "\\n")); expect(await facts()).toEqual(before);
});

test("最近日期导出沿用已显示窗口，浏览器跨午夜不重算；未应用日期暂不可导出", async ({ page }, info) => {
  const key = crypto.randomUUID(), point = await fixture(`当前日期-${key}`, "已显示窗口内。"), before = await facts();
  const listed = await openList(page, new URLSearchParams({ q: key, dateMode: "last_days", dateField: "updated", timeZone: "UTC", dateDays: "1" }));
  expect(listed.dateWindow).toBeTruthy();
  await page.clock.setFixedTime(new Date(Date.parse(`${listed.dateWindow.to}T12:00:00Z`) + 86400000));
  const result = await downloadArchive(page, info, "frozen-observed-window");
  expect(result.input.scope).toMatchObject({ mode: "view", observedDateWindow: listed.dateWindow, filters: { date: { mode: "last_days", days: 1 } } });
  expect(result.manifest.effectiveDateWindow).toEqual(listed.dateWindow); expect(result.manifest.orderedRecordIds).toEqual([point.point.id]);
  await page.getByLabel("日期范围").selectOption("range"); await page.getByLabel("起始日期").fill("2026-01-01");
  await expect(page.getByRole("button", { name: "导出整个检索结果", exact: true })).toBeDisabled(); expect(await facts()).toEqual(before);
});

test("取消准备导出抑制真实迟到响应和下载，原记录草稿与检索保持", async ({ page }, info) => {
  const key = crypto.randomUUID(); await fixture(`取消-${key}`, "已保存内容"); await openList(page, new URLSearchParams({ q: key }));
  await page.getByLabel("新记录标题").fill("取消时的草稿标题"); await page.getByLabel("新记录内容", { exact: true }).fill("取消时草稿内容");
  const before = await facts(), downloads: Download[] = []; page.on("download", d => downloads.push(d));
  let release!: () => void, received!: () => void, finished!: () => void, handlerStarted = false, upstreamFailure: unknown;
  const gate = new Promise<void>(resolve => { release = resolve; }), responseReady = new Promise<void>(resolve => { received = resolve; }), routeFinished = new Promise<void>(resolve => { finished = resolve; });
  await page.route(`**${endpoint}`, async route => {
    handlerStarted = true;
    try { const response = await route.fetch(); expect(response.status()).toBe(200); await response.body(); received(); await gate; try { await route.fulfill({ response }); } catch (error) { if (!route.request().failure()) throw error; } }
    catch (error) { upstreamFailure = error; received(); await route.abort().catch(() => {}); }
    finally { finished(); }
  });
  try {
    await page.getByRole("button", { name: "导出整个检索结果", exact: true }).click(); await responseReady; if (upstreamFailure) throw upstreamFailure;
    await page.getByRole("button", { name: "取消准备导出", exact: true }).click();
  } finally { release(); if (handlerStarted) await routeFinished; }
  if (upstreamFailure) throw upstreamFailure;
  await expect(page.getByText("已取消准备导出；记录草稿和检索条件保持原样。", { exact: true })).toBeVisible(); await expect(page.getByRole("button", { name: "导出整个检索结果", exact: true })).toBeEnabled();
  await expect(page.getByLabel("新记录内容", { exact: true })).toHaveValue("取消时草稿内容"); expect(new URL(page.url()).searchParams.get("q")).toBe(key); expect(downloads).toHaveLength(0); expect(await facts()).toEqual(before);
  await page.screenshot({ path: info.outputPath("cancel-preparation-keeps-draft.png"), fullPage: true });
});

test("真实ZIP响应摘要被破坏时拒绝下载，错误可重试且不会保存编辑草稿", async ({ page }, info) => {
  const key = crypto.randomUUID(), { point } = await fixture(`摘要验证-${key}`, "原已保存正文"); await openDetail(page, point.id); await page.getByLabel("修订记录内容", { exact: true }).fill("未保存草稿");
  const before = await facts(), downloads: Download[] = []; page.on("download", d => downloads.push(d)); let corrupt = true;
  await page.route(`**${endpoint}`, async route => { if (!corrupt) return route.continue(); const response = await route.fetch(); expect(response.status()).toBe(200); return route.fulfill({ response, headers: { ...response.headers(), "x-englishnode-export-sha256": "0".repeat(64) } }); });
  await page.getByRole("button", { name: "导出这条已保存记录", exact: true }).click(); await expect(page.getByRole("region", { name: "个人记录导出", exact: true }).getByRole("alert")).toContainText("摘要"); expect(downloads).toHaveLength(0);
  corrupt = false; const result = await downloadArchive(page, info, "digest-retry", true); expect(result.manifest.records[0].revisions[0].body).toBe("原已保存正文"); await expect(page.getByLabel("修订记录内容", { exact: true })).toHaveValue("未保存草稿"); expect(await facts()).toEqual(before);
});

test("失效范围和畸形请求明确失败，不回退全库；合法空范围下载真实零记录包", async ({ request, page }, info) => {
  const key = crypto.randomUUID(), before = await facts();
  const malformed = await request.post(endpoint, { data: { ...view(key), offset: 0 } }); expect(malformed.status()).toBe(400);
  const missing = await request.post(endpoint, { data: { scope: { mode: "record", pointId: key }, includeHistory: true } }); expect(missing.status()).toBe(404);
  for (const scopeField of ["domainId", "collectionId"] as const) {
    const input = view(key); if (input.scope.mode !== "view") throw new Error("Expected view scope."); input.scope.filters[scopeField] = key;
    const unavailable = await request.post(endpoint, { data: input }); expect(unavailable.status()).toBe(409); expect(unavailable.headers()["content-type"]).toContain("application/json");
  }
  await openList(page, new URLSearchParams({ q: key })); const empty = await downloadArchive(page, info, "valid-empty-scope"); expect(empty.manifest.records).toEqual([]); expect(empty.manifest.orderedRecordIds).toEqual([]); expect(empty.entries.map(x => x.name).sort()).toEqual(["README.md", "manifest.json"]);
  const response = await request.post(endpoint, { data: view(key) }); expect(response.status()).toBe(200); const apiFile = info.outputPath("empty-api.zip"); await writeFile(apiFile, await response.body()); expect((await inspect(apiFile)).manifest.records).toEqual([]); expect(await facts()).toEqual(before);
});
