import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createPersonalKnowledge, getPersonalKnowledge, listPersonalKnowledge, revisePersonalKnowledge } from "./personalKnowledgeService";
import { getPersonalKnowledgeMentions } from "./personalKnowledgeDiscovery";
import { digest } from "./teachingSources";
import { GET as getRecords, POST as postRecord } from "../../app/api/knowledge-points/route";
import { PATCH as patchRecord } from "../../app/api/knowledge-points/[pointId]/route";
import { GET as getMentions } from "../../app/api/knowledge-points/[pointId]/mentions/route";

const deps = vi.hoisted(() => ({ db: null as PrismaClient | null, ai: vi.fn() }));
vi.mock("../prisma", () => ({ get prisma() { return deps.db!; } }));
vi.mock("../ai/tutorService", () => ({ runJsonTask: deps.ai }));
let directory: string, db: PrismaClient;
beforeAll(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "englishnode-record-names-"));
  const filename = path.join(directory, "isolated.db");
  fs.copyFileSync(path.resolve("prisma/seed.db"), filename);
  db = new PrismaClient({ datasources: { db: { url: `file:${filename.replace(/\\/g, "/")}` } } });
  deps.db = db;
});
afterAll(async () => {
  await db?.$disconnect();
  if (directory && path.dirname(directory) === path.resolve(os.tmpdir())) fs.rmSync(directory, { recursive: true, force: true });
});
beforeEach(async () => {
  await db.knowledgeGraphEdge.deleteMany(); await db.knowledgeGraphMembership.deleteMany(); await db.knowledgeGraphNode.deleteMany();
  await db.knowledgePoint.updateMany({ data: { currentRevisionId: null } }); await db.knowledgePoint.deleteMany();
  await db.learningProgress.deleteMany(); await db.nodeTeachingSession.deleteMany(); await db.learningNode.deleteMany(); await db.domain.deleteMany();
  deps.ai.mockReset();
});
type FixturePoint = { id: string; title?: string; body?: string; aliases?: string[]; kind?: string; domainId?: string };
async function points(rows: FixturePoint[]) {
  await db.$transaction(async tx => {
    await tx.knowledgePoint.createMany({ data: rows.map(row => ({ id: row.id, title: "退役镜像标题", recordKind: row.kind || "note", domainId: row.domainId, updatedAt: new Date("2026-01-01T00:00:00Z") })) });
    await tx.knowledgePointRevision.createMany({ data: rows.map(row => ({ id: `${row.id}-v1`, knowledgePointId: row.id, sequence: 1, title: row.title || row.id, body: row.body || "记录正文", aliasesJson: JSON.stringify(row.aliases || []), sourceType: "user" })) });
    await tx.$executeRaw(Prisma.sql`UPDATE KnowledgePoint SET currentRevisionId = id || '-v1' WHERE id IN (${Prisma.join(rows.map(row => row.id))})`);
  });
}
const request = (method: string, value: unknown) => new Request("http://localhost/api/knowledge-points", { method, body: JSON.stringify(value) });
const context = (pointId: string) => ({ params: Promise.resolve({ pointId }) });
const create = (requestId: string, extra: Record<string, unknown> = {}) => createPersonalKnowledge({ requestId, title: "当前标题", body: "当前理解", kind: "note", ...extra });

describe("别名和未引用提及：真实隔离 SQLite 与正式 HTTP 合同", { timeout: 30000 }, () => {
  it("创建/修订的别名独立归属各历史版本，省略原样保留期望当前值而显式空数组清空", async () => {
    const saved = await create("names", { aliases: ["  条件概率 ", "conditional probability", "ＣＯＮＤＩＴＩＯＮＡＬ ＰＲＯＢＡＢＩＬＩＴＹ", "条件概率"] });
    expect(saved.knowledgePoint.aliases).toEqual(["条件概率", "conditional probability"]);
    const id = saved.knowledgePoint.id, originalId = saved.knowledgePoint.currentRevisionId!;
    const rawAliases = '[ "条件概率", "conditional probability" ]';
    await db.knowledgePointRevision.update({ where: { id: originalId }, data: { aliasesJson: rawAliases } });
    await db.knowledgePointRevision.create({ data: { knowledgePointId: id, sequence: 2, title: "非当前历史标题", body: "非当前正文", aliasesJson: '["不能继承"]', sourceType: "user" } });
    const kept = await revisePersonalKnowledge(id, { expectedRevisionId: originalId, title: "改后的标题", body: "改后的正文", kind: "note" });
    expect(kept.knowledgePoint.aliases).toEqual(["条件概率", "conditional probability"]);
    expect((await db.knowledgePointRevision.findUniqueOrThrow({ where: { id: kept.knowledgePoint.currentRevisionId! } })).aliasesJson).toBe(rawAliases);
    const cleared = await revisePersonalKnowledge(id, { expectedRevisionId: kept.knowledgePoint.currentRevisionId, title: "清空后标题", body: "仍保留理解", kind: "note", aliases: [] });
    expect(cleared.knowledgePoint.aliases).toEqual([]);
    const history = await getPersonalKnowledge(id);
    expect(history.revisions.find(row => row.id === originalId)?.aliases).toEqual(["条件概率", "conditional probability"]);
    expect(history.revisions.find(row => row.sequence === 2)?.aliases).toEqual(["不能继承"]);
    expect((await listPersonalKnowledge("不能继承")).knowledgePoints).toEqual([]);
  });

  it("旧无别名创建请求的幂等哈希兼容，非空别名变化仍拒绝同号重用", async () => {
    await points([{ id: "historical-save", title: "当前标题", body: "当前理解" }]);
    const requestId = "legacy-idempotency", inputHash = digest({ title: "当前标题", body: "当前理解", kind: "note", sourceType: "user", domainId: null, nodeIds: [], domainIds: [], sessionId: null, sources: [] });
    await db.learningProgress.create({ data: { id: `record-save:${digest(requestId)}`, status: "record_saved", payloadJson: JSON.stringify({ inputHash, knowledgePointId: "historical-save" }) } });
    expect((await create(requestId)).knowledgePoint.id).toBe("historical-save");
    expect((await create(requestId, { aliases: [] })).knowledgePoint.id).toBe("historical-save");
    await expect(create(requestId, { aliases: ["新别名"] })).rejects.toThrow("另一份内容");
    const named = await create("named-idempotency", { aliases: ["AI", "ＡＩ"] });
    expect((await create("named-idempotency", { aliases: ["AI"] })).knowledgePoint.id).toBe(named.knowledgePoint.id);
    expect(await db.knowledgePoint.count()).toBe(2);
  });

  it("无效别名HTTP返回400、旧修订冲突409，均不部分保存或改写固定引用快照", async () => {
    const source = await create("source", { aliases: ["原别名"] });
    const saved = await create("reader", { sources: [{ kind: "record", knowledgePointId: source.knowledgePoint.id, revisionId: source.knowledgePoint.currentRevisionId }] });
    const originalSources = saved.knowledgePoint.sources;
    const invalid: unknown[] = [null, "AI", [5], [""], ["AI\nB"], ["x\0y"], ["\ud800"], ["x".repeat(81)], Array.from({ length: 21 }, (_, i) => `name-${i}`)];
    const before = { records: await db.knowledgePoint.count(), revisions: await db.knowledgePointRevision.count(), audit: await db.learningProgress.count() };
    for (const aliases of invalid) {
      expect((await postRecord(request("POST", { requestId: crypto.randomUUID(), title: "无效别名", body: "不应保存", aliases }))).status).toBe(400);
      const revisionResponse = await patchRecord(request("PATCH", { expectedRevisionId: saved.knowledgePoint.currentRevisionId, title: "无效修订", body: "不应保存", aliases }), context(saved.knowledgePoint.id));
      expect(revisionResponse.status).toBe(400);
    }
    expect(await db.knowledgePoint.count()).toBe(before.records); expect(await db.knowledgePointRevision.count()).toBe(before.revisions); expect(await db.learningProgress.count()).toBe(before.audit);
    const moved = await revisePersonalKnowledge(source.knowledgePoint.id, { expectedRevisionId: source.knowledgePoint.currentRevisionId, title: "当前标题", body: "新理解", aliases: ["后来的名称"] });
    expect((await patchRecord(request("PATCH", { expectedRevisionId: source.knowledgePoint.currentRevisionId, title: "旧写入", body: "不应覆盖", aliases: [] }), context(source.knowledgePoint.id))).status).toBe(409);
    expect((await getPersonalKnowledge(source.knowledgePoint.id)).knowledgePoint.aliases).toEqual(moved.knowledgePoint.aliases);
    expect((await getPersonalKnowledge(saved.knowledgePoint.id)).knowledgePoint.sources).toEqual(originalSources);
  });

  it("搜索以同一字面Unicode规则匹配当前别名标题正文，不泄漏历史、镜像或来源文本", async () => {
    await points([{ id: "alias", title: "名称甲", aliases: ["Äpfel", "SQL_100%", "ＡＩ"] }, { id: "plain", title: "普通标题", body: "当前正文" }, { id: "body", title: "正文来源", body: "literal% marker_ and ÄPFEL" }]);
    await db.knowledgePointRevision.create({ data: { knowledgePointId: "plain", sequence: 2, title: "history-only", body: "history-only", aliasesJson: '["history-only"]', sourceType: "user" } });
    await db.knowledgePointRevision.update({ where: { id: "plain-v1" }, data: { sourcesJson: JSON.stringify([{ kind: "external", quote: "snapshot-only" }]) } });
    const aliases = await getRecords(new Request("http://localhost/api/knowledge-points?q=%C3%A4PFEL"));
    expect(aliases.status).toBe(200);
    const found = (await aliases.json()).knowledgePoints;
    expect(found.map((row: { id: string }) => row.id).sort()).toEqual(["alias", "body"]);
    expect(found.find((row: { id: string }) => row.id === "alias").matchedAliases).toEqual(["Äpfel"]);
    expect((await listPersonalKnowledge("ai")).knowledgePoints.map(row => row.id)).toEqual(["alias"]);
    expect((await listPersonalKnowledge("%")).knowledgePoints.map(row => row.id).sort()).toEqual(["alias", "body"]);
    expect((await listPersonalKnowledge("_")).knowledgePoints.map(row => row.id).sort()).toEqual(["alias", "body"]);
    for (const query of ["history-only", "退役镜像标题", "snapshot-only"]) expect((await listPersonalKnowledge(query)).knowledgePoints).toEqual([]);
    await db.knowledgePoint.create({ data: { id: "legacy-body", title: "旧标题", userUnderstanding: "legacy-body-text" } });
    expect((await listPersonalKnowledge("legacy-body-text")).knowledgePoints.map(row => row.id)).toEqual(["legacy-body"]);
  });

  it("完整扫描跨越128条批次，领域/类型/主题过滤与匹配先于准确总数和尾页", async () => {
    await db.domain.createMany({ data: [{ id: "d1", name: "域一" }, { id: "d2", name: "域二" }] });
    await points(Array.from({ length: 270 }, (_, i) => ({ id: `page-${String(i).padStart(3, "0")}`, title: `Row ${i}`, aliases: [i === 0 || i === 269 ? "needle" : "other"], kind: "question", domainId: "d1" })));
    await points([{ id: "wrong-kind", aliases: ["needle"], kind: "note", domainId: "d1" }, { id: "outside-domain", aliases: ["needle"], kind: "question", domainId: "d2" }]);
    const first = await listPersonalKnowledge("needle", "d1", { kind: "question", limit: 1 });
    const last = await listPersonalKnowledge("needle", "d1", { kind: "question", limit: 1, offset: first.page.nextOffset });
    expect(first.page.total).toBe(2); expect(last.page.nextOffset).toBeNull();
    expect([...first.knowledgePoints, ...last.knowledgePoints].map(row => row.id)).toEqual(["page-000", "page-269"]);
    const topic = await db.knowledgeGraphNode.create({ data: { title: "主题", nodeType: "topic" } });
    await db.knowledgeGraphMembership.createMany({ data: ["page-000", "page-269", "wrong-kind"].map(knowledgePointId => ({ groupNodeId: topic.id, knowledgePointId })) });
    const collection = await listPersonalKnowledge("needle", "d1", { kind: "question", collectionId: topic.id, sort: "title_asc", limit: 1, offset: 1 });
    expect(collection.page.total).toBe(2); expect(collection.knowledgePoints[0].id).toBe("page-269");
    const pastEnd = await listPersonalKnowledge("needle", "d1", { kind: "question", offset: 2 });
    expect(pastEnd.knowledgePoints).toEqual([]); expect(pastEnd.page.total).toBe(2); expect(pastEnd.page.nextOffset).toBeNull();
  });

  it("JS搜索排序与实际目标SQLite NOCASE/UTF8和ID tie保持一致，包含NUL与非BMP", async () => {
    const titles = ["a", "A", "é", "\ue000", "Ａ", "😀", "a\0x", "A\0y", "a\0", "a\0xx"];
    await points(titles.map((title, i) => ({ id: `${["😀", "Ａ", "\ue000", "A", "a"][i % 5]}-${i}`, title, aliases: ["needle"] })));
    const expected = await db.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT p.id FROM KnowledgePoint p JOIN KnowledgePointRevision r ON r.id = p.currentRevisionId ORDER BY r.title COLLATE NOCASE ASC, p.id ASC`);
    const searched = await listPersonalKnowledge("needle", undefined, { sort: "title_asc" });
    const fast = await listPersonalKnowledge("", undefined, { sort: "title_asc" });
    expect(searched.knowledgePoints.map(row => row.id)).toEqual(expected.map(row => row.id));
    expect(fast.knowledgePoints.map(row => row.id)).toEqual(expected.map(row => row.id));
    const updated = await db.$queryRaw<{ id: string }[]>(Prisma.sql`SELECT id FROM KnowledgePoint ORDER BY updatedAt DESC, id ASC`);
    expect((await listPersonalKnowledge("needle")).knowledgePoints.map(row => row.id)).toEqual(updated.map(row => row.id));
  });

  it("提及仅扫其他当前正文且排除有效引用；历史/快照/旧记录与词内子串都不生成候选", async () => {
    const target = await create("mention-target", { title: "目标概念", aliases: ["AI", "条件概率", "概率"] });
    const body = "没有命中。\r\n \r\n  中文AI紧邻，讨论条件概率。  \r\n第三行仍在同段。\r\n\r\n末段";
    await points([{ id: "actual-mention", title: "原文来源", body }, { id: "word-parts", body: "TRAIN contains AIs and partial" }, { id: "old-body", body: "以前讨论AI" }, { id: "snapshot-body", body: "当前正文没有名称" }]);
    const changed = await db.knowledgePointRevision.create({ data: { knowledgePointId: "old-body", sequence: 2, title: "新正文", body: "已改为别的问题", sourceType: "user" } });
    await db.knowledgePoint.update({ where: { id: "old-body" }, data: { currentRevisionId: changed.id } });
    await db.knowledgePointRevision.update({ where: { id: "snapshot-body-v1" }, data: { sourcesJson: JSON.stringify([{ kind: "external", quote: "AI 条件概率" }]) } });
    await db.knowledgePoint.create({ data: { id: "legacy-only", title: "旧记录", userUnderstanding: "AI" } });
    await create("already-linked", { body: "这里讨论AI", sources: [{ kind: "record", knowledgePointId: target.knowledgePoint.id, revisionId: target.knowledgePoint.currentRevisionId }] });
    const counts = { records: await db.knowledgePoint.count(), revisions: await db.knowledgePointRevision.count(), audit: await db.learningProgress.count() };
    const response = await getMentions(new Request("http://localhost/api/mentions?limit=1"), context(target.knowledgePoint.id));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.target.names).toEqual(["目标概念", "AI", "条件概率", "概率"]);
    expect(result.mentions.page.total).toBe(1); expect(result.mentions.items[0].id).toBe("actual-mention");
    expect(result.mentions.items[0].matchedNames).toEqual(["AI", "条件概率", "概率"]);
    const paragraph = "  中文AI紧邻，讨论条件概率。  \r\n第三行仍在同段。";
    expect(result.mentions.items[0].context).toEqual({ start: body.indexOf(paragraph), end: body.indexOf(paragraph) + paragraph.length, quote: paragraph });
    expect(await db.knowledgePoint.count()).toBe(counts.records); expect(await db.knowledgePointRevision.count()).toBe(counts.revisions); expect(await db.learningProgress.count()).toBe(counts.audit);
    expect(await db.knowledgeGraphEdge.count()).toBe(0); expect(await db.nodeTeachingSession.count()).toBe(0); expect(deps.ai).not.toHaveBeenCalled();
  });

  it("同名目标各自独立，别名改变即时重算候选，旧修订和固定引用不被改写", async () => {
    const first = await create("same-name-a", { title: "第一目标", aliases: ["AI"] });
    const second = await create("same-name-b", { title: "AI" });
    await points([{ id: "shared-text", body: "这里提到AI。" }]);
    const linked = await create("linked-only-a", { body: "也提到AI。", sources: [{ kind: "record", knowledgePointId: first.knowledgePoint.id, revisionId: first.knowledgePoint.currentRevisionId }] });
    expect((await getPersonalKnowledgeMentions(first.knowledgePoint.id)).mentions.items.map(row => row.id)).toEqual(["shared-text"]);
    expect((await getPersonalKnowledgeMentions(second.knowledgePoint.id)).mentions.items.map(row => row.id).sort()).toEqual([linked.knowledgePoint.id, "shared-text"].sort());
    await revisePersonalKnowledge(first.knowledgePoint.id, { expectedRevisionId: first.knowledgePoint.currentRevisionId, title: "第一目标", body: "当前解释", aliases: ["新名称"] });
    expect((await getPersonalKnowledgeMentions(first.knowledgePoint.id)).mentions.page.total).toBe(0);
    expect((await getPersonalKnowledge(linked.knowledgePoint.id)).knowledgePoint.sources).toEqual(linked.knowledgePoint.sources);
    expect((await getPersonalKnowledge(first.knowledgePoint.id)).revisions.find(row => row.id === first.knowledgePoint.currentRevisionId)?.aliases).toEqual(["AI"]);
  });

  it("未引用提及完整跨批计数分页，坏快照不伪装为已经引用", async () => {
    await points([{ id: "target", title: "UniqueName" }, ...Array.from({ length: 270 }, (_, i) => ({ id: `source-${String(i).padStart(3, "0")}`, body: i === 0 || i === 269 ? "实际提到UniqueName。" : "没有提到这个名称。" }))]);
    await db.knowledgePointRevision.update({ where: { id: "source-269-v1" }, data: { sourcesJson: JSON.stringify([{ kind: "record", knowledgePointId: "target", revisionId: "target-v1", title: "target", body: "引用", sourceType: "user", selector: null }]) } });
    const first = await getPersonalKnowledgeMentions("target", { limit: 1 }), last = await getPersonalKnowledgeMentions("target", { limit: 1, offset: 1 });
    expect(first.mentions.page.total).toBe(2);
    expect([...first.mentions.items, ...last.mentions.items].map(row => row.id)).toEqual(["source-000", "source-269"]);
    expect(last.mentions.page.nextOffset).toBeNull();
    expect((await getPersonalKnowledgeMentions("target", { offset: 2 })).mentions.items).toEqual([]);
  });

  it("无当前修订给出不可用原因，缺失目标404和非法分页400，不制造修订", async () => {
    await db.knowledgePoint.create({ data: { id: "unrevised", title: "旧标题" } });
    const response = await getMentions(new Request("http://localhost/api/mentions"), context("unrevised"));
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.target.revisionId).toBeNull(); expect(result.target.names).toEqual([]); expect(result.mentions.page.total).toBe(0); expect(result.unavailableReason).toBeTruthy();
    expect((await getMentions(new Request("http://localhost/api/mentions"), context("missing"))).status).toBe(404);
    expect((await getMentions(new Request("http://localhost/api/mentions?limit=0"), context("unrevised"))).status).toBe(400);
    expect((await getMentions(new Request("http://localhost/api/mentions?offset=-1"), context("unrevised"))).status).toBe(400);
    expect(await db.knowledgePointRevision.count()).toBe(0); expect(deps.ai).not.toHaveBeenCalled();
  });
});
