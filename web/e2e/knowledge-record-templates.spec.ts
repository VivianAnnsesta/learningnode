import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import type { RecordTemplateConfig } from "../src/lib/learning/recordTemplateContracts";

const db = new PrismaClient();
test.afterAll(async () => db.$disconnect());
const templatesPath = "/api/knowledge-points/templates";
const templatePath = (id: string) => `${templatesPath}/${encodeURIComponent(id)}`;
type Template = { id: string; title: string; version: number; config: RecordTemplateConfig };
async function template(request: APIRequestContext, title: string, body: string, timeZone = "UTC"): Promise<Template> {
  const response = await request.post(templatesPath, { data: { requestId: crypto.randomUUID(), title, config: { body, timeZone } } });
  expect(response.status()).toBe(200); return (await response.json()).template;
}
async function record(request: APIRequestContext, title: string, body: string, extra: object = {}) {
  const response = await request.post("/api/knowledge-points", { data: { requestId: crypto.randomUUID(), title, body, ...extra } });
  expect(response.status()).toBe(200); return (await response.json()).knowledgePoint;
}
async function facts() {
  return { records: await db.knowledgePoint.count(), revisions: await db.knowledgePointRevision.count(), audit: await db.learningProgress.count(), relations: await db.knowledgeGraphEdge.count(), ai: await db.aiCallLog.count(), views: await db.savedKnowledgeView.count() };
}
async function openTemplates(page: Page, key: string, pointId?: string) {
  const path = pointId ? `/api/knowledge-points/${encodeURIComponent(pointId)}` : "/api/knowledge-points";
  const reading = page.waitForResponse(r => r.request().method() === "GET" && new URL(r.url()).pathname === path);
  await page.goto(pointId ? `/learning/knowledge/${encodeURIComponent(pointId)}` : `/learning/knowledge?q=${key}`);
  const response = await reading; expect(response.status()).toBe(200); await response.json();
  await page.getByText("使用记录模板", { exact: true }).click();
  return { picker: page.getByRole("region", { name: "个人记录模板", exact: true }), manager: page.getByRole("region", { name: "自定义模板管理", exact: true }) };
}
async function selectTemplate(page: Page, value: Template) {
  const reading = page.waitForResponse(r => r.request().method() === "GET" && new URL(r.url()).pathname === templatePath(value.id));
  await page.getByRole("button", { name: `选择模板“${value.title}”`, exact: true }).click();
  const response = await reading; expect(response.status()).toBe(200); expect((await response.json()).template.id).toBe(value.id);
  await expect(page.getByLabel("本次模板预览时区")).toHaveValue(value.config.timeZone);
}
async function position(page: Page, label: string, start: number, end = start) {
  await page.getByLabel(label, { exact: true }).evaluate((node, range) => {
    const input = node as HTMLTextAreaElement; input.focus(); input.setSelectionRange(range.start, range.end); input.dispatchEvent(new Event("select", { bubbles: true }));
  }, { start, end });
}

test("自定义模板可创建、编辑重开和删除，配置操作不写知识或学习事实", async ({ page, request }) => {
  const key = crypto.randomUUID(), title = `我的模板-${key}`, body = "{{title}}\n{{date}} {{time}}\n{{unknown}}";
  const before = await facts();
  let { manager } = await openTemplates(page, key);
  await manager.getByLabel("模板名称", { exact: true }).fill(title); await manager.getByLabel("模板正文", { exact: true }).fill(body); await manager.getByLabel("模板默认时区").fill("UTC");
  const creating = page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === templatesPath);
  await manager.getByRole("button", { name: "保存为新自定义模板", exact: true }).click();
  const createdResponse = await creating; expect(createdResponse.status()).toBe(200); const created: Template = (await createdResponse.json()).template;
  expect(created.config).toEqual({ body, timeZone: "UTC" }); expect(created.version).toBe(1); expect(await facts()).toEqual(before);
  ({ manager } = await openTemplates(page, key));
  const reading = page.waitForResponse(r => r.request().method() === "GET" && new URL(r.url()).pathname === templatePath(created.id));
  await manager.getByRole("button", { name: `编辑模板“${title}”`, exact: true }).click(); expect((await reading).status()).toBe(200);
  await expect(manager.getByLabel("模板正文", { exact: true })).toHaveValue(body);
  const nextTitle = `重开的模板-${key}`, next = { body: "修改后的正文\n{{title}}", timeZone: "Asia/Shanghai" };
  await manager.getByLabel("模板名称", { exact: true }).fill(nextTitle); await manager.getByLabel("模板正文", { exact: true }).fill(next.body); await manager.getByLabel("模板默认时区").fill(next.timeZone);
  const updating = page.waitForResponse(r => r.request().method() === "PATCH" && new URL(r.url()).pathname === templatePath(created.id));
  await manager.getByRole("button", { name: "更新当前自定义模板", exact: true }).click();
  const update = await updating; expect(update.status()).toBe(200); expect((await update.json()).template).toMatchObject({ title: nextTitle, config: next, version: 2 });
  ({ manager } = await openTemplates(page, key));
  await expect(manager.getByRole("article", { name: `自定义模板：${nextTitle}`, exact: true })).toBeVisible();
  const deleting = page.waitForResponse(r => r.request().method() === "DELETE" && new URL(r.url()).pathname === templatePath(created.id));
  await manager.getByRole("button", { name: `删除模板“${nextTitle}”，保留记录`, exact: true }).click(); expect((await deleting).status()).toBe(200);
  await expect(manager.getByRole("article", { name: `自定义模板：${nextTitle}`, exact: true })).toHaveCount(0);
  expect((await request.get(templatePath(created.id))).status()).toBe(404); expect(await facts()).toEqual(before);
});

test("新建正文按所见时间与光标插入，撤销保护后续编辑且仅明确保存才留记录", async ({ page, request }, info) => {
  const key = crypto.randomUUID(), domain = await db.domain.create({ data: { name: `模板领域-${key}` } });
  const value = await template(request, `插入模板-${key}`, "[{{title}}|{{date}} {{time}}]");
  await page.clock.setFixedTime(new Date("2026-11-09T23:59:00Z"));
  await openTemplates(page, key);
  await page.getByLabel("新记录保存领域").selectOption(domain.id);
  const title = `保留{{time}}-${key}`; await page.getByLabel("新记录标题").fill(title); await page.getByLabel("新记录内容", { exact: true }).fill("前😀后");
  await page.getByLabel("新记录别名").fill(`别名-${key}`); await page.getByLabel("新记录类型").selectOption("question");
  await selectTemplate(page, value); await position(page, "新记录内容", 3);
  const before = await facts(), inserted = `[${title}|2026-11-09 23:59]`, expected = `前😀${inserted}后`;
  await page.getByRole("button", { name: "预览模板", exact: true }).click();
  expect(await page.getByLabel("模板预览正文").textContent()).toBe(inserted);
  await page.clock.setFixedTime(new Date("2026-11-10T00:01:00Z"));
  await page.getByRole("button", { name: "插入正文草稿", exact: true }).click(); await expect(page.getByLabel("新记录内容", { exact: true })).toHaveValue(expected);
  expect(await facts()).toEqual(before);
  await page.getByRole("button", { name: "撤销最近一次模板插入", exact: true }).click(); await expect(page.getByLabel("新记录内容", { exact: true })).toHaveValue("前😀后");
  await position(page, "新记录内容", 3); await page.getByRole("button", { name: "预览模板", exact: true }).click();
  const second = `[${title}|2026-11-10 00:01]`;
  await page.getByRole("button", { name: "插入正文草稿", exact: true }).click();
  await page.getByLabel("新记录内容", { exact: true }).fill(`前😀${second}后，后来编辑`);
  await expect(page.getByRole("button", { name: "撤销最近一次模板插入", exact: true })).toBeDisabled();
  await expect(page.getByLabel("新记录标题")).toHaveValue(title); await expect(page.getByLabel("新记录类型")).toHaveValue("question"); await expect(page.getByLabel("新记录别名")).toHaveValue(`别名-${key}`); await expect(page.getByLabel("新记录保存领域")).toHaveValue(domain.id);
  expect(await facts()).toEqual(before); await page.screenshot({ path: info.outputPath("template-preview-and-draft-only.png"), fullPage: true });
  const saving = page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/knowledge-points");
  await page.getByRole("button", { name: "确认保存", exact: true }).click(); const response = await saving; expect(response.status()).toBe(200);
  const saved = (await response.json()).knowledgePoint; expect(saved.body).toBe(`前😀${second}后，后来编辑`); expect(saved.kind).toBe("question"); expect(saved.aliases).toEqual([`别名-${key}`]); expect(saved.domainIds).toContain(domain.id);
  expect((await facts()).records).toBe(before.records + 1); expect((await facts()).revisions).toBe(before.revisions + 1);
  await expect(page.getByRole("button", { name: "撤销最近一次模板插入", exact: true })).toBeDisabled();
});

test("修订选区后插入保留CRLF原文和来源，旧修订直到明确保存后仍不变", async ({ page, request }, info) => {
  const key = crypto.randomUUID(), source = await record(request, `原始来源-${key}`, "来源原文。");
  const sourceRow = await db.knowledgePoint.findUniqueOrThrow({ where: { id: source.id } });
  const original = "甲😀\r\n乙\r丙", note = await record(request, `修订模板-${key}`, original, { aliases: ["原别名"], sources: [{ kind: "record", knowledgePointId: source.id, revisionId: sourceRow.currentRevisionId }] });
  const row = await db.knowledgePoint.findUniqueOrThrow({ where: { id: note.id } }), old = await db.knowledgePointRevision.findUniqueOrThrow({ where: { id: row.currentRevisionId! } });
  const value = await template(request, `CRLF模板-${key}`, "[{{title}}]");
  await openTemplates(page, key, note.id); await selectTemplate(page, value); await position(page, "修订记录内容", 4, 5);
  const before = await facts(), inserted = `[${note.title}]`, expected = `甲😀\r\n乙${inserted}\r丙`;
  await page.getByRole("button", { name: "预览模板", exact: true }).click(); await expect(page.getByRole("region", { name: "模板插入预览" })).toContainText("选中文字保留");
  await page.getByRole("button", { name: "插入正文草稿", exact: true }).click();
  await expect(page.getByLabel("修订记录内容", { exact: true })).toHaveValue(expected.replace(/\r\n?/g, "\n")); expect(await facts()).toEqual(before);
  await page.getByRole("button", { name: "撤销最近一次模板插入", exact: true }).click(); await expect(page.getByLabel("修订记录内容", { exact: true })).toHaveValue(original.replace(/\r\n?/g, "\n"));
  await position(page, "修订记录内容", 4, 5); await page.getByRole("button", { name: "预览模板", exact: true }).click(); await page.getByRole("button", { name: "插入正文草稿", exact: true }).click();
  await page.screenshot({ path: info.outputPath("template-revision-selection-and-sources.png"), fullPage: true });
  const saving = page.waitForResponse(r => r.request().method() === "PATCH" && new URL(r.url()).pathname === `/api/knowledge-points/${encodeURIComponent(note.id)}` && r.request().postDataJSON()?.expectedRevisionId === old.id);
  await page.getByRole("button", { name: "确认保存新修订", exact: true }).click(); const response = await saving; expect(response.status()).toBe(200);
  const current = await db.knowledgePoint.findUniqueOrThrow({ where: { id: note.id } }); expect(current.currentRevisionId).not.toBe(old.id);
  const next = await db.knowledgePointRevision.findUniqueOrThrow({ where: { id: current.currentRevisionId! } });
  expect(next.body).toBe(expected); expect(next.aliasesJson).toBe(old.aliasesJson); expect(next.sourcesJson).toBe(old.sourcesJson);
  expect(await db.knowledgePointRevision.findUniqueOrThrow({ where: { id: old.id } })).toEqual(old);
  expect(await db.knowledgePointRevision.count({ where: { knowledgePointId: note.id } })).toBe(2);
  await expect(page.getByRole("button", { name: "撤销最近一次模板插入", exact: true })).toBeDisabled();
});

test("模板更新与删除CAS冲突保留管理草稿，明确采用基础后只保存所见配置", async ({ page, request }) => {
  const key = crypto.randomUUID(), value = await template(request, `初始模板-${key}`, "初始正文");
  const { manager } = await openTemplates(page, key);
  const reading = page.waitForResponse(r => r.request().method() === "GET" && new URL(r.url()).pathname === templatePath(value.id));
  await manager.getByRole("button", { name: `编辑模板“${value.title}”`, exact: true }).click(); expect((await reading).status()).toBe(200);
  await expect(manager.getByLabel("模板正文", { exact: true })).toHaveValue(value.config.body);
  const title = `本地模板-${key}`, local = { body: "本地 {{title}} 原文", timeZone: "Asia/Shanghai" }, externalTitle = `外部模板-${key}`;
  await manager.getByLabel("模板名称", { exact: true }).fill(title); await manager.getByLabel("模板正文", { exact: true }).fill(local.body); await manager.getByLabel("模板默认时区").fill(local.timeZone);
  expect((await request.patch(templatePath(value.id), { data: { expectedVersion: 1, title: externalTitle, config: { body: "另一窗口", timeZone: "UTC" } } })).status()).toBe(200);
  const before = await facts();
  const conflicting = page.waitForResponse(r => r.request().method() === "PATCH" && new URL(r.url()).pathname === templatePath(value.id) && r.request().postDataJSON()?.expectedVersion === 1);
  await manager.getByRole("button", { name: "更新当前自定义模板", exact: true }).click(); expect((await conflicting).status()).toBe(409);
  await expect(manager.getByText("模板已有新版本，本地名称、正文和时区草稿仍保留。", { exact: true })).toBeVisible();
  await expect(manager.getByLabel("模板名称", { exact: true })).toHaveValue(title); await expect(manager.getByLabel("模板正文", { exact: true })).toHaveValue(local.body); await expect(manager.getByLabel("模板默认时区")).toHaveValue(local.timeZone);
  await manager.getByRole("button", { name: "采用最新模板版本作为更新基础", exact: true }).click();
  const updating = page.waitForResponse(r => r.request().method() === "PATCH" && new URL(r.url()).pathname === templatePath(value.id) && r.request().postDataJSON()?.expectedVersion === 2);
  await manager.getByRole("button", { name: "更新当前自定义模板", exact: true }).click();
  const updated = await updating; expect(updated.status()).toBe(200); expect((await updated.json()).template).toMatchObject({ title, config: local, version: 3 });
  await expect(manager.getByRole("button", { name: `删除模板“${title}”，保留记录`, exact: true })).toBeEnabled();
  const finalTitle = `删除前新版本-${key}`;
  expect((await request.patch(templatePath(value.id), { data: { expectedVersion: 3, title: finalTitle, config: local } })).status()).toBe(200);
  const staleDelete = page.waitForResponse(r => r.request().method() === "DELETE" && new URL(r.url()).pathname === templatePath(value.id));
  await manager.getByRole("button", { name: `删除模板“${title}”，保留记录`, exact: true }).click(); expect((await staleDelete).status()).toBe(409);
  await expect(manager.getByText("模板已有新版本，本地名称、正文和时区草稿仍保留。", { exact: true })).toBeVisible();
  expect((await (await request.get(templatePath(value.id))).json()).template.version).toBe(4);
  await manager.getByRole("button", { name: "重新读取冲突模板列表", exact: true }).click();
  const deleting = page.waitForResponse(r => r.request().method() === "DELETE" && new URL(r.url()).pathname === templatePath(value.id) && r.request().postDataJSON()?.expectedVersion === 4);
  await manager.getByRole("button", { name: `删除模板“${finalTitle}”，保留记录`, exact: true }).click(); expect((await deleting).status()).toBe(200);
  await expect(manager.getByRole("article", { name: `自定义模板：${finalTitle}`, exact: true })).toHaveCount(0);
  expect(await facts()).toEqual(before);
});

test("未来与损坏模板不可插入，完整修复和外部删除恢复不改记录草稿", async ({ page, request }) => {
  const key = crypto.randomUUID(), futureTitle = `未来模板-${key}`, brokenTitle = `损坏模板-${key}`;
  await db.knowledgeRecordTemplate.createMany({ data: [
    { id: `future-template-${key}`, title: futureTitle, schemaVersion: 2, configJson: '{"future":true}', version: 1, updatedAt: new Date() },
    { id: `broken-template-${key}`, title: brokenTitle, schemaVersion: 1, configJson: "{}", version: 1, updatedAt: new Date() }
  ] });
  const { manager } = await openTemplates(page, key); const before = await facts();
  await page.getByLabel("新记录标题").fill(`待保存-${key}`); await page.getByLabel("新记录内容", { exact: true }).fill("不能被配置管理覆盖的正文。");
  for (const title of [futureTitle, brokenTitle]) await expect(manager.getByRole("button", { name: `选择模板“${title}”`, exact: true })).toBeDisabled();
  await expect(manager.getByRole("button", { name: `编辑模板“${futureTitle}”`, exact: true })).toBeDisabled();
  const reading = page.waitForResponse(r => r.request().method() === "GET" && new URL(r.url()).pathname === templatePath(`broken-template-${key}`));
  await manager.getByRole("button", { name: `编辑模板“${brokenTitle}”`, exact: true }).click(); expect((await reading).status()).toBe(200);
  await expect(manager.getByLabel("模板正文", { exact: true })).toHaveValue("");
  expect((await db.knowledgeRecordTemplate.findUniqueOrThrow({ where: { id: `broken-template-${key}` } })).configJson).toBe("{}");
  const repairedTitle = `已明确修复-${key}`, config = { body: "完整修复正文", timeZone: "UTC" };
  await manager.getByLabel("模板名称", { exact: true }).fill(repairedTitle); await manager.getByLabel("模板正文", { exact: true }).fill(config.body); await manager.getByLabel("模板默认时区").fill(config.timeZone);
  const repairing = page.waitForResponse(r => r.request().method() === "PATCH" && new URL(r.url()).pathname === templatePath(`broken-template-${key}`));
  await manager.getByRole("button", { name: "更新当前自定义模板", exact: true }).click(); const repaired = await repairing; expect(repaired.status()).toBe(200); expect((await repaired.json()).template).toMatchObject({ config, version: 2 });
  await expect(manager.getByRole("button", { name: `选择模板“${repairedTitle}”`, exact: true })).toBeEnabled();
  expect((await request.delete(templatePath(`broken-template-${key}`), { data: { expectedVersion: 2 } })).status()).toBe(200);
  const missing = page.waitForResponse(r => r.request().method() === "GET" && new URL(r.url()).pathname === templatePath(`broken-template-${key}`));
  await manager.getByRole("button", { name: `选择模板“${repairedTitle}”`, exact: true }).click(); expect((await missing).status()).toBe(404);
  await expect(page.getByRole("region", { name: "个人记录模板", exact: true }).getByRole("alert")).toContainText("不存在");
  await manager.getByRole("button", { name: "刷新模板列表", exact: true }).click(); await expect(manager.getByRole("article", { name: `自定义模板：${repairedTitle}`, exact: true })).toHaveCount(0);
  const deleting = page.waitForResponse(r => r.request().method() === "DELETE" && new URL(r.url()).pathname === templatePath(`future-template-${key}`));
  await manager.getByRole("button", { name: `删除模板“${futureTitle}”，保留记录`, exact: true }).click(); expect((await deleting).status()).toBe(200);
  await expect(page.getByLabel("新记录内容", { exact: true })).toHaveValue("不能被配置管理覆盖的正文。"); expect(await facts()).toEqual(before);
});

test("模板列表失败仍可写正文，示例预览复制不保存记录且过期预览不可插入", async ({ page, request }) => {
  const key = crypto.randomUUID(); let fail = true;
  await page.route("**/api/knowledge-points/templates?*", route => fail ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "模板列表暂时不可用。" }) }) : route.continue());
  const { picker, manager } = await openTemplates(page, key); const before = await facts();
  await expect(manager.getByText("模板列表暂时不可用。", { exact: true })).toBeVisible();
  await page.getByLabel("新记录标题").fill(`独立草稿-${key}`); await page.getByLabel("新记录内容", { exact: true }).fill("仍然可以继续写正文。");
  await picker.getByRole("button", { name: "选择示例“整理疑问”", exact: true }).click(); await picker.getByRole("button", { name: "预览模板", exact: true }).click();
  await expect(page.getByLabel("模板预览正文")).toContainText(`独立草稿-${key}`);
  await page.getByLabel("新记录标题").fill(`后来标题-${key}`); await expect(picker.getByRole("button", { name: "插入正文草稿", exact: true })).toBeDisabled();
  await picker.getByRole("button", { name: "预览模板", exact: true }).click(); await expect(page.getByLabel("模板预览正文")).toContainText(`后来标题-${key}`);
  expect(await facts()).toEqual(before);
  fail = false; await manager.getByRole("button", { name: "重试读取自定义模板", exact: true }).click(); await expect(manager.getByText("模板列表暂时不可用。", { exact: true })).toHaveCount(0);
  await picker.getByRole("button", { name: "复制所选示例为自定义模板", exact: true }).click(); await expect(manager.getByLabel("模板正文", { exact: true })).toHaveValue(/我想弄清的问题/);
  const title = `示例副本-${key}`; await manager.getByLabel("模板名称", { exact: true }).fill(title);
  const creating = page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === templatesPath);
  await manager.getByRole("button", { name: "保存为新自定义模板", exact: true }).click(); const created = await creating; expect(created.status()).toBe(200); const own = (await created.json()).template;
  expect(own.config.body).toContain("我想弄清的问题"); expect((await request.get(templatePath(own.id))).status()).toBe(200);
  await expect(page.getByLabel("新记录内容", { exact: true })).toHaveValue("仍然可以继续写正文。"); expect(await facts()).toEqual(before);
});
