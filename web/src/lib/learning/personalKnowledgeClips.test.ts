import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import nodeProcess from "node:process";
import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { previewRecordClip, resolveRecordClipSource } from "./recordClipService";
import { isRecordClipSnapshot, type RecordClipPreview } from "./recordClipContracts";
import { createPersonalKnowledge, getPersonalKnowledge, listPersonalKnowledge, revisePersonalKnowledge } from "./personalKnowledgeService";
import { getPersonalKnowledgeContext } from "./personalKnowledgeDiscovery";
import { digest } from "./teachingSources";
import { POST as postPreview } from "../../app/api/knowledge-points/clip-preview/route";
import { POST as postRecord } from "../../app/api/knowledge-points/route";
import { PATCH as patchRecord } from "../../app/api/knowledge-points/[pointId]/route";

const deps = vi.hoisted(() => ({ db: null as PrismaClient | null, ai: vi.fn(), fetch: vi.fn() }));
vi.mock("../prisma", () => ({ get prisma() { return deps.db!; } }));
vi.mock("../ai/tutorService", () => ({ runJsonTask: deps.ai }));
vi.mock("../security/recordClipPublicHtml", async original => ({ ...await original<typeof import("../security/recordClipPublicHtml")>(), fetchRecordClipPublicHtml: deps.fetch }));
const processState = nodeProcess as typeof nodeProcess & { [key: symbol]: unknown };
const clearStore = () => { delete processState[Symbol.for("englishnode.recordClipStore.v1")]; };
const capture = () => ({ requestedUrl: "https://example.com/requested", finalUrl: "https://example.com/final", title: "服务器标题", text: "第一段原文。\r\n\r\n第二段原文。\n\n重复原文。", capturedAt: new Date().toISOString(), truncated: false, limitations: ["只提取公开HTML的可读文字，内容未核实。"] });
const pasted = (text = "第一段原文。\r\n\r\n第二段原文。\n\n重复原文。") => previewRecordClip({ mode: "pasted", title: "本人选文", text, url: "https://example.com/declared" });
const source = (preview: RecordClipPreview, fragmentIds = [preview.fragments[0].id]) => ({ kind: "clip", snapshotKey: preview.snapshotKey, receiptId: preview.receiptId, fragmentIds });
const request = (value: unknown, method = "POST") => new Request("http://localhost/api/knowledge-points", { method, body: JSON.stringify(value) });
const input = (requestId: string, sources: unknown[] = [], extra: Record<string, unknown> = {}) => ({ requestId, title: "个人剪藏", body: "自己整理的正文。", kind: "excerpt", sourceType: "excerpt", sources, ...extra });
const context = (pointId: string) => ({ params: Promise.resolve({ pointId }) });

describe("剪藏接原writer：真实隔离SQLite与正式HTTP", { timeout: 30000 }, () => {
  let directory: string, filename: string, db: PrismaClient;
  const connect = () => { db = new PrismaClient({ datasources: { db: { url: `file:${filename.replace(/\\/g, "/")}` } } }); deps.db = db; };
  beforeAll(() => { directory = fs.mkdtempSync(path.join(os.tmpdir(), "englishnode-clips-")); filename = path.join(directory, "isolated.db"); fs.copyFileSync(path.resolve("prisma/seed.db"), filename); connect(); });
  beforeEach(async () => {
    clearStore(); deps.fetch.mockReset(); deps.ai.mockReset();
    await db.knowledgeGraphEdge.deleteMany(); await db.knowledgeGraphMembership.deleteMany(); await db.knowledgeGraphNode.deleteMany(); await db.knowledgePoint.updateMany({ data: { currentRevisionId: null } }); await db.knowledgePoint.deleteMany(); await db.learningProgress.deleteMany(); await db.nodeTeachingSession.deleteMany(); await db.learningNode.deleteMany(); await db.domain.deleteMany();
  });
  afterEach(() => { clearStore(); vi.useRealTimers(); });
  afterAll(async () => { await db?.$disconnect(); if (directory && path.dirname(directory) === path.resolve(os.tmpdir())) fs.rmSync(directory, { recursive: true, force: true }); });
  const facts = async () => ({ records: await db.knowledgePoint.count(), revisions: await db.knowledgePointRevision.count(), audit: await db.learningProgress.count(), relations: await db.knowledgeGraphEdge.count(), sessions: await db.nodeTeachingSession.count(), sources: await db.teachingSource.count(), ai: await db.aiCallLog.count() });
  const create = async (requestId: string, preview: RecordClipPreview, extra: Record<string, unknown> = {}) => createPersonalKnowledge(input(requestId, [source(preview)], extra));

  it("正式preview路由无数据库/学习/AI写入，原文保持CRLF且不要求假会话", async () => {
    const before = await facts(), response = await postPreview(request({ mode: "pasted", title: "手工选文", text: "A\r\n\r\nB\rC" })); expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const { preview } = await response.json(); expect(preview.text).toBe("A\r\n\r\nB\rC"); expect(preview.obtained).toBe(false); expect(await facts()).toEqual(before); expect(deps.ai).not.toHaveBeenCalled();
  });

  it("跨preview/create两正式route保存所选服务器片段，去receipt/全文，原hash不增加分支", async () => {
    const response = await postPreview(request({ mode: "pasted", title: "选文", text: "首段\n\n中段\n\n末段" })), { preview } = await response.json();
    const descriptor = source(preview, [preview.fragments[0].id, preview.fragments[2].id]), body = input("route-create", [descriptor]);
    const saved = await postRecord(request(body)); expect(saved.status).toBe(200); const result = await saved.json(); expect(result.reused).toBe(false); expect(result.savedRevisionId).toBe(result.knowledgePoint.currentRevisionId);
    const snapshot = result.knowledgePoint.sources[0]; expect(snapshot.fragments.map((f: { text: string }) => f.text)).toEqual(["首段", "末段"]); expect(snapshot).not.toHaveProperty("text"); expect(snapshot).not.toHaveProperty("receiptId"); expect(snapshot).not.toHaveProperty("expiresAt");
    const audit = await db.learningProgress.findUniqueOrThrow({ where: { id: `record-save:${digest(body.requestId)}` } });
    expect(JSON.parse(audit.payloadJson).inputHash).toBe(digest({ title: body.title, body: body.body, kind: body.kind, sourceType: body.sourceType, domainId: null, nodeIds: [], domainIds: [], sessionId: null, sources: [descriptor] }));
    expect(await facts()).toEqual({ records: 1, revisions: 1, audit: 1, relations: 0, sessions: 0, sources: 0, ai: 0 });
  });

  it("web来源保存服务端重定向/标题/取得时间，客户端不能把手工选文变成obtained", async () => {
    deps.fetch.mockResolvedValueOnce(capture()); const { preview } = await previewRecordClip({ mode: "web", url: "https://example.com/requested" });
    const result = await create("web", preview); expect(result.knowledgePoint.sources[0]).toMatchObject({ obtained: true, requestedUrl: preview.requestedUrl, finalUrl: preview.finalUrl, title: "服务器标题", capturedAt: preview.capturedAt });
    expect((await postRecord(request(input("forged", [{ ...source(preview), obtained: false, title: "伪造" }])))).status).toBe(400); expect(await db.knowledgePoint.count()).toBe(1);
  });

  it("完整持久化snapshot不能冒充新source input，客户端正文/hash/metadata均拒绝", async () => {
    const { preview } = await pasted(), saved = await create("original", preview), snapshot = saved.knowledgePoint.sources[0], before = await facts();
    for (const forged of [snapshot, { ...source(preview), body: "假正文" }, { ...source(preview), capturedAt: preview.capturedAt }, { ...source(preview), contentHash: preview.contentHash }, { ...source(preview), text: preview.text }]) expect((await postRecord(request(input(crypto.randomUUID(), [forged])))).status).toBe(400);
    expect(await facts()).toEqual(before);
  });

  it("不匹配snapshot身份400，未知/丢失receipt410，失败不consume合法凭据", async () => {
    const a = (await pasted("原文A")).preview, b = (await pasted("原文B")).preview;
    for (const [descriptor, status] of [[{ ...source(a), snapshotKey: b.snapshotKey }, 400], [{ ...source(a), receiptId: "z".repeat(43) }, 410], [{ ...source(a), receiptId: "bad" }, 400]] as const) expect((await postRecord(request(input(crypto.randomUUID(), [descriptor])))).status).toBe(status);
    expect((await create("still-valid", a)).knowledgePoint.sources).toHaveLength(1);
  });

  it("片段重复/倒序/来自另一捕获/空选择均400且原文未被替换", async () => {
    const a = (await pasted()).preview, b = (await pasted("不同文本")).preview;
    for (const fragmentIds of [[], [a.fragments[0].id, a.fragments[0].id], [a.fragments[1].id, a.fragments[0].id], [b.fragments[0].id], ["clip-fragment-0-1-" + "0".repeat(64)]]) expect((await postRecord(request(input(crypto.randomUUID(), [{ ...source(a), fragmentIds }])))).status).toBe(400);
    expect(await db.knowledgePoint.count()).toBe(0); expect((await create("valid-selection", a)).knowledgePoint.sources[0]).toMatchObject({ fragments: [a.fragments[0]] });
  });

  it("首次写入时到期为410而非409，记录/修订/审计均无部分写入", async () => {
    const { preview } = await pasted(), before = await facts(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(preview.expiresAt));
    const failed = await postRecord(request(input("expired-new", [source(preview)]))); expect(failed.status).toBe(410); expect(await facts()).toEqual(before);
  });

  it("成功创建的精确旧命令过期后仍先查prior返回原记录，不重新解析receipt", async () => {
    const { preview } = await pasted(), body = input("expired-prior", [source(preview)]), first = await createPersonalKnowledge(body), before = await facts();
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(Date.parse(preview.expiresAt) + 1));
    const repeated = await postRecord(request(body)); expect(repeated.status).toBe(200); const result = await repeated.json(); expect(result.reused).toBe(true); expect(result.savedRevisionId).toBe(first.knowledgePoint.currentRevisionId); expect(result.knowledgePoint.id).toBe(first.knowledgePoint.id); expect(await facts()).toEqual(before);
  });

  it("进程store重置后旧创建prior仍能查结果，新命令则410", async () => {
    const { preview } = await pasted(), body = input("restart", [source(preview)]), first = await createPersonalKnowledge(body); clearStore();
    const repeated = await createPersonalKnowledge(body); expect(repeated.reused).toBe(true); expect(repeated.savedRevisionId).toBe(first.knowledgePoint.currentRevisionId);
    expect((await postRecord(request({ ...body, requestId: "new-after-restart" }))).status).toBe(410); expect(await db.knowledgePoint.count()).toBe(1);
  });

  it("创建重试区分original savedRevision和后续current，不把最新正文说成初次保存", async () => {
    const { preview } = await pasted(), body = input("original-version", [source(preview)]), first = await createPersonalKnowledge(body), old = await db.knowledgePointRevision.findUniqueOrThrow({ where: { id: first.savedRevisionId! } });
    const later = await revisePersonalKnowledge(first.knowledgePoint.id, { title: "后来标题", body: "后续正文", expectedRevisionId: first.savedRevisionId }); clearStore();
    const repeated = await createPersonalKnowledge(body); expect(repeated.reused).toBe(true); expect(repeated.savedRevisionId).toBe(old.id); expect(repeated.knowledgePoint.currentRevisionId).toBe(later.knowledgePoint.currentRevisionId); expect(repeated.knowledgePoint.body).toBe("后续正文"); expect(await db.knowledgePointRevision.findUnique({ where: { id: old.id } })).toEqual(old);
  });

  it("新捕获/新选择不可复用旧requestId绕过raw inputHash409，凭据仍可另存", async () => {
    const a = (await pasted()).preview, first = await create("same-id", a), b = (await pasted("另一捕获")).preview;
    expect((await postRecord(request(input("same-id", [source(b)])))).status).toBe(409);
    expect((await postRecord(request(input("same-id", [source(a, [a.fragments[1].id])])))).status).toBe(409);
    expect((await create("different-id", b)).knowledgePoint.id).not.toBe(first.knowledgePoint.id);
  });

  it("旧无clip创建响应/hash保持不变，不新增reused/savedRevisionId字段", async () => {
    const body = input("old-command"), first = await createPersonalKnowledge(body), again = await createPersonalKnowledge(body);
    expect(first).not.toHaveProperty("reused"); expect(first).not.toHaveProperty("savedRevisionId"); expect(again).toEqual(first);
  });

  it("临时store支持既有30source输入，上限31拒绝但不消费任何捕获", async () => {
    const previews: RecordClipPreview[] = []; for (let i = 0; i < 31; i++) previews.push((await pasted(`原文${i}`)).preview);
    expect((await postRecord(request(input("too-many", previews.map(preview => source(preview)))))).status).toBe(400);
    const good = await createPersonalKnowledge(input("thirty", previews.slice(0, 30).map(preview => source(preview)))); expect(good.knowledgePoint.sources).toHaveLength(30); expect(resolveRecordClipSource(source(previews[30])).fragments[0].text).toBe("原文30");
  });

  it("来源省略在过期后精确保留，别名/本人日期也不丢，旧行不可覆盖", async () => {
    const { preview } = await pasted(), first = await create("omit", preview, { aliases: ["别名"], recordDate: { date: "2026-03-08", timeZone: "US/Pacific" } }), old = await db.knowledgePointRevision.findUniqueOrThrow({ where: { id: first.savedRevisionId! } }); clearStore();
    const next = await revisePersonalKnowledge(first.knowledgePoint.id, { title: "新正文", body: "省略来源", expectedRevisionId: old.id }), raw = await db.knowledgePointRevision.findUniqueOrThrow({ where: { id: next.knowledgePoint.currentRevisionId! } });
    expect(raw.sourcesJson).toBe(old.sourcesJson); expect(raw.aliasesJson).toBe(old.aliasesJson); expect(raw.recordDate).toBe(old.recordDate); expect(raw.recordDateTimeZone).toBe(old.recordDateTimeZone); expect(await db.knowledgePointRevision.findUnique({ where: { id: old.id } })).toEqual(old);
  });

  it("retained复用大于64KB既有未知raw，再加clip只提交短descriptor，原快照原样保留", async () => {
    const point = await db.knowledgePoint.create({ data: { title: "旧来源" } }), sourcesJson = JSON.stringify([{ kind: "legacy-opaque", text: "x".repeat(70000), raw: { keep: true } }]);
    const old = await db.knowledgePointRevision.create({ data: { knowledgePointId: point.id, sequence: 1, title: "旧来源", body: "历史正文", sourceType: "user", sourcesJson } }); await db.knowledgePoint.update({ where: { id: point.id }, data: { currentRevisionId: old.id } });
    const { preview } = await pasted(), payload = { title: "新正文", body: "新正文", expectedRevisionId: old.id, sources: [{ kind: "retained", sourceIndex: 0 }, source(preview)] };
    expect(JSON.stringify(payload).length).toBeLessThan(64000); const response = await patchRecord(request(payload, "PATCH"), context(point.id)); expect(response.status).toBe(200); const result = await response.json(); expect(result.knowledgePoint.sources[0]).toEqual(JSON.parse(sourcesJson)[0]); expect(result.knowledgePoint.sources[1].kind).toBe("clip"); expect(await db.knowledgePointRevision.findUnique({ where: { id: old.id } })).toEqual(old);
  });

  it("精确既有clip snapshot兼容保留，但伪改标题/原文不能跳过新来源校验", async () => {
    const { preview } = await pasted(), first = await create("exact-old", preview), old = first.knowledgePoint.sources[0] as unknown; clearStore();
    if (!isRecordClipSnapshot(old)) throw new Error("fixture did not save a valid clip snapshot");
    const kept = await revisePersonalKnowledge(first.knowledgePoint.id, { title: "精确保留", body: "不改来源", expectedRevisionId: first.savedRevisionId, sources: [old] });
    expect(kept.knowledgePoint.sources[0]).toEqual(old); const before = await facts();
    expect((await patchRecord(request({ title: "伪造", body: "伪造", expectedRevisionId: kept.knowledgePoint.currentRevisionId, sources: [{ ...old, title: "假标题" }] }, "PATCH"), context(first.knowledgePoint.id))).status).toBe(400); expect(await facts()).toEqual(before);
  });

  it("修订CAS409保留新clip可重试，失败不部分写入来源或指针", async () => {
    const a = (await pasted("原来源")).preview, first = await create("cas", a), updated = await revisePersonalKnowledge(first.knowledgePoint.id, { title: "先保存", body: "先保存", expectedRevisionId: first.savedRevisionId }), b = (await pasted("待合并来源")).preview, before = await facts();
    const payload = { title: "本地修改", body: "保留本地", expectedRevisionId: first.savedRevisionId, sources: [{ kind: "retained", sourceIndex: 0 }, source(b)] };
    expect((await patchRecord(request(payload, "PATCH"), context(first.knowledgePoint.id))).status).toBe(409); expect(await facts()).toEqual(before);
    const result = await revisePersonalKnowledge(first.knowledgePoint.id, { ...payload, expectedRevisionId: updated.knowledgePoint.currentRevisionId }); expect(result.knowledgePoint.sources).toHaveLength(2);
  });

  it("create/revise后段关联失败均回滚，未consume的receipt仍能明确保存", async () => {
    const { preview } = await pasted(), before = await facts();
    await expect(create("bad-reference", preview, { nodeIds: ["missing"] })).rejects.toMatchObject({ status: 400 }); expect(await facts()).toEqual(before);
    const saved = await create("good-reference", preview), checkpoint = await facts();
    await expect(revisePersonalKnowledge(saved.knowledgePoint.id, { title: "关联失败", body: "关联失败", expectedRevisionId: saved.savedRevisionId, sources: [source(preview)], nodeIds: ["missing"] })).rejects.toMatchObject({ status: 400 }); expect(await facts()).toEqual(checkpoint);
    expect((await revisePersonalKnowledge(saved.knowledgePoint.id, { title: "恢复保存", body: "恢复保存", expectedRevisionId: saved.savedRevisionId, sources: [source(preview)] })).knowledgePoint.sources).toHaveLength(1);
  });

  it("clip不是backlink/正式关系，来源分类仍excerpt，历史离线重开不依赖临时store", async () => {
    const target = await createPersonalKnowledge(input("target", [], { sourceType: "user", kind: "note" })), { preview } = await pasted(`提到${target.knowledgePoint.title}的外部文字。`), saved = await create("excerpt-filter", preview), old = await db.knowledgePointRevision.findUniqueOrThrow({ where: { id: saved.savedRevisionId! } }); clearStore(); await db.$disconnect(); connect();
    expect((await getPersonalKnowledgeContext(target.knowledgePoint.id)).backlinks.page.total).toBe(0); expect((await listPersonalKnowledge("", undefined, { sourceType: "excerpt" })).knowledgePoints.map(row => row.id)).toEqual([saved.knowledgePoint.id]);
    const reopened = await getPersonalKnowledge(saved.knowledgePoint.id); expect(reopened.knowledgePoint.sources[0]).toEqual(saved.knowledgePoint.sources[0]); expect(reopened.revisions[0].sources[0]).toEqual(saved.knowledgePoint.sources[0]); expect(await db.knowledgePointRevision.findUnique({ where: { id: old.id } })).toEqual(old); expect(await db.knowledgeGraphEdge.count()).toBe(0); expect(deps.ai).not.toHaveBeenCalled();
  });

  it("预览/原写入口保留64000 HTTP门与非法JSON400，不因剪藏增加绕过路径", async () => {
    const payload = JSON.stringify({ mode: "pasted", text: "有效选文" }), before = await facts();
    const at = " ".repeat(64000 - payload.length) + payload; expect((await postPreview(new Request("http://localhost/api/knowledge-points/clip-preview", { method: "POST", body: at }))).status).toBe(200);
    expect((await postPreview(new Request("http://localhost/api/knowledge-points/clip-preview", { method: "POST", body: " " + at }))).status).toBe(413);
    const invalid = await postPreview(new Request("http://localhost/api/knowledge-points/clip-preview", { method: "POST", body: "{" })); expect(invalid.status).toBe(400); expect(invalid.headers.get("Cache-Control")).toBe("no-store");
    expect((await postRecord(new Request("http://localhost/api/knowledge-points", { method: "POST", body: "x".repeat(64001) }))).status).toBe(413); expect(await facts()).toEqual(before);
  });
});
