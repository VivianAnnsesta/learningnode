import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createKnowledgeRecordTemplate, getKnowledgeRecordTemplate, listKnowledgeRecordTemplates } from "./knowledgeRecordTemplateService";
import { createPersonalKnowledge, getPersonalKnowledge } from "./personalKnowledgeService";
import { renderRecordTemplate } from "./recordTemplateContracts";
import { digest } from "./teachingSources";
import { GET as getTemplates, POST as postTemplate } from "../../app/api/knowledge-points/templates/route";
import { GET as getTemplate, PATCH as patchTemplate, DELETE as deleteTemplate } from "../../app/api/knowledge-points/templates/[templateId]/route";

const deps = vi.hoisted(() => ({ db: null as PrismaClient | null, ai: vi.fn() }));
vi.mock("../prisma", () => ({ get prisma() { return deps.db!; } }));
vi.mock("../ai/tutorService", () => ({ runJsonTask: deps.ai }));
let directory: string, filename: string, db: PrismaClient;
function connect() { db = new PrismaClient({ datasources: { db: { url: `file:${filename.replace(/\\/g, "/")}` } } }); deps.db = db; }
beforeAll(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "englishnode-record-templates-"));
  filename = path.join(directory, "isolated.db"); fs.copyFileSync(path.resolve("prisma/seed.db"), filename); connect();
});
beforeEach(async () => {
  await db.knowledgeRecordTemplate.deleteMany(); await db.savedKnowledgeView.deleteMany(); await db.knowledgeGraphEdge.deleteMany(); await db.knowledgeGraphMembership.deleteMany(); await db.knowledgeGraphNode.deleteMany();
  await db.knowledgePoint.updateMany({ data: { currentRevisionId: null } }); await db.knowledgePoint.deleteMany();
  await db.learningProgress.deleteMany(); await db.nodeTeachingSession.deleteMany(); await db.learningNode.deleteMany(); await db.domain.deleteMany(); deps.ai.mockReset();
});
afterAll(async () => {
  await db?.$disconnect();
  if (directory && path.dirname(directory) === path.resolve(os.tmpdir())) fs.rmSync(directory, { recursive: true, force: true });
});

const config = (body = "# {{title}}\r\n\r\n  {{date}} {{time}}\r原文\n\t{{unknown}}  ", timeZone = "UTC") => ({ body, timeZone });
const input = (requestId: string, overrides: Record<string, unknown> = {}) => ({ requestId, title: "正文模板", config: config(), ...overrides });
const request = (method: string, value: unknown) => new Request("http://localhost/api/knowledge-points/templates", { method, body: JSON.stringify(value) });
const context = (templateId: string) => ({ params: Promise.resolve({ templateId }) });
const create = (requestId: string, overrides: Record<string, unknown> = {}) => createKnowledgeRecordTemplate(input(requestId, overrides));
async function facts() {
  const [records, revisions, audit, relations, sessions, ai, views, nodes] = await Promise.all([db.knowledgePoint.count(), db.knowledgePointRevision.count(), db.learningProgress.count(), db.knowledgeGraphEdge.count(), db.nodeTeachingSession.count(), db.aiCallLog.count(), db.savedKnowledgeView.count(), db.learningNode.count()]);
  return { records, revisions, audit, relations, sessions, ai, views, nodes };
}

describe("个人记录模板：真实隔离SQLite与正式HTTP", { timeout: 30000 }, () => {
  it("CRUD返回独立配置且名称trim，正文缩进、CRLF、孤立CR、TAB和未知变量原样保存", async () => {
    const body = "  {{title}}\r\n\r\n\t{{date}} {{time}}\r末尾\n{{unknown}}  ";
    const response = await postTemplate(request("POST", input("raw", { title: "  我的模板  ", config: config(body, "US/Pacific") })));
    expect(response.status).toBe(200); const saved = (await response.json()).template;
    expect(saved).toMatchObject({ id: `template:${digest("raw")}`, title: "我的模板", schemaVersion: 1, version: 1, config: { body, timeZone: "US/Pacific" } });
    expect((await (await getTemplate(new Request("http://localhost/api/templates"), context(saved.id))).json()).template).toEqual(saved);
    const raw = await db.knowledgeRecordTemplate.findUniqueOrThrow({ where: { id: saved.id } });
    expect(JSON.parse(raw.configJson)).toEqual({ body, timeZone: "US/Pacific" });
    expect(await facts()).toEqual({ records: 0, revisions: 0, audit: 0, relations: 0, sessions: 0, ai: 0, views: 0, nodes: 0 });
  });

  it("名称的类型、长度、控制字符与不完整Unicode在POST/PATCH均400且不部分更新", async () => {
    const saved = (await create("valid-title")).template, before = await db.knowledgeRecordTemplate.findMany();
    for (const title of [undefined, null, 12, "", "  ", "a\nb", "a\0b", "\ud800", "x".repeat(121)]) {
      expect((await postTemplate(request("POST", input(crypto.randomUUID(), { title })))).status).toBe(400);
      expect((await patchTemplate(request("PATCH", { title, config: config(), expectedVersion: 1 }), context(saved.id))).status).toBe(400);
    }
    expect(await db.knowledgeRecordTemplate.findMany()).toEqual(before);
  });

  it("配置必须完整body/timeZone，非法文本/时区/多余字段在两写入口拒绝且保留raw", async () => {
    const saved = (await create("valid-config")).template, before = await db.knowledgeRecordTemplate.findMany();
    const invalid: unknown[] = [undefined, null, [], {}, { body: "正文" }, { timeZone: "UTC" }, config(""), config(" \r\n\t"), config("a\0b"), config("a\u0085b"), config("\ud800"), config("x".repeat(24001)), config("正文", "+01:00"), config("正文", "Invalid/Zone"), config("正文", " UTC "), config("正文", "UTC\n"), { ...config(), domainId: "hidden-scope" }, { body: 5, timeZone: "UTC" }];
    for (const value of invalid) {
      expect((await postTemplate(request("POST", input(crypto.randomUUID(), { config: value })))).status).toBe(400);
      expect((await patchTemplate(request("PATCH", { title: "有效名称", config: value, expectedVersion: 1 }), context(saved.id))).status).toBe(400);
    }
    expect(await db.knowledgeRecordTemplate.findMany()).toEqual(before);
  });

  it("请求白名单拒绝记录/学习/来源字段和未知字段，不把模板管理伪装成记录保存", async () => {
    const saved = (await create("whitelist")).template, before = await db.knowledgeRecordTemplate.findMany(), counts = await facts();
    for (const key of ["kind", "sourceType", "acceptAiContent", "sources", "aliases", "domainId", "knowledgePointId", "nodeIds", "schemaVersion", "body", "unknown"]) {
      expect((await postTemplate(request("POST", { ...input(crypto.randomUUID()), [key]: "not-allowed" }))).status).toBe(400);
      expect((await patchTemplate(request("PATCH", { title: "有效名称", config: config(), expectedVersion: 1, [key]: "not-allowed" }), context(saved.id))).status).toBe(400);
      expect((await deleteTemplate(request("DELETE", { expectedVersion: 1, [key]: "not-allowed" }), context(saved.id))).status).toBe(400);
    }
    expect(await db.knowledgeRecordTemplate.findMany()).toEqual(before); expect(await facts()).toEqual(counts); expect(deps.ai).not.toHaveBeenCalled();
  });

  it("HTTP请求64000上限保持不变，边界有效请求200，超长POST/PATCH/DELETE均413", async () => {
    const payload = JSON.stringify(input("request-boundary"));
    const atLimit = " ".repeat(64000 - payload.length) + payload;
    expect(atLimit).toHaveLength(64000);
    const response = await postTemplate(new Request("http://localhost/api/templates", { method: "POST", body: atLimit })); expect(response.status).toBe(200);
    const saved = (await response.json()).template, before = await db.knowledgeRecordTemplate.findMany();
    const tooLong = " " + atLimit;
    expect((await postTemplate(new Request("http://localhost/api/templates", { method: "POST", body: tooLong }))).status).toBe(413);
    expect((await patchTemplate(new Request("http://localhost/api/templates", { method: "PATCH", body: tooLong }), context(saved.id))).status).toBe(413);
    expect((await deleteTemplate(new Request("http://localhost/api/templates", { method: "DELETE", body: tooLong }), context(saved.id))).status).toBe(413);
    expect(await db.knowledgeRecordTemplate.findMany()).toEqual(before);
  });

  it("正文容量按UTF16计数，24000含emoji和缩进完整保存，超1单元400不截断", async () => {
    const body = " ".repeat(20) + "🙂".repeat(11990); expect(body.length).toBe(24000);
    const saved = (await create("capacity", { config: config(body) })).template;
    expect(saved.config?.body).toBe(body);
    expect((await postTemplate(request("POST", input("capacity-over", { config: config(body + "x") })))).status).toBe(400);
    expect(await db.knowledgeRecordTemplate.count()).toBe(1);
    expect(JSON.parse((await db.knowledgeRecordTemplate.findUniqueOrThrow({ where: { id: saved.id } })).configJson).body).toBe(body);
  });

  it("同号同规范名称配置可复用，正文空白或时区别名变化仍409，异号同名互不覆盖", async () => {
    const saved = (await create("same", { title: "  相同名称  ", config: config("正文\n", "US/Pacific") })).template;
    const retry = await create("same", { title: "相同名称", config: { timeZone: "US/Pacific", body: "正文\n" } });
    expect(retry.template).toEqual(saved);
    for (const changed of [{ title: "其他名称", config: config("正文\n", "US/Pacific") }, { title: "相同名称", config: config("正文", "US/Pacific") }, { title: "相同名称", config: config("正文\n", "America/Los_Angeles") }]) {
      expect((await postTemplate(request("POST", input("same", changed)))).status).toBe(409);
    }
    const other = (await create("other", { title: "相同名称" })).template;
    expect(other.id).not.toBe(saved.id); expect(await db.knowledgeRecordTemplate.count()).toBe(2);
  });

  it("并发创建同配置复用一份，不同配置同号仅一份成功且另一409", async () => {
    const same = await Promise.all([postTemplate(request("POST", input("concurrent-same"))), postTemplate(request("POST", input("concurrent-same")))]);
    expect(same.map(response => response.status)).toEqual([200, 200]);
    const [a, b] = await Promise.all(same.map(response => response.json())); expect(a.template.id).toBe(b.template.id);
    const different = await Promise.all(["甲", "乙"].map(title => postTemplate(request("POST", input("concurrent-different", { title })) )));
    expect(different.map(response => response.status).sort()).toEqual([200, 409]); expect(await db.knowledgeRecordTemplate.count()).toBe(2);
  });

  it("PATCH/DELETE使用版本CAS，旧版本409且缺失404，不覆盖或删除新配置", async () => {
    const saved = (await create("cas")).template;
    const response = await patchTemplate(request("PATCH", { title: "修订后的模板", config: config("改后正文\r\n", "Asia/Shanghai"), expectedVersion: 1 }), context(saved.id));
    expect(response.status).toBe(200); const latest = (await response.json()).template;
    expect(latest).toMatchObject({ version: 2, title: "修订后的模板", config: config("改后正文\r\n", "Asia/Shanghai") });
    expect((await patchTemplate(request("PATCH", { title: "旧覆盖", config: config(), expectedVersion: 1 }), context(saved.id))).status).toBe(409);
    expect((await deleteTemplate(request("DELETE", { expectedVersion: 1 }), context(saved.id))).status).toBe(409);
    expect((await (await getTemplate(new Request("http://localhost/api/templates"), context(saved.id))).json()).template).toEqual(latest);
    expect((await deleteTemplate(request("DELETE", { expectedVersion: 2 }), context(saved.id))).status).toBe(200);
    expect((await getTemplate(new Request("http://localhost/api/templates"), context(saved.id))).status).toBe(404);
    expect((await patchTemplate(request("PATCH", { title: "缺失", config: config(), expectedVersion: 2 }), context(saved.id))).status).toBe(404);
    expect((await deleteTemplate(request("DELETE", { expectedVersion: 2 }), context(saved.id))).status).toBe(404);
  });

  it("版本必须正整数且不超Prisma Int，最大版本更新不溢出但显式删除仍可用", async () => {
    const saved = (await create("versions")).template, before = await db.knowledgeRecordTemplate.findMany();
    for (const expectedVersion of [undefined, null, "1", 0, -1, 1.5, 2147483648, Number.MAX_SAFE_INTEGER]) {
      expect((await patchTemplate(request("PATCH", { title: "不应更新", config: config(), expectedVersion }), context(saved.id))).status).toBe(400);
      expect((await deleteTemplate(request("DELETE", { expectedVersion }), context(saved.id))).status).toBe(400);
    }
    expect(await db.knowledgeRecordTemplate.findMany()).toEqual(before);
    await db.knowledgeRecordTemplate.create({ data: { id: "max-version", title: "最大版本", configJson: JSON.stringify(config()), version: 2147483647 } });
    expect((await patchTemplate(request("PATCH", { title: "不溢出", config: config(), expectedVersion: 2147483647 }), context("max-version"))).status).toBe(400);
    expect((await getKnowledgeRecordTemplate("max-version")).template.version).toBe(2147483647);
    expect((await deleteTemplate(request("DELETE", { expectedVersion: 2147483647 }), context("max-version"))).status).toBe(200);
  });

  it("两个窗口并发PATCH同一版本仅一个200另一个409，胜出的完整正文不混合", async () => {
    const saved = (await create("concurrent-cas")).template;
    const responses = await Promise.all(["窗口甲", "窗口乙"].map(title => patchTemplate(request("PATCH", { title, config: config(`${title}\r\n正文`), expectedVersion: 1 }), context(saved.id))));
    expect(responses.map(response => response.status).sort()).toEqual([200, 409]);
    const successful = (await responses.find(response => response.status === 200)!.json()).template;
    const current = (await getKnowledgeRecordTemplate(saved.id)).template;
    expect(current.version).toBe(2); expect(current.title).toBe(successful.title); expect(current.config).toEqual(successful.config);
  });

  it("未知schema与损坏配置读取不可运行且raw不变，未知schema不可降级或POST覆盖但可删除", async () => {
    const futureId = `template:${digest("future")}`;
    await db.knowledgeRecordTemplate.createMany({ data: [
      { id: futureId, title: "未来模板", schemaVersion: 2, configJson: '{"future":true}' },
      { id: "bad-json", title: "坏JSON", configJson: "not-json" }, { id: "empty-config", title: "缺失配置", configJson: "{}" },
      { id: "missing-zone", title: "缺失时区", configJson: '{"body":"正文"}' }, { id: "missing-body", title: "缺失正文", configJson: '{"timeZone":"UTC"}' },
      { id: "extra-config", title: "多余字段", configJson: JSON.stringify({ ...config(), kind: "note" }) }
    ] });
    const before = await db.knowledgeRecordTemplate.findMany({ orderBy: { id: "asc" } }), result = await listKnowledgeRecordTemplates();
    expect(result.templates).toHaveLength(6); expect(result.templates.every(row => row.config === null && !!row.unavailableReason)).toBe(true);
    for (const row of result.templates) expect((await getKnowledgeRecordTemplate(row.id)).template.config).toBeNull();
    expect((await postTemplate(request("POST", input("future", { title: "未来模板" })))).status).toBe(409);
    expect((await patchTemplate(request("PATCH", { title: "禁止降级", config: config(), expectedVersion: 1 }), context(futureId))).status).toBe(400);
    expect(await db.knowledgeRecordTemplate.findMany({ orderBy: { id: "asc" } })).toEqual(before);
    expect((await deleteTemplate(request("DELETE", { expectedVersion: 1 }), context(futureId))).status).toBe(200);
    expect(await db.knowledgeRecordTemplate.count()).toBe(5);
  });

  it("schema1损坏配置只由明确完整PATCH修复，原GET不默补字段，旧版本不能再次覆盖", async () => {
    await db.knowledgeRecordTemplate.create({ data: { id: "repair", title: "待修复", configJson: "{}" } });
    expect((await getKnowledgeRecordTemplate("repair")).template.config).toBeNull();
    expect((await db.knowledgeRecordTemplate.findUniqueOrThrow({ where: { id: "repair" } })).configJson).toBe("{}");
    const repaired = await patchTemplate(request("PATCH", { title: "已明确修复", config: config("  修复正文\r\n", "US/Pacific"), expectedVersion: 1 }), context("repair"));
    expect(repaired.status).toBe(200); const value = (await repaired.json()).template;
    expect(value).toMatchObject({ version: 2, config: config("  修复正文\r\n", "US/Pacific") }); expect(value.unavailableReason).toBeUndefined();
    expect((await patchTemplate(request("PATCH", { title: "过期覆盖", config: config(), expectedVersion: 1 }), context("repair"))).status).toBe(409);
  });

  it("列表默认50可读完整分页和尾页，未知/重复参数拒绝且只读不修改排序时间", async () => {
    await db.knowledgeRecordTemplate.createMany({ data: Array.from({ length: 131 }, (_, i) => ({ id: `template-${String(i).padStart(3, "0")}`, title: `模板${i}`, configJson: JSON.stringify({ timeZone: "UTC", body: "正文\r\n" }), updatedAt: new Date("2026-01-01T00:00:00Z") })) });
    const before = await db.knowledgeRecordTemplate.findMany({ orderBy: { id: "asc" } });
    const response = await getTemplates(new Request("http://localhost/api/knowledge-points/templates")); expect(response.status).toBe(200);
    const first = await response.json(); expect(first.templates).toHaveLength(50); expect(first.page).toEqual({ offset: 0, limit: 50, total: 131, nextOffset: 50 });
    const tail = await listKnowledgeRecordTemplates({ offset: 130, limit: 1 }); expect(tail.templates.map(row => row.id)).toEqual(["template-130"]); expect(tail.page.nextOffset).toBeNull();
    const past = await listKnowledgeRecordTemplates({ offset: 131 }); expect(past.templates).toEqual([]); expect(past.page.total).toBe(131);
    expect((await listKnowledgeRecordTemplates({ limit: 300 })).templates).toHaveLength(131);
    for (const query of ["limit=301", "limit=0", "offset=-1", "offset=1000001", "limit=1&limit=2", "q=ignored", "kind=note"]) expect((await getTemplates(new Request(`http://localhost/api/knowledge-points/templates?${query}`))).status).toBe(400);
    expect(await db.knowledgeRecordTemplate.findMany({ orderBy: { id: "asc" } })).toEqual(before);
  });

  it("模板在客户端重连后保留version2与精确正文配置，读取不会再次渲染日期或修复存储", async () => {
    const saved = (await create("restart")).template;
    const changed = await patchTemplate(request("PATCH", { title: "重开名称", config: config("\t{{title}}\r\n{{date}} {{unknown}}\r原文  ", "Asia/Shanghai"), expectedVersion: 1 }), context(saved.id));
    expect(changed.status).toBe(200); const current = (await changed.json()).template, raw = await db.knowledgeRecordTemplate.findUniqueOrThrow({ where: { id: saved.id } });
    await db.$disconnect(); connect();
    const reloaded = (await getKnowledgeRecordTemplate(saved.id)).template;
    expect(reloaded.version).toBe(2); expect(reloaded.config).toEqual(current.config); expect(reloaded.title).toBe(current.title);
    expect(await db.knowledgeRecordTemplate.findUniqueOrThrow({ where: { id: saved.id } })).toEqual(raw); expect(deps.ai).not.toHaveBeenCalled();
  });

  it("模板CRUD不改现有个人记录、别名、固定来源、履历或关系，不调用AI", async () => {
    const source = await createPersonalKnowledge({ requestId: "source", title: "来源原文", body: "原始来源正文", aliases: ["旧别名"], kind: "note" });
    const record = await createPersonalKnowledge({ requestId: "record", title: "独立记录标题", body: "已有正文", sources: [{ kind: "record", knowledgePointId: source.knowledgePoint.id, revisionId: source.knowledgePoint.currentRevisionId }], kind: "question" });
    const before = await facts(), original = await getPersonalKnowledge(record.knowledgePoint.id), revisions = await db.knowledgePointRevision.findMany({ orderBy: { id: "asc" } }), audit = await db.learningProgress.findMany({ orderBy: { id: "asc" } });
    const saved = (await create("facts")).template; await listKnowledgeRecordTemplates(); await getKnowledgeRecordTemplate(saved.id);
    expect((await patchTemplate(request("PATCH", { title: "新模板名称", config: config("<script>alert(1)</script> {{date}}"), expectedVersion: 1 }), context(saved.id))).status).toBe(200);
    expect((await deleteTemplate(request("DELETE", { expectedVersion: 2 }), context(saved.id))).status).toBe(200);
    expect(await facts()).toEqual(before); expect(await getPersonalKnowledge(record.knowledgePoint.id)).toEqual(original);
    expect(await db.knowledgePointRevision.findMany({ orderBy: { id: "asc" } })).toEqual(revisions); expect(await db.learningProgress.findMany({ orderBy: { id: "asc" } })).toEqual(audit); expect(deps.ai).not.toHaveBeenCalled();
  });

  it("预览本身不写事实，明确保存仍走原记录writer，模板后来更新删除不追溯改正文", async () => {
    const saved = (await create("preview", { title: "这个名称不是记录标题", config: config("{{title}}\r\n{{date}} {{time}}") })).template;
    const preview = renderRecordTemplate(saved.config!, { title: "自己的记录标题", now: new Date("2026-11-09T12:34:00Z") });
    expect(preview.text).toBe("自己的记录标题\r\n2026-11-09 12:34"); expect((await facts()).records).toBe(0); expect((await facts()).audit).toBe(0);
    const point = await createPersonalKnowledge({ requestId: "explicit-record-save", title: "自己的记录标题", body: preview.text, kind: "note", aliases: ["本人名称"] });
    expect(point.knowledgePoint).toMatchObject({ title: "自己的记录标题", body: preview.text, sourceType: "user", aliases: ["本人名称"], sources: [] });
    expect((await patchTemplate(request("PATCH", { title: "后来的模板", config: config("已改成其他正文"), expectedVersion: 1 }), context(saved.id))).status).toBe(200);
    expect((await deleteTemplate(request("DELETE", { expectedVersion: 2 }), context(saved.id))).status).toBe(200);
    expect((await getPersonalKnowledge(point.knowledgePoint.id)).knowledgePoint.body).toBe(preview.text);
    expect(await facts()).toEqual({ records: 1, revisions: 1, audit: 1, relations: 0, sessions: 0, ai: 0, views: 0, nodes: 0 }); expect(deps.ai).not.toHaveBeenCalled();
  });
});
