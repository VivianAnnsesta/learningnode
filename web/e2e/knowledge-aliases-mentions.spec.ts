import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
test.afterAll(async () => db.$disconnect());
type RecordData = { id: string; title: string; body: string; currentRevisionId: string; aliases: string[] };
async function createRecord(request: APIRequestContext, title: string, body: string, aliases: string[] = []): Promise<RecordData> {
  const response = await request.post("/api/knowledge-points", { data: { requestId: crypto.randomUUID(), title, body, aliases, kind: "note" } });
  expect(response.status()).toBe(200);
  return (await response.json()).knowledgePoint;
}
async function openRecord(page: Page, record: RecordData, returnTo?: string) {
  const response = page.waitForResponse(r => r.request().method() === "GET" && new URL(r.url()).pathname === `/api/knowledge-points/${record.id}`);
  await page.goto(`/learning/knowledge/${record.id}${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`);
  const loaded = await response;
  expect(loaded.status()).toBe(200);
  expect((await loaded.json()).knowledgePoint.id).toBe(record.id);
  await expect(page.getByRole("button", { name: "确认保存新修订", exact: true })).toBeVisible();
}
async function counts() {
  return { revisions: await db.knowledgePointRevision.count(), relations: await db.knowledgeGraphEdge.count(), audit: await db.learningProgress.count(), ai: await db.aiCallLog.count() };
}

test("别名创建、三个查找入口、明确清空与历史修订使用同一条记录", async ({ page, request }, info) => {
  const key = crypto.randomUUID(), title = `命名记录-${key}`, alias = `简称-${key}`, wide = `ＡＩ-${key}`, query = `ai-${key}`;
  await page.goto("/learning/knowledge");
  await page.getByLabel("新记录标题").fill(title);
  await page.getByLabel("新记录内容").fill("正文保留自己的想法，查找名称单独维护。");
  await page.getByLabel("新记录别名").fill(`${alias}\n${wide}`);
  await page.getByRole("button", { name: "确认保存", exact: true }).click();
  await expect(page.getByRole("link", { name: title, exact: true })).toBeVisible();
  const row = await db.knowledgePoint.findFirstOrThrow({ where: { currentRevision: { title } } });
  const target: RecordData = (await (await request.get(`/api/knowledge-points/${row.id}`)).json()).knowledgePoint;
  expect(target.aliases).toEqual([alias, wide]);
  await page.getByLabel("检索个人记录").fill(query);
  const card = page.getByRole("article").filter({ has: page.getByRole("link", { name: title, exact: true }) });
  await expect(card).toContainText(`匹配别名：${wide}`);
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "快速查找个人记录" });
  await dialog.getByLabel("快速查找关键词").fill(query);
  await expect(dialog.getByRole("link", { name: title, exact: true })).toBeVisible();
  await expect(dialog).toContainText(`匹配别名：${wide}`);
  await dialog.getByRole("button", { name: "关闭查找", exact: true }).click();
  const source = await createRecord(request, `引用编辑-${key}`, "准备显式选取来源。");
  await openRecord(page, source);
  await page.getByText("添加记录引用", { exact: true }).click();
  await page.getByLabel("搜索要引用的记录").fill(query);
  await expect(page.getByText(`匹配别名：${wide}`, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: `引用“${title}”`, exact: true }).click();
  await expect(page.getByRole("article", { name: `草稿引用：${title} · 全文`, exact: true })).toBeVisible();
  expect(await db.knowledgePointRevision.count({ where: { knowledgePointId: source.id } })).toBe(1);
  expect((await (await request.get(`/api/knowledge-points/${target.id}/context`)).json()).backlinks.page.total).toBe(0);
  await openRecord(page, target);
  await expect(page.getByLabel("记录别名")).toHaveValue(`${alias}\n${wide}`);
  await page.getByLabel("记录别名").fill("");
  await page.getByRole("button", { name: "确认保存新修订", exact: true }).click();
  await expect(page.getByText("当前已保存别名：无", { exact: true })).toBeVisible();
  const saved = (await (await request.get(`/api/knowledge-points/${target.id}`)).json());
  expect(saved.knowledgePoint.aliases).toEqual([]);
  expect(saved.revisions.find((revision: { sequence: number }) => revision.sequence === 1).aliases).toEqual([alias, wide]);
  expect((await (await request.get(`/api/knowledge-points?q=${encodeURIComponent(query)}`)).json()).page.total).toBe(0);
  await page.getByText(`修订 1 · ${title} · user`, { exact: true }).click();
  await expect(page.getByText(`该修订别名：${alias}、${wide}`, { exact: true })).toBeVisible();
  await page.screenshot({ path: info.outputPath("revisioned-alias-history.png"), fullPage: true });
});

test("当前正文的名称提及经阅读、显式引用保存后退出候选且形成反向入口", async ({ page, request }, info) => {
  const key = crypto.randomUUID(), alias = `关联词-${key}`;
  const target = await createRecord(request, `概念目标-${key}`, "这个记录等待其他内容引用。", [alias]);
  const paragraph = `🙂 原文中的${alias}需要结合条件理解。\r\n保留同一段中的第二行。  `;
  const source = await createRecord(request, `提及来源-${key}`, `开头。\r\n\r\n${paragraph}\r\n\r\n后文。`);
  const view = `/learning/knowledge?q=${key}&sort=title_asc`, before = await counts();
  await openRecord(page, target, view);
  const panel = page.getByRole("region", { name: "提到此名称但尚未引用的记录" });
  const mention = panel.getByRole("article", { name: `未引用提及：${source.title}`, exact: true });
  await expect(mention).toContainText(alias);
  await expect(mention).toContainText("保留同一段中的第二行。");
  const api = (await (await request.get(`/api/knowledge-points/${target.id}/mentions`)).json());
  expect(api.mentions.page.total).toBe(1);
  expect(api.mentions.items[0].context.quote).toBe(paragraph);
  expect(source.body.slice(api.mentions.items[0].context.start, api.mentions.items[0].context.end)).toBe(paragraph);
  await page.screenshot({ path: info.outputPath("unlinked-record-mention.png"), fullPage: true });
  const loaded = page.waitForResponse(r => r.request().method() === "GET" && new URL(r.url()).pathname === `/api/knowledge-points/${source.id}`);
  await mention.getByRole("link", { name: `打开“${source.title}”并选择引用`, exact: true }).click();
  expect((await (await loaded).json()).knowledgePoint.id).toBe(source.id);
  await expect(page).toHaveURL(url => url.pathname === `/learning/knowledge/${source.id}` && url.searchParams.get("returnTo") === view);
  await expect(page.getByRole("button", { name: "确认保存新修订", exact: true })).toBeVisible();
  expect(await counts()).toEqual(before);
  await page.getByText("添加记录引用", { exact: true }).click();
  await page.getByLabel("搜索要引用的记录").fill(alias);
  await page.getByRole("button", { name: `引用“${target.title}”`, exact: true }).click();
  expect(await counts()).toEqual(before);
  await page.getByRole("button", { name: "确认保存新修订", exact: true }).click();
  await expect(page.getByRole("article", { name: `已保存引用：${target.title} · 全文`, exact: true })).toBeVisible();
  const after = await counts();
  expect(after).toEqual({ ...before, revisions: before.revisions + 1 });
  await openRecord(page, target, view);
  await expect(panel.getByText("当前没有找到尚未引用的来源记录。", { exact: true })).toBeVisible();
  expect((await (await request.get(`/api/knowledge-points/${target.id}/mentions`)).json()).mentions.page.total).toBe(0);
  const backlinks = (await (await request.get(`/api/knowledge-points/${target.id}/context`)).json()).backlinks;
  expect(backlinks.page.total).toBe(1);
  expect(backlinks.items[0].id).toBe(source.id);
  await expect(page.getByRole("region", { name: "记录引用与反向引用" }).getByRole("link", { name: source.title, exact: true })).toBeVisible();
});

test("提及失败可重试，别名并发冲突保留草稿并经显式合并追加修订", async ({ page, request }) => {
  const key = crypto.randomUUID(), old = `原名称-${key}`, local = `本地名称-${key}`, outside = `另一窗口名称-${key}`;
  const target = await createRecord(request, `并发名称-${key}`, "原始正文。", [old]);
  let fail = true;
  await page.route(`**/api/knowledge-points/${target.id}/mentions?*`, route => {
    if (fail) { fail = false; return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "本次提及读取失败，请重试。" }) }); }
    return route.continue();
  });
  await openRecord(page, target);
  const panel = page.getByRole("region", { name: "提到此名称但尚未引用的记录" });
  await expect(panel.getByText("本次提及读取失败，请重试。", { exact: true })).toBeVisible();
  await panel.getByRole("button", { name: "重试读取未引用提及", exact: true }).click();
  await expect(panel.getByText("当前没有找到尚未引用的来源记录。", { exact: true })).toBeVisible();
  await page.getByLabel("记录别名").fill(local);
  await page.getByLabel("修订记录内容").fill("浏览器本地正文。");
  const updated = await request.patch(`/api/knowledge-points/${target.id}`, { data: { expectedRevisionId: target.currentRevisionId, title: target.title, body: "另一窗口正文。", aliases: [outside], kind: "note" } });
  expect(updated.status()).toBe(200);
  await page.getByRole("button", { name: "确认保存新修订", exact: true }).click();
  await expect(page.getByText("记录已有较新修订，你的编辑草稿仍保留。请比较并合并内容，再明确选择新的保存基础。", { exact: true })).toBeVisible();
  await expect(page.getByLabel("记录别名")).toHaveValue(local);
  await expect(page.getByLabel("修订记录内容")).toHaveValue("浏览器本地正文。");
  expect(await db.knowledgePointRevision.count({ where: { knowledgePointId: target.id } })).toBe(2);
  await page.getByText("比较最新保存的内容", { exact: true }).click();
  await expect(page.getByText(`最新别名：${outside}`, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "已合并，使用最新修订作为保存基础", exact: true }).click();
  await page.getByRole("button", { name: "确认保存新修订", exact: true }).click();
  await expect(page.getByText(`当前已保存别名：${local}`, { exact: true })).toBeVisible();
  const result = (await (await request.get(`/api/knowledge-points/${target.id}`)).json());
  expect(result.knowledgePoint.aliases).toEqual([local]);
  expect(result.knowledgePoint.body).toBe("浏览器本地正文。");
  expect(result.revisions.map((revision: { aliases: string[] }) => revision.aliases)).toEqual([[local], [outside], [old]]);
});
