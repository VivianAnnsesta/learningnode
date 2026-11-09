import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import type { KnowledgeViewConfig } from "../src/lib/learning/knowledgeViewContracts";

const db = new PrismaClient();
test.afterAll(async () => db.$disconnect());
type RecordData = { id: string; title: string; body: string };
type SavedView = { id: string; title: string; version: number; config: KnowledgeViewConfig };
const viewsPath = "/api/knowledge-points/views";
const viewPath = (id: string) => `${viewsPath}/${encodeURIComponent(id)}`;
function config(q: string, domainId = "", collectionId = ""): KnowledgeViewConfig {
  return { filters: { q, domainId, collectionId, kind: "", sourceType: "", sort: "title_asc", date: { mode: "all", field: "updated", timeZone: "UTC" } }, displayFields: ["summary", "aliases", "collections"] };
}
async function record(request: APIRequestContext, title: string, body: string, extra: object = {}): Promise<RecordData> {
  const response = await request.post("/api/knowledge-points", { data: { requestId: crypto.randomUUID(), title, body, kind: "note", ...extra } });
  expect(response.status()).toBe(200); return (await response.json()).knowledgePoint;
}
async function savedView(request: APIRequestContext, title: string, value: KnowledgeViewConfig): Promise<SavedView> {
  const response = await request.post(viewsPath, { data: { requestId: crypto.randomUUID(), title, config: value } });
  expect(response.status()).toBe(200); return (await response.json()).view;
}
async function openList(page: Page, query: string) {
  const response = page.waitForResponse(r => r.request().method() === "GET" && new URL(r.url()).pathname === "/api/knowledge-points");
  await page.goto(`/learning/knowledge?${query}`);
  const loaded = await response; expect(loaded.status()).toBe(200); await loaded.json();
}
async function facts() {
  return { records: await db.knowledgePoint.count(), revisions: await db.knowledgePointRevision.count(), audit: await db.learningProgress.count(), relations: await db.knowledgeGraphEdge.count(), ai: await db.aiCallLog.count() };
}

test("来源和本地日期筛选可保存重开，字段与动态最近日期规则不复制记录", async ({ page, request }, info) => {
  const key = crypto.randomUUID(), name = `本地日期视图-${key}`;
  const a = await record(request, `日期边界内-${key}`, `隐藏摘要甲-${key}`, { aliases: [`名称-${key}`] });
  const b = await record(request, `日期边界外-${key}`, `摘要乙-${key}`);
  const ai = await record(request, `已接受AI-${key}`, `接受内容-${key}`, { sourceType: "accepted_ai", acceptAiContent: true });
  for (const [id, createdAt] of [[a.id, "2026-11-01T07:00:00Z"], [b.id, "2026-11-01T06:59:59.999Z"], [ai.id, "2026-11-01T08:00:00Z"]]) {
    await db.knowledgePoint.update({ where: { id }, data: { createdAt: new Date(createdAt), updatedAt: new Date("2026-11-03T00:00:00Z") } });
  }
  const before = await facts();
  await openList(page, `q=${key}`);
  const list = page.getByRole("region", { name: "个人记录列表" });
  await page.getByLabel("筛选内容来源").selectOption("user");
  await expect(list.getByRole("link", { name: b.title, exact: true })).toBeVisible();
  await page.getByLabel("日期依据").selectOption("created");
  await page.getByLabel("日期范围").selectOption("range");
  await page.getByLabel("起始日期").fill("2026-11-01");
  await page.getByLabel("结束日期").fill("2026-11-01");
  await page.getByLabel("日期时区", { exact: true }).fill("America/Los_Angeles");
  await page.getByLabel("视图名称").fill(name);
  await expect(page.getByRole("button", { name: "保存为新视图", exact: true })).toBeDisabled();
  await expect(list.getByRole("link", { name: b.title, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "应用日期筛选", exact: true }).click();
  await expect(list.getByRole("link", { name: a.title, exact: true })).toBeVisible();
  await expect(list.getByRole("link", { name: b.title, exact: true })).toHaveCount(0);
  await expect(list.getByRole("link", { name: ai.title, exact: true })).toHaveCount(0);
  await page.getByLabel("显示摘要", { exact: true }).uncheck();
  for (const label of ["显示记录类型", "显示内容来源", "显示创建日期"]) await page.getByLabel(label, { exact: true }).check();
  const aCard = list.getByRole("article", { name: `个人记录：${a.title}`, exact: true });
  await expect(aCard.getByText(a.body, { exact: true })).toHaveCount(0);
  await expect(aCard).toContainText("本人记录");
  const filters = new URL(page.url()).searchParams;
  const read = await request.get(`/api/knowledge-points?${filters}&limit=20`), rows = await read.json();
  expect(read.status()).toBe(200); expect(rows.page.total).toBe(1); expect(rows.knowledgePoints[0].id).toBe(a.id);
  expect(rows.dateWindow).toEqual({ field: "created", timeZone: "America/Los_Angeles", from: "2026-11-01", to: "2026-11-01" });
  const created = page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === viewsPath);
  await page.getByRole("button", { name: "保存为新视图", exact: true }).click();
  const createdResponse = await created; expect(createdResponse.status()).toBe(200);
  const view: SavedView = (await createdResponse.json()).view;
  expect(view.config.displayFields).toEqual(["kind", "sourceType", "aliases", "collections", "createdAt"]);
  expect(await facts()).toEqual(before);
  await page.screenshot({ path: info.outputPath("source-calendar-and-fields.png"), fullPage: true });
  await page.reload();
  await expect(page.getByLabel("日期时区", { exact: true })).toHaveValue("America/Los_Angeles");
  await expect(page.getByLabel("显示摘要", { exact: true })).not.toBeChecked();
  await expect(list.getByRole("link", { name: a.title, exact: true })).toBeVisible();
  await page.getByRole("button", { name: `打开视图“${name}”`, exact: true }).click();
  await expect(page.getByLabel("视图名称")).toHaveValue(name);
  await page.getByLabel("日期范围").selectOption("last_days");
  await page.getByLabel("最近天数").fill("1");
  await page.getByLabel("日期时区", { exact: true }).fill("UTC");
  await page.getByRole("button", { name: "应用日期筛选", exact: true }).click();
  await page.getByRole("button", { name: "更新当前视图", exact: true }).click();
  await expect(page.getByText("检索视图已保存，记录内容没有改变。", { exact: true })).toBeVisible();
  const changed = (await (await request.get(viewPath(view.id))).json()).view;
  expect(changed.version).toBe(2); expect(changed.config.filters.date).toEqual({ mode: "last_days", field: "created", timeZone: "UTC", days: 1 });
  expect(await facts()).toEqual(before);
  const live = await record(request, `新加入视图-${key}`, "保存视图后新建的记录也由规则找到。");
  await page.reload();
  await expect(list.getByRole("link", { name: live.title, exact: true })).toBeVisible();
  await expect(list.getByRole("link", { name: a.title, exact: true })).toHaveCount(0);
  const today = await page.evaluate(() => new Date().toISOString().slice(0, 10));
  const relative = (await (await request.get(`/api/knowledge-points?${new URL(page.url()).searchParams}`)).json());
  expect(relative.dateWindow).toEqual({ field: "created", timeZone: "UTC", from: today, to: today });
  expect(relative.page.total).toBe(1); expect(relative.knowledgePoints[0].id).toBe(live.id);
  const beforeDelete = await facts();
  await page.getByRole("button", { name: `删除视图“${name}”，保留记录`, exact: true }).click();
  await expect(page.getByRole("article", { name: `检索视图：${name}`, exact: true })).toHaveCount(0);
  expect((await request.get(viewPath(view.id))).status()).toBe(404);
  expect(await facts()).toEqual(beforeDelete);
});

test("打开领域视图保留记录草稿归属，隐藏的新记录和全局查找仍能返回原视图", async ({ page, request }, info) => {
  const key = crypto.randomUUID();
  const a = await db.domain.create({ data: { name: `领域甲-${key}` } }), b = await db.domain.create({ data: { name: `领域乙-${key}` } });
  const outside = await record(request, `甲中记录-${key}`, "应能由全局查找进入。", { domainId: a.id });
  const inside = await record(request, `乙中记录-${key}`, "领域视图中的记录。", { domainId: b.id });
  const value = config(key, b.id); value.displayFields = ["summary"];
  const view = await savedView(request, `乙领域视图-${key}`, value);
  await openList(page, new URLSearchParams({ q: key, domainId: a.id }).toString());
  await expect(page.getByRole("region", { name: "个人记录列表" }).getByRole("link", { name: outside.title, exact: true })).toBeVisible();
  await expect(page.getByLabel("新记录保存领域")).toHaveValue(a.id);
  const title = `仍属甲的草稿-${key}`;
  await page.getByLabel("新记录标题").fill(title); await page.getByLabel("新记录内容").fill("切换视图时保留的原文。");
  await page.getByLabel("新记录别名").fill(`草稿名称-${key}`);
  const before = await facts();
  await page.getByRole("button", { name: `打开视图“${view.title}”`, exact: true }).click();
  await expect(page.getByLabel("筛选领域")).toHaveValue(b.id);
  await expect(page.getByLabel("新记录保存领域")).toHaveValue(a.id);
  await expect(page.getByLabel("新记录标题")).toHaveValue(title);
  await expect(page.getByLabel("新记录内容")).toHaveValue("切换视图时保留的原文。");
  await expect(page.getByLabel("新记录别名")).toHaveValue(`草稿名称-${key}`);
  await expect(page.getByRole("region", { name: "个人记录列表" }).getByRole("link", { name: inside.title, exact: true })).toBeVisible();
  expect(await facts()).toEqual(before);
  await page.screenshot({ path: info.outputPath("view-change-keeps-record-destination.png"), fullPage: true });
  const created = page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/knowledge-points");
  await page.getByRole("button", { name: "确认保存", exact: true }).click();
  const response = await created; expect(response.status()).toBe(200);
  const saved = (await response.json()).knowledgePoint;
  expect(saved.domainIds).toContain(a.id); expect(saved.domainIds).not.toContain(b.id);
  await expect(page.getByRole("region", { name: "个人记录列表" }).getByRole("link", { name: title, exact: true })).toHaveCount(0);
  const detailRead = page.waitForResponse(r => r.request().method() === "GET" && new URL(r.url()).pathname === `/api/knowledge-points/${saved.id}`);
  await page.getByRole("link", { name: `打开已保存记录“${title}”`, exact: true }).click();
  expect((await (await detailRead).json()).knowledgePoint.id).toBe(saved.id);
  const returnTo = new URL(page.url()).searchParams.get("returnTo")!;
  const source = new URL(returnTo, "http://knowledge.invalid");
  expect(source.pathname).toBe("/learning/knowledge"); expect(source.searchParams.get("domainId")).toBe(b.id); expect(source.searchParams.get("fields")).toBe("summary");
  await page.getByRole("link", { name: "返回个人网络", exact: true }).click();
  await expect(page.getByLabel("筛选领域")).toHaveValue(b.id);
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "快速查找个人记录" });
  await dialog.getByLabel("快速查找关键词").fill(outside.title);
  const outsideRead = page.waitForResponse(r => r.request().method() === "GET" && new URL(r.url()).pathname === `/api/knowledge-points/${outside.id}`);
  await dialog.getByRole("link", { name: outside.title, exact: true }).click();
  expect((await (await outsideRead).json()).knowledgePoint.id).toBe(outside.id);
  const returningList = page.waitForRequest(r => r.method() === "GET" && new URL(r.url()).pathname === "/api/knowledge-points" && new URL(r.url()).searchParams.get("q") === key && new URL(r.url()).searchParams.get("domainId") === b.id && new URL(r.url()).searchParams.get("sort") === "title_asc" && new URL(r.url()).searchParams.get("offset") === "0" && new URL(r.url()).searchParams.get("limit") === "50");
  const returnedUrl = page.waitForURL(url => url.pathname === source.pathname && url.searchParams.get("q") === key && url.searchParams.get("domainId") === b.id && url.searchParams.get("sort") === "title_asc" && url.searchParams.get("fields") === "summary");
  await page.getByRole("link", { name: "返回个人网络", exact: true }).click();
  await returnedUrl;
  const returnedResponse = await (await returningList).response();
  if (!returnedResponse) throw new Error("The returned knowledge view request did not receive an HTTP response.");
  expect(returnedResponse.status()).toBe(200); const returned = await returnedResponse.json();
  expect(returned.filters).toMatchObject({ q: key, domainId: b.id, sort: "title_asc" });
  expect(returned.knowledgePoints.map((point: { id: string }) => point.id)).toContain(inside.id);
  expect(returned.knowledgePoints.map((point: { id: string }) => point.id)).not.toContain(outside.id);
  await expect(page.getByLabel("筛选领域")).toHaveValue(b.id);
  expect(new URL(page.url()).searchParams.get("fields")).toBe("summary");
});

test("视图菜单失败不阻断记录，更新与删除冲突保留设置并要求明确新版本", async ({ page, request }) => {
  const key = crypto.randomUUID(), note = await record(request, `重试来源-${key}`, "菜单失效时仍可读取记录。");
  const view = await savedView(request, `最初视图-${key}`, config(key));
  let rejectViews = true;
  await page.route("**/api/knowledge-points/views?*", route => rejectViews ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "视图菜单读取失败，请重试。" }) }) : route.continue());
  await openList(page, `q=${key}`);
  const menu = page.getByRole("region", { name: "已保存的检索视图" });
  await expect(menu.getByText("视图菜单读取失败，请重试。", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "个人记录列表" }).getByRole("link", { name: note.title, exact: true })).toBeVisible();
  rejectViews = false; await menu.getByRole("button", { name: "重试读取已保存视图", exact: true }).click();
  await menu.getByRole("button", { name: `打开视图“${view.title}”`, exact: true }).click();
  const localTitle = `本地修改-${key}`, externalTitle = `另一窗口-${key}`;
  await page.getByLabel("视图名称").fill(localTitle);
  await page.getByLabel("筛选内容来源").selectOption("user");
  const external = config(`${key}-other`); external.filters.sourceType = "excerpt";
  expect((await request.patch(viewPath(view.id), { data: { expectedVersion: 1, title: externalTitle, config: external } })).status()).toBe(200);
  const before = await facts();
  await menu.getByRole("button", { name: "更新当前视图", exact: true }).click();
  await expect(menu.getByText("已保存视图有新版本；当前名称和检索设置仍保留。", { exact: true })).toBeVisible();
  await expect(page.getByLabel("视图名称")).toHaveValue(localTitle);
  await expect(page.getByLabel("筛选内容来源")).toHaveValue("user");
  expect((await (await request.get(viewPath(view.id))).json()).view.version).toBe(2);
  await menu.getByRole("button", { name: "采用最新版本作为更新基础", exact: true }).click();
  await expect(page.getByLabel("视图名称")).toHaveValue(localTitle);
  const updatedView = page.waitForResponse(r => r.request().method() === "PATCH" && new URL(r.url()).pathname === viewPath(view.id) && r.request().postDataJSON()?.expectedVersion === 2);
  await menu.getByRole("button", { name: "更新当前视图", exact: true }).click();
  const updatedResponse = await updatedView; expect(updatedResponse.status()).toBe(200);
  const updated = (await updatedResponse.json()).view;
  const localConfig = config(key); localConfig.filters.sourceType = "user";
  expect(updated.version).toBe(3); expect(updated.title).toBe(localTitle); expect(updated.config).toEqual(localConfig);
  await expect(menu.getByText("检索视图已保存，记录内容没有改变。", { exact: true })).toBeVisible();
  const saved = (await (await request.get(viewPath(view.id))).json()).view;
  expect(saved.version).toBe(3); expect(saved.title).toBe(localTitle); expect(saved.config.filters.sourceType).toBe("user");
  await expect(menu.getByRole("button", { name: `删除视图“${localTitle}”，保留记录`, exact: true })).toBeEnabled();
  const finalTitle = `删除前新版本-${key}`;
  expect((await request.patch(viewPath(view.id), { data: { expectedVersion: 3, title: finalTitle, config: config(key) } })).status()).toBe(200);
  await menu.getByRole("button", { name: `删除视图“${localTitle}”，保留记录`, exact: true }).click();
  await expect(menu.getByText("已保存视图有新版本；当前名称和检索设置仍保留。", { exact: true })).toBeVisible();
  expect((await (await request.get(viewPath(view.id))).json()).view.version).toBe(4);
  await menu.getByRole("button", { name: "重新读取视图列表", exact: true }).click();
  await menu.getByRole("button", { name: `删除视图“${finalTitle}”，保留记录`, exact: true }).click();
  await expect(menu.getByRole("article", { name: `检索视图：${finalTitle}`, exact: true })).toHaveCount(0);
  expect((await request.get(viewPath(view.id))).status()).toBe(404); expect(await facts()).toEqual(before);
});

test("失效主题与未来或损坏配置保持不可运行，不会默清条件扩大查询", async ({ page, request }) => {
  const key = crypto.randomUUID(), note = await record(request, `失效条件记录-${key}`, "记录保持存在。");
  const topicResponse = await request.post("/api/knowledge-collections", { data: { title: `失效主题-${key}` } });
  expect(topicResponse.status()).toBe(200); const topic = (await topicResponse.json()).collection;
  expect((await request.patch(`/api/knowledge-collections/${topic.id}`, { data: { knowledgePointId: note.id } })).status()).toBe(200);
  const view = await savedView(request, `主题视图-${key}`, config(key, "", topic.id));
  const futureTitle = `未来配置-${key}`, brokenTitle = `缺失配置-${key}`;
  await db.savedKnowledgeView.createMany({ data: [
    { id: `future-${key}`, title: futureTitle, schemaVersion: 2, configJson: '{"future":true}', version: 1, updatedAt: new Date() },
    { id: `broken-${key}`, title: brokenTitle, schemaVersion: 1, configJson: "{}", version: 1, updatedAt: new Date() }
  ] });
  const before = await facts();
  expect((await request.delete(`/api/knowledge-collections/${topic.id}`)).status()).toBe(200);
  const unavailable = (await (await request.get(viewPath(view.id))).json()).view;
  expect(unavailable.config.filters.collectionId).toBe(topic.id); expect(unavailable.unavailableReason).toBeTruthy();
  await openList(page, new URLSearchParams({ q: key, collectionId: topic.id }).toString());
  const menu = page.getByRole("region", { name: "已保存的检索视图" });
  await expect(page.getByLabel("筛选主题")).toHaveValue(topic.id);
  for (const name of [view.title, futureTitle, brokenTitle]) await expect(menu.getByRole("button", { name: `打开视图“${name}”`, exact: true })).toBeDisabled();
  await expect(page.getByRole("region", { name: "个人记录列表" }).getByRole("link", { name: note.title, exact: true })).toHaveCount(0);
  await page.getByLabel("视图名称").fill(`不能保存-${key}`);
  await expect(menu.getByRole("button", { name: "保存为新视图", exact: true })).toBeDisabled();
  const result = await request.get(`/api/knowledge-points?q=${key}&collectionId=${topic.id}`), rows = await result.json();
  expect(result.status()).toBe(200); expect(rows.knowledgePoints).toEqual([]); expect(rows.filters.collectionId).toBe(topic.id); expect(rows.unavailableReason).toBeTruthy();
  await page.getByLabel("筛选主题").selectOption("");
  await expect(page.getByRole("region", { name: "个人记录列表" }).getByRole("link", { name: note.title, exact: true })).toBeVisible();
  await menu.getByRole("button", { name: `删除视图“${futureTitle}”，保留记录`, exact: true }).click();
  await expect(menu.getByRole("article", { name: `检索视图：${futureTitle}`, exact: true })).toHaveCount(0);
  expect(await facts()).toEqual(before);
  expect((await db.savedKnowledgeView.findUniqueOrThrow({ where: { id: `broken-${key}` } })).configJson).toBe("{}");
});
