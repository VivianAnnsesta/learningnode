import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getPersonalKnowledgeContext, getPersonalKnowledgeNeighborhood } from "./personalKnowledgeDiscovery";
import { createPersonalKnowledge, listPersonalKnowledge, revisePersonalKnowledge } from "./personalKnowledgeService";
import { exposureKey } from "./flexibleTeaching";
import { GET as getContextRoute } from "../../app/api/knowledge-points/[pointId]/context/route";
import { GET as getNeighborhoodRoute } from "../../app/api/knowledge-points/[pointId]/neighborhood/route";
import { GET as getListRoute, POST as postRecordRoute } from "../../app/api/knowledge-points/route";
import { PATCH as patchRecordRoute } from "../../app/api/knowledge-points/[pointId]/route";
import type { ParagraphSelector } from "./recordReferences";

const deps = vi.hoisted(() => ({ db: null as PrismaClient | null, ai: vi.fn() }));
vi.mock("../prisma", () => ({ get prisma() { return deps.db!; } }));
vi.mock("../ai/tutorService", () => ({ runJsonTask: deps.ai }));
let temporaryRoot: string, db: PrismaClient;
beforeAll(async () => {
  temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "englishnode-knowledge-discovery-"));
  const filename = path.join(temporaryRoot, "isolated.db");
  fs.copyFileSync(path.resolve("prisma/seed.db"), filename);
  db = new PrismaClient({ datasources: { db: { url: `file:${filename.replace(/\\/g, "/")}` } } });
  deps.db = db;
});
afterAll(async () => {
  await db?.$disconnect();
  if (temporaryRoot && path.dirname(temporaryRoot) === path.resolve(os.tmpdir())) fs.rmSync(temporaryRoot, { recursive: true, force: true });
});
beforeEach(async () => {
  await db.knowledgeGraphEdge.deleteMany();
  await db.knowledgeGraphMembership.deleteMany();
  await db.knowledgeGraphNode.deleteMany();
  await db.knowledgePoint.updateMany({ data: { currentRevisionId: null } });
  await db.knowledgePoint.deleteMany();
  await db.learningProgress.deleteMany();
  await db.nodeTeachingSession.deleteMany();
  await db.learningNode.deleteMany();
  await db.domain.deleteMany();
  deps.ai.mockReset();
});

async function point(id: string, options: { title?: string; body?: string; sources?: unknown; kind?: string; domainId?: string; legacy?: boolean } = {}) {
  await db.knowledgePoint.create({ data: { id, title: options.title || id, recordKind: options.kind || "note", domainId: options.domainId } });
  if (!options.legacy) {
    const revision = await db.knowledgePointRevision.create({ data: { id: `${id}-v1`, knowledgePointId: id, sequence: 1, title: options.title || id, body: options.body || `${id} 正文`, sourceType: "user", sourcesJson: typeof options.sources === "string" ? options.sources : JSON.stringify(options.sources || []) } });
    await db.knowledgePoint.update({ where: { id }, data: { currentRevisionId: revision.id } });
  }
  return id;
}
function reference(id: string, revisionId = `${id}-v1`) { return { kind: "record", knowledgePointId: id, revisionId, title: `${id} 当时标题`, body: `${id} 当时原文`, sourceType: "user" }; }
function selectedParagraph(body: string, start: number, end: number): ParagraphSelector {
  return { type: "paragraph-v1", start, end, quoteHash: createHash("sha256").update(body.slice(start, end), "utf8").digest("hex") };
}
async function edge(id: string, from: string, to: string, status = "confirmed") {
  await db.knowledgeGraphEdge.create({ data: { id, fromKnowledgePointId: from, toKnowledgePointId: to, relationType: "related", detail: `联系 ${id}`, status } });
}
async function graphFixture(prefix: string, count: number, links: { id: string; from: number; to: number }[]) {
  const ids = Array.from({ length: count }, (_, index) => `${prefix}-${index}`);
  // Keep the same persisted records and revisions while avoiding hundreds of
  // fsync-heavy individual commits during the full Windows SQLite test suite.
  await db.$transaction(async tx => {
    await tx.knowledgePoint.createMany({ data: ids.map(id => ({ id, title: id, recordKind: "note" })) });
    await tx.knowledgePointRevision.createMany({ data: ids.map(id => ({ id: `${id}-v1`, knowledgePointId: id, sequence: 1, title: id, body: `${id} 正文`, sourceType: "user" })) });
    await tx.$executeRaw(Prisma.sql`UPDATE KnowledgePoint SET currentRevisionId = id || '-v1' WHERE id IN (${Prisma.join(ids)})`);
    await tx.knowledgeGraphEdge.createMany({ data: links.map(link => ({ id: link.id, fromKnowledgePointId: ids[link.from], toKnowledgePointId: ids[link.to], relationType: "related", detail: `联系 ${link.id}`, status: "confirmed" })) });
  });
}

describe("个人记录发现：真实隔离 SQLite，不调用 AI 或改写学习事实", { timeout: 30000 }, () => {
  it("反向引用按引用者当前修订去重分页，保留被引用的固定版本", async () => {
    await point("target");
    await point("a", { sources: [reference("target"), reference("target", "target-old")] });
    await point("b", { sources: [reference("target")], body: "上下文".repeat(500) });
    await point("removed", { sources: [reference("target")] });
    const latest = await db.knowledgePointRevision.create({ data: { id: "removed-v2", knowledgePointId: "removed", sequence: 2, title: "已移除引用", body: "当前没有引用", sourceType: "user", sourcesJson: "[]" } });
    await db.knowledgePoint.update({ where: { id: "removed" }, data: { currentRevisionId: latest.id } });
    await point("lookalike", { sources: [reference("target-other")] });
    const before = await db.learningProgress.count();
    const first = await getPersonalKnowledgeContext("target", { limit: 1 });
    const second = await getPersonalKnowledgeContext("target", { limit: 1, offset: first.backlinks.page.nextOffset });
    expect(first.backlinks.page.total).toBe(2);
    expect(second.backlinks.page.nextOffset).toBeNull();
    const items = [...first.backlinks.items, ...second.backlinks.items];
    expect(items.map(row => row.id).sort()).toEqual(["a", "b"]);
    expect(items.find(row => row.id === "a")?.sources.map(source => source.revisionId)).toEqual(["target-v1", "target-old"]);
    expect(items.find(row => row.id === "a")?.revisionId).toBe("a-v1");
    expect(items.find(row => row.id === "b")?.body).toHaveLength(800);
    expect(await db.learningProgress.count()).toBe(before);
    expect(deps.ai).not.toHaveBeenCalled();
  });

  it("JSON1 索引安全忽略损坏JSON、对象容器、标量和同名文本，不接受SQL插入", async () => {
    await point("target' OR 1=1 --", { sources: [reference("another")] });
    const invalid = ["broken", "null", '"target\' OR 1=1 --"', JSON.stringify(reference("target' OR 1=1 --")), JSON.stringify(["bad scalar", 42, false, null]), JSON.stringify([{ ...reference("target' OR 1=1 --"), revisionId: null }])];
    for (const [index, sources] of invalid.entries()) await point(`invalid-${index}`, { sources });
    await point("valid", { sources: [reference("target' OR 1=1 --")] });
    const context = await getPersonalKnowledgeContext("target' OR 1=1 --");
    expect(context.backlinks.page.total).toBe(1);
    expect(context.backlinks.items.map(row => row.id)).toEqual(["valid"]);
    expect(context.outgoing).toEqual([reference("another")]);
  });

  it("引用筛选先于数据库分页，超过首次列表上限仍可发现", async () => {
    await point("target");
    await db.knowledgePoint.createMany({ data: Array.from({ length: 302 }, (_, index) => ({ id: `unrelated-${index}`, title: "无关" })) });
    await point("match-1", { sources: [reference("target")] });
    await point("match-2", { sources: [reference("target")] });
    const result = await getPersonalKnowledgeContext("target", { limit: 1 });
    expect(result.backlinks.page.total).toBe(2);
    expect(result.backlinks.items).toHaveLength(1);
    expect((await getPersonalKnowledgeContext("target", { offset: 1, limit: 1 })).backlinks.items).toHaveLength(1);
  });

  it("局部一跳与两跳仅沿已确认关系展开，保留跨域方向与最短距离", async () => {
    await db.domain.createMany({ data: [{ id: "d1", name: "数学" }, { id: "d2", name: "物理" }] });
    await point("a", { domainId: "d1" }); await point("b", { domainId: "d2" }); await point("c"); await point("d"); await point("e");
    await edge("ab", "a", "b"); await edge("bc", "b", "c"); await edge("candidate", "a", "d", "candidate"); await edge("rejected", "a", "e", "rejected");
    const first = await getPersonalKnowledgeNeighborhood("a"), second = await getPersonalKnowledgeNeighborhood("a", "2");
    expect(first.nodes.map(node => node.id)).toEqual(["a", "b"]);
    expect(second.nodes.map(node => [node.id, node.distance])).toEqual([["a", 0], ["b", 1], ["c", 2]]);
    expect(second.edges.map(link => [link.fromKnowledgePointId, link.toKnowledgePointId, link.detail])).toEqual([["a", "b", "联系 ab"], ["b", "c", "联系 bc"]]);
    expect(second.truncated).toEqual({ nodes: false, edges: false });
    expect(deps.ai).not.toHaveBeenCalled();
  });

  it("孤立记录可打开，两跳包含可见同层节点之间的联系", async () => {
    await point("island");
    expect((await getPersonalKnowledgeNeighborhood("island")).nodes).toEqual([{ id: "island", title: "island", kind: "note", distance: 0 }]);
    for (const id of ["a", "b", "c", "d", "e"]) await point(id);
    await edge("1", "a", "b"); await edge("2", "a", "c"); await edge("3", "b", "d"); await edge("4", "c", "e"); await edge("5", "d", "e");
    expect((await getPersonalKnowledgeNeighborhood("a", 2)).edges.map(link => link.id)).toContain("5");
  });

  it("节点上限和边上限明确截断，密集图不会虚报遗漏节点", async () => {
    await graphFixture("hub", 85, Array.from({ length: 84 }, (_, index) => ({ id: `hub-edge-${String(index + 1).padStart(3, "0")}`, from: 0, to: index + 1 })));
    const capped = await getPersonalKnowledgeNeighborhood("hub-0", 2);
    expect(capped.nodes).toHaveLength(80);
    expect(capped.edges.length).toBeLessThanOrEqual(120);
    expect(capped.truncated.nodes).toBe(true);
    const ids = new Set(capped.nodes.map(node => node.id));
    expect(capped.edges.every(link => ids.has(link.fromKnowledgePointId) && ids.has(link.toKnowledgePointId))).toBe(true);
    const denseLinks: { id: string; from: number; to: number }[] = [];
    for (let from = 0; from < 17; from++) for (let to = from + 1; to < 17; to++) denseLinks.push({ id: `dense-edge-${from}-${to}`, from, to });
    await graphFixture("dense", 17, denseLinks);
    const dense = await getPersonalKnowledgeNeighborhood("dense-0", 2);
    expect(dense.nodes).toHaveLength(17);
    expect(dense.edges).toHaveLength(120);
    expect(dense.truncated).toEqual({ nodes: false, edges: true });
  });

  it("类型、主题、领域与正文筛选先于标题排序和分页，旧记录使用实际显示标题", async () => {
    await db.domain.createMany({ data: [{ id: "d1", name: "甲" }, { id: "d2", name: "乙" }] });
    await point("legacy", { title: "Alpha", kind: "question", legacy: true, domainId: "d1" });
    await point("new", { title: "Beta", kind: "question", domainId: "d2", body: "needle" });
    await point("wrong-kind", { title: "Aardvark", kind: "note", domainId: "d1" });
    const topic = await db.knowledgeGraphNode.create({ data: { title: "主题", nodeType: "topic", domainId: "d1" } });
    await db.knowledgeGraphMembership.createMany({ data: ["legacy", "new", "wrong-kind"].map(knowledgePointId => ({ groupNodeId: topic.id, knowledgePointId })) });
    const first = await listPersonalKnowledge("", "d1", { kind: "question", collectionId: topic.id, sort: "title_asc", limit: 1 });
    const second = await listPersonalKnowledge("", "d1", { kind: "question", collectionId: topic.id, sort: "title_asc", limit: 1, offset: 1 });
    expect(first.page.total).toBe(2);
    expect(first.knowledgePoints.map(row => row.id)).toEqual(["legacy"]);
    expect(second.knowledgePoints.map(row => row.id)).toEqual(["new"]);
    expect((await listPersonalKnowledge("needle", "d1", { sort: "title_asc", kind: "question" })).knowledgePoints.map(row => row.id)).toEqual(["new"]);
    await expect(listPersonalKnowledge("", undefined, { kind: "mastered" })).rejects.toThrow("类型");
    await expect(listPersonalKnowledge("", undefined, { sort: "random" })).rejects.toThrow("排序");
  });

  it("新增引用保留服务端原来源快照，后来的帮助曝光不回写旧快照", async () => {
    await db.nodeTeachingSession.create({ data: { id: "s", scopeKey: "open:s", requestId: "s", contextHash: "s", contextJson: "{}", lessonJson: "{}", progressJson: "{}", aiCallLogId: "fixture" } });
    await db.teachingSegment.create({ data: { id: "segment", sessionId: "s", key: "segment", requestId: "segment", materialJson: JSON.stringify({ schemaVersion: 4, title: "材料", summary: "", limitations: [], steps: [{ key: "step", goal: "", explanation: "", example: "", basis: "unverified", sourceIds: [], activities: [{ key: "activity", kind: "application", prompt: "问题", answer: "后来打开的解答", criteria: [], hints: ["后来打开的提示"], required: false }] }] }) } });
    const saved = await createPersonalKnowledge({ requestId: "save", title: "我的理解", body: "原文", kind: "note", sources: [{ kind: "session", sessionId: "s", segmentId: "segment", materialVersion: 1 }] });
    const oldSources = saved.knowledgePoint.sources;
    expect(JSON.stringify(oldSources)).not.toContain("后来打开的解答");
    await db.nodeTeachingSession.update({ where: { id: "s" }, data: { progressJson: JSON.stringify({ exposures: { [exposureKey("segment", 1, "step", "activity")]: { hints: 1, solution: true } } }) } });
    await point("target");
    const revised = await revisePersonalKnowledge(saved.knowledgePoint.id, { expectedRevisionId: saved.knowledgePoint.currentRevisionId, title: "我的理解", body: "补充引用", kind: "note", sources: [...oldSources, { kind: "record", knowledgePointId: "target", revisionId: "target-v1" }] });
    expect(revised.knowledgePoint.sources[0]).toEqual(oldSources[0]);
    expect(JSON.stringify(revised.knowledgePoint.sources)).not.toContain("后来打开的解答");
    expect(revised.knowledgePoint.sources[1]).toMatchObject({ kind: "record", knowledgePointId: "target", body: "target 正文" });
    const forged = { ...reference("target"), body: "伪造快照" };
    const safe = await revisePersonalKnowledge(saved.knowledgePoint.id, { expectedRevisionId: revised.knowledgePoint.currentRevisionId, title: "我的理解", body: "再修订", kind: "note", sources: [forged] });
    expect(JSON.stringify(safe.knowledgePoint.sources)).not.toContain("伪造快照");
    expect(safe.knowledgePoint.sources[0]).toMatchObject({ body: "target 正文" });
    await expect(revisePersonalKnowledge(saved.knowledgePoint.id, { expectedRevisionId: saved.knowledgePoint.currentRevisionId, title: "旧写入", body: "冲突", sources: oldSources })).rejects.toThrow("新修订");
  });

  it("只读HTTP入口保留404和非法分页、深度、类型的400", async () => {
    await point("a");
    const params = { params: Promise.resolve({ pointId: "a" }) }, missing = { params: Promise.resolve({ pointId: "missing" }) };
    expect((await getContextRoute(new Request("http://localhost/api/context?limit=0"), params)).status).toBe(400);
    expect((await getNeighborhoodRoute(new Request("http://localhost/api/neighborhood?depth=3"), params)).status).toBe(400);
    expect((await getContextRoute(new Request("http://localhost/api/context"), missing)).status).toBe(404);
    expect((await getNeighborhoodRoute(new Request("http://localhost/api/neighborhood"), missing)).status).toBe(404);
    expect((await getListRoute(new Request("http://localhost/api/knowledge-points?kind=invalid"))).status).toBe(400);
    expect((await getListRoute(new Request("http://localhost/api/knowledge-points?sort=invalid"))).status).toBe(400);
    expect((await getContextRoute(new Request("http://localhost/api/context"), params)).status).toBe(200);
    expect((await getNeighborhoodRoute(new Request("http://localhost/api/neighborhood?depth=2"), params)).status).toBe(200);
    expect(deps.ai).not.toHaveBeenCalled();
  });

  it("超过64KB的旧来源通过绑定原修订的短索引保留，HTTP请求仍受原大小限制", async () => {
    for (const id of ["long-a", "long-b", "long-c"]) await point(id, { body: id.repeat(4000) });
    await point("new-reference");
    const saved = await createPersonalKnowledge({ requestId: "large-sources", title: "多处引用", body: "我的记录", kind: "note", sources: ["long-a", "long-b", "long-c"].map(id => ({ kind: "record", knowledgePointId: id, revisionId: `${id}-v1` })) });
    expect(JSON.stringify(saved.knowledgePoint.sources).length).toBeGreaterThan(64000);
    const requestBody = { expectedRevisionId: saved.knowledgePoint.currentRevisionId, title: "多处引用", body: "补充另一处引用", kind: "note" };
    const params = { params: Promise.resolve({ pointId: saved.knowledgePoint.id }) };
    const full = await patchRecordRoute(new Request("http://localhost/api/knowledge-points/large", { method: "PATCH", body: JSON.stringify({ ...requestBody, sources: saved.knowledgePoint.sources }) }), params);
    expect(full.status).toBe(413);
    const compactBody = { ...requestBody, sources: [{ kind: "retained", sourceIndex: 0 }, { kind: "retained", sourceIndex: 1 }, { kind: "retained", sourceIndex: 2 }, { kind: "record", knowledgePointId: "new-reference", revisionId: "new-reference-v1" }] };
    expect(JSON.stringify(compactBody).length).toBeLessThan(1000);
    const compact = await patchRecordRoute(new Request("http://localhost/api/knowledge-points/large", { method: "PATCH", body: JSON.stringify(compactBody) }), params);
    expect(compact.status).toBe(200);
    const updated = await compact.json();
    expect(updated.knowledgePoint.sources.slice(0, 3)).toEqual(saved.knowledgePoint.sources);
    expect(updated.knowledgePoint.sources[3]).toMatchObject({ knowledgePointId: "new-reference", body: "new-reference 正文" });
    for (const sourceIndex of [-1, 4, 0.5, "0"]) {
      const response = await patchRecordRoute(new Request("http://localhost/api/knowledge-points/large", { method: "PATCH", body: JSON.stringify({ ...requestBody, expectedRevisionId: updated.knowledgePoint.currentRevisionId, sources: [{ kind: "retained", sourceIndex }] }) }), params);
      expect(response.status).toBe(400);
    }
    const unrelated = await patchRecordRoute(new Request("http://localhost/api/knowledge-points/large", { method: "PATCH", body: JSON.stringify({ ...requestBody, expectedRevisionId: "long-a-v1", sources: [{ kind: "retained", sourceIndex: 0 }] }) }), params);
    expect(unrelated.status).toBe(409);
    expect(deps.ai).not.toHaveBeenCalled();
  });

  it("同一固定修订的全文和多个段落共存，重复原文按真实位置保留且原文由服务器拥有", async () => {
    const original = "第一段🙂\r\n保留尾空格  \r\n\r\n重复段\r\n \r\n重复段";
    await point("paragraph-target", { title: "服务器标题", body: original });
    const first = selectedParagraph(original, 0, original.indexOf("\r\n\r\n"));
    const repeated = [original.indexOf("重复段"), original.lastIndexOf("重复段")].map(start => selectedParagraph(original, start, start + "重复段".length));
    const response = await postRecordRoute(new Request("http://localhost/api/knowledge-points", { method: "POST", body: JSON.stringify({ requestId: "paragraphs", title: "引用笔记", body: "我的比较", kind: "note", sources: [undefined, first, ...repeated, first, undefined].map(selector => ({ kind: "record", knowledgePointId: "paragraph-target", revisionId: "paragraph-target-v1", title: "客户端伪造标题", body: "客户端伪造全文", ...(selector ? { selector: { ...selector, quote: "客户端伪造片段" } } : {}) })) }) }));
    expect(response.status).toBe(200);
    const saved = await response.json();
    const snapshots = saved.knowledgePoint.sources;
    expect(snapshots).toHaveLength(4);
    expect(snapshots.every((source: { title: string; body: string }) => source.title === "服务器标题" && source.body === original)).toBe(true);
    expect(snapshots[0]).not.toHaveProperty("selector");
    expect(snapshots[1].selector).toEqual({ ...first, quote: original.slice(first.start, first.end) });
    expect(snapshots.slice(2).map((source: { selector: unknown }) => source.selector)).toEqual(repeated.map(selector => ({ ...selector, quote: "重复段" })));
    expect(repeated[0].quoteHash).toBe(repeated[1].quoteHash);
    expect(repeated[0].start).not.toBe(repeated[1].start);
    const context = await getPersonalKnowledgeContext("paragraph-target", { limit: 1 });
    expect(context.backlinks.page.total).toBe(1);
    expect(context.backlinks.items[0].sources).toHaveLength(4);
    expect((await getPersonalKnowledgeContext(saved.knowledgePoint.id)).outgoing).toEqual(snapshots);
    await point("historic-duplicates", { sources: [snapshots[1], snapshots[1]] });
    const duplicateRetained = await revisePersonalKnowledge("historic-duplicates", { expectedRevisionId: "historic-duplicates-v1", title: "保留旧重复", body: "旧来源不被重排", kind: "note", sources: [{ kind: "record", knowledgePointId: "paragraph-target", revisionId: "paragraph-target-v1", selector: first }, { kind: "retained", sourceIndex: 0 }, { kind: "retained", sourceIndex: 1 }] });
    expect(duplicateRetained.knowledgePoint.sources).toEqual([snapshots[1], snapshots[1]]);
    expect(await db.knowledgeGraphEdge.count()).toBe(0);
    expect(deps.ai).not.toHaveBeenCalled();
  });

  it("HTTP拒绝空值、未知类型、错哈希和非完整Unicode段落范围，错误归属不写入任何记录", async () => {
    const body = "段落🙂原文\n\n另一个段落";
    await point("selection-target", { body }); await point("other-owner");
    const valid = selectedParagraph(body, 0, body.indexOf("\n\n"));
    const badSelectors: unknown[] = [null, [], "paragraph-v1", {}, { ...valid, type: "sentence-v1" }, { ...valid, quoteHash: "0".repeat(64) }, { ...valid, quoteHash: valid.quoteHash.toUpperCase() }, { ...valid, quoteHash: valid.quoteHash + "\n" }, { ...valid, start: -1 }, { ...valid, start: 0.5 }, { ...valid, end: 0 }, { ...valid, end: body.length + 1 }, { ...valid, end: 3 }, { ...valid, end: 2 }];
    const before = { records: await db.knowledgePoint.count(), revisions: await db.knowledgePointRevision.count(), audit: await db.learningProgress.count() };
    for (const [index, selector] of badSelectors.entries()) {
      const response = await postRecordRoute(new Request("http://localhost/api/knowledge-points", { method: "POST", body: JSON.stringify({ requestId: `bad-selector-${index}`, title: "不能保存", body: "无效引用", sources: [{ kind: "record", knowledgePointId: "selection-target", revisionId: "selection-target-v1", selector }] }) }));
      expect(response.status).toBe(400);
    }
    const wrongOwner = await postRecordRoute(new Request("http://localhost/api/knowledge-points", { method: "POST", body: JSON.stringify({ requestId: "wrong-owner", title: "不能保存", body: "错误归属", sources: [{ kind: "record", knowledgePointId: "other-owner", revisionId: "selection-target-v1", selector: valid }] }) }));
    expect(wrongOwner.status).toBe(400);
    expect(await db.knowledgePoint.count()).toBe(before.records);
    expect(await db.knowledgePointRevision.count()).toBe(before.revisions);
    expect(await db.learningProgress.count()).toBe(before.audit);
    expect(deps.ai).not.toHaveBeenCalled();
  });

  it("源记录后续修订不移动旧段落，retained与失败保存保持固定快照及并发原子性", async () => {
    const original = "原来第一段\n\n被引用的原段🙂";
    await point("moving-source", { body: original });
    const start = original.indexOf("被引用"), selector = selectedParagraph(original, start, original.length);
    const saved = await createPersonalKnowledge({ requestId: "fixed-paragraph", title: "保留原段", body: "我的理解", kind: "note", sources: [{ kind: "record", knowledgePointId: "moving-source", revisionId: "moving-source-v1", selector }] });
    const snapshot = saved.knowledgePoint.sources[0];
    await revisePersonalKnowledge("moving-source", { expectedRevisionId: "moving-source-v1", title: "源记录新标题", body: "全新开头改变位置\n\n原来第一段\n\n重新表达了这个段落", kind: "note" });
    const retained = await revisePersonalKnowledge(saved.knowledgePoint.id, { expectedRevisionId: saved.knowledgePoint.currentRevisionId, title: "保留原段", body: "补充理解", kind: "note", sources: [{ kind: "retained", sourceIndex: 0 }] });
    expect(retained.knowledgePoint.sources).toEqual([snapshot]);
    expect((await getPersonalKnowledgeContext(saved.knowledgePoint.id)).outgoing[0]).toEqual(snapshot);
    expect((await getPersonalKnowledgeContext("moving-source")).backlinks.items[0].sources).toEqual([snapshot]);
    const revisionCount = await db.knowledgePointRevision.count();
    const params = { params: Promise.resolve({ pointId: saved.knowledgePoint.id }) };
    const conflict = await patchRecordRoute(new Request("http://localhost/api/knowledge-points/fixed", { method: "PATCH", body: JSON.stringify({ expectedRevisionId: saved.knowledgePoint.currentRevisionId, title: "过期写入", body: "不应保存", kind: "note", sources: [{ kind: "retained", sourceIndex: 0 }, { kind: "record", knowledgePointId: "moving-source", revisionId: "moving-source-v1", selector }] }) }), params);
    expect(conflict.status).toBe(409);
    const invalid = await patchRecordRoute(new Request("http://localhost/api/knowledge-points/fixed", { method: "PATCH", body: JSON.stringify({ expectedRevisionId: retained.knowledgePoint.currentRevisionId, title: "部分错误", body: "不应保存", kind: "note", sources: [{ kind: "retained", sourceIndex: 0 }, { kind: "record", knowledgePointId: "moving-source", revisionId: "moving-source-v1", selector: null }] }) }), params);
    expect(invalid.status).toBe(400);
    expect(await db.knowledgePointRevision.count()).toBe(revisionCount);
    expect((await db.knowledgePoint.findUniqueOrThrow({ where: { id: saved.knowledgePoint.id } })).currentRevisionId).toBe(retained.knowledgePoint.currentRevisionId);
    expect((await getPersonalKnowledgeContext(saved.knowledgePoint.id)).outgoing).toEqual([snapshot]);
  });

  it("段落读取shape与JSON1计数一致，坏selector不会退成全文或挤占分页", async () => {
    await point("shape-target");
    const selector = { type: "paragraph-v1", start: 0, end: 1, quoteHash: "a".repeat(64), quote: "A" };
    const good = { ...reference("shape-target"), selector };
    const invalid: unknown[] = [null, [], {}, { ...selector, type: "unknown" }, { ...selector, start: -1 }, { ...selector, start: "0" }, { ...selector, start: 0.5 }, { ...selector, end: 0 }, { ...selector, end: 9007199254740992 }, { ...selector, quoteHash: "A".repeat(64) }, { ...selector, quoteHash: "a".repeat(64) + "\n" }, { ...selector, quoteHash: "a".repeat(63) + "\0" }, { ...selector, quoteHash: "a".repeat(64) + "\0" }, { ...selector, quote: null }];
    for (const [index, value] of invalid.entries()) await point(`bad-shape-${index}`, { sources: [{ ...reference("shape-target"), selector: value }] });
    await point("good-shape", { sources: [good] });
    await point("mixed-shape", { sources: [good, ...invalid.map(value => ({ ...reference("shape-target"), selector: value }))] });
    // JSON numeric spelling does not change JS integer semantics.
    await point("real-spelling", { sources: JSON.stringify([good]).replace('"start":0', '"start":0.0').replace('"end":1', '"end":1e0') });
    const first = await getPersonalKnowledgeContext("shape-target", { limit: 1 });
    const rest = await getPersonalKnowledgeContext("shape-target", { limit: 2, offset: 1 });
    expect(first.backlinks.page.total).toBe(3);
    expect(first.backlinks.items).toHaveLength(1);
    expect(rest.backlinks.items).toHaveLength(2);
    expect(rest.backlinks.page.nextOffset).toBeNull();
    expect([...first.backlinks.items, ...rest.backlinks.items].every(item => item.sources.length === 1)).toBe(true);
    expect((await getPersonalKnowledgeContext("mixed-shape")).outgoing).toEqual([good]);
    expect((await getPersonalKnowledgeContext("bad-shape-0")).outgoing).toEqual([]);
  });
});
