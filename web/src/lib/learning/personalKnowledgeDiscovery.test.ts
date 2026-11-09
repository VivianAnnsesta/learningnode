import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getPersonalKnowledgeContext, getPersonalKnowledgeNeighborhood } from "./personalKnowledgeDiscovery";
import { createPersonalKnowledge, listPersonalKnowledge, revisePersonalKnowledge } from "./personalKnowledgeService";
import { exposureKey } from "./flexibleTeaching";
import { GET as getContextRoute } from "../../app/api/knowledge-points/[pointId]/context/route";
import { GET as getNeighborhoodRoute } from "../../app/api/knowledge-points/[pointId]/neighborhood/route";
import { GET as getListRoute } from "../../app/api/knowledge-points/route";
import { PATCH as patchRecordRoute } from "../../app/api/knowledge-points/[pointId]/route";

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
});
