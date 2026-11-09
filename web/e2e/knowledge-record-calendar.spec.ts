import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import type { KnowledgeRecordCalendarResult } from "../src/lib/learning/knowledgeCalendarContracts";

const db = new PrismaClient();
test.afterAll(async () => db.$disconnect());
const day = "2026-03-08", month = "2026-03";
const pointPath = (id: string) => `/api/knowledge-points/${encodeURIComponent(id)}`;
async function record(request: APIRequestContext, title: string, body: string, extra: object = {}) {
  const response = await request.post("/api/knowledge-points", { data: { requestId: crypto.randomUUID(), title, body, ...extra } });
  expect(response.status()).toBe(200); return (await response.json()).knowledgePoint;
}
async function calendar(request: APIRequestContext, key: string, extra: Record<string, string> = {}): Promise<KnowledgeRecordCalendarResult> {
  const params = new URLSearchParams({ q: key, month, dateField: "recorded", timeZone: "UTC", ...extra });
  const response = await request.get(`/api/knowledge-points/calendar?${params}`); expect(response.status()).toBe(200); return response.json();
}
async function facts() {
  return { records: await db.knowledgePoint.count(), revisions: await db.knowledgePointRevision.count(), audit: await db.learningProgress.count(), relations: await db.knowledgeGraphEdge.count(), ai: await db.aiCallLog.count(), views: await db.savedKnowledgeView.count(), templates: await db.knowledgeRecordTemplate.count() };
}
async function openCalendar(page: Page, key: string, extra: Record<string, string> = {}, status = 200) {
  const params = new URLSearchParams({ q: key, calendarMonth: month, dateField: "recorded", ...extra });
  const reading = page.waitForResponse(r => r.request().method() === "GET" && new URL(r.url()).pathname === "/api/knowledge-points/calendar" && new URL(r.url()).searchParams.get("q") === key && new URL(r.url()).searchParams.get("month") === params.get("calendarMonth"));
  await page.goto(`/learning/knowledge?${params}`); const response = await reading; expect(response.status()).toBe(status); await response.json();
  return page.getByRole("region", { name: "个人记录月历", exact: true });
}
async function openDetail(page: Page, id: string) {
  const reading = page.waitForResponse(r => r.request().method() === "GET" && new URL(r.url()).pathname === pointPath(id));
  await page.goto(`/learning/knowledge/${encodeURIComponent(id)}`); const response = await reading; expect(response.status()).toBe(200); await response.json();
  await expect(page.getByRole("button", { name: "确认保存新修订", exact: true })).toBeVisible();
}
async function saveRevision(page: Page, id: string, expectedRevisionId: string, status = 200) {
  const saving = page.waitForResponse(r => r.request().method() === "PATCH" && new URL(r.url()).pathname === pointPath(id) && r.request().postDataJSON()?.expectedRevisionId === expectedRevisionId);
  await page.getByRole("button", { name: "确认保存新修订", exact: true }).click(); const response = await saving; expect(response.status()).toBe(status);
  return { result: await response.json(), input: response.request().postDataJSON() };
}
async function malformedRecord(key: string) {
  const point = await db.knowledgePoint.create({ data: { title: `坏日期-${key}`, recordKind: "note", masteryStatus: "seen" } });
  const revision = await db.knowledgePointRevision.create({ data: { knowledgePointId: point.id, sequence: 1, title: point.title, body: "原正文仍可阅读。", sourceType: "user", aliasesJson: '["原别名"]', recordDate: "2026-02-30", recordDateTimeZone: "UTC" } });
  await db.knowledgePoint.update({ where: { id: point.id }, data: { currentRevisionId: revision.id } });
  return { point, revision };
}

test("本人日期整月计数和单日分页一致，跨时区不移动日期且读取不写事实", async ({ page, request }, info) => {
  const key = crypto.randomUUID();
  const a = await record(request, `东京记录-${key}`, "同一归档日。", { recordDate: { date: day, timeZone: "Asia/Tokyo" } });
  const b = await record(request, `洛杉矶记录-${key}`, "同一归档日。", { recordDate: { date: day, timeZone: "America/Los_Angeles" } });
  const other = await record(request, `另一天-${key}`, "另一天。", { recordDate: { date: "2026-03-09", timeZone: "UTC" } });
  await record(request, `未指定-${key}`, "不能从创建时间回填。"); await malformedRecord(key);
  const before = await facts(), result = await calendar(request, key);
  expect(result.total).toBe(3); expect(result.days.find(row => row.date === day)?.count).toBe(2); expect(result.undatedCount).toBe(1); expect(result.unavailableDateCount).toBe(1);
  expect((await calendar(request, key, { dateField: "created" })).total).toBe(0);
  const panel = await openCalendar(page, key);
  const selecting = page.waitForResponse(r => r.request().method() === "GET" && new URL(r.url()).pathname === "/api/knowledge-points" && new URL(r.url()).searchParams.get("dateFrom") === day && new URL(r.url()).searchParams.get("dateTo") === day);
  await panel.getByRole("button", { name: `查看 ${day}，2 条记录`, exact: true }).click(); const selected = await selecting; expect(selected.status()).toBe(200); const rows = await selected.json();
  expect(rows.page.total).toBe(2); expect(rows.knowledgePoints.map((row: { id: string }) => row.id).sort()).toEqual([a.id, b.id].sort());
  const list = page.getByRole("region", { name: "个人记录列表", exact: true });
  await expect(list.getByRole("link", { name: a.title, exact: true })).toBeVisible(); await expect(list.getByRole("link", { name: other.title, exact: true })).toHaveCount(0);
  await page.getByLabel("显示本人记录日期", { exact: true }).check();
  await expect(list.getByRole("article", { name: `个人记录：${a.title}`, exact: true })).toContainText("Asia/Tokyo");
  await page.getByLabel("日期时区", { exact: true }).fill("America/Los_Angeles");
  await expect(panel.getByRole("button", { name: `查看 ${day}，2 条记录`, exact: true })).toBeDisabled();
  const changed = page.waitForResponse(r => r.request().method() === "GET" && new URL(r.url()).pathname === "/api/knowledge-points/calendar" && new URL(r.url()).searchParams.get("timeZone") === "America/Los_Angeles");
  await page.getByRole("button", { name: "应用日期筛选", exact: true }).click(); expect((await changed).status()).toBe(200);
  await expect(panel.getByRole("button", { name: `查看 ${day}，2 条记录`, exact: true })).toBeEnabled();
  expect((await calendar(request, key, { timeZone: "America/Los_Angeles" })).days).toEqual(result.days);
  expect(await facts()).toEqual(before); await page.screenshot({ path: info.outputPath("assigned-date-month-and-day.png"), fullPage: true });
});

test("补写日期单独构成草稿，切换领域不搬移且重复确认不造第二条记录", async ({ page, request }, info) => {
  const key = crypto.randomUUID(), a = await db.domain.create({ data: { name: `补写甲-${key}` } }), b = await db.domain.create({ data: { name: `补写乙-${key}` } });
  await page.clock.setFixedTime(new Date("2026-11-09T12:34:00Z"));
  const panel = await openCalendar(page, key, { domainId: a.id }); const before = await facts();
  await panel.getByRole("button", { name: `查看 ${day}，0 条记录`, exact: true }).click(); await panel.getByRole("button", { name: `为 ${day} 填写记录`, exact: true }).click();
  await expect(page.getByLabel("本人指定记录日期", { exact: true })).toHaveValue(day);
  await page.getByLabel("筛选领域").selectOption(b.id); await expect(page.getByLabel("新记录保存领域")).toHaveValue(a.id);
  const title = `补写记录-${key}`; await page.getByLabel("新记录标题").fill(title); await page.getByLabel("新记录内容", { exact: true }).fill("本人补写，不改系统创建时间。");
  await page.getByLabel("新记录别名").fill(`补写别名-${key}`); await page.getByLabel("新记录类型").selectOption("experience");
  await page.getByText("使用记录模板", { exact: true }).click(); await page.getByRole("button", { name: "选择示例“整理疑问”", exact: true }).click(); await page.getByLabel("本次模板预览时区").fill("UTC"); await page.getByRole("button", { name: "预览模板", exact: true }).click();
  await expect(page.getByLabel("模板预览正文")).toContainText("2026-11-09"); expect(await page.getByLabel("模板预览正文").textContent()).not.toContain(day);
  await expect(page.getByLabel("本人指定记录日期", { exact: true })).toHaveValue(day); expect(await facts()).toEqual(before);
  const saving = page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/knowledge-points");
  await page.getByRole("button", { name: "确认保存", exact: true }).click(); const response = await saving; expect(response.status()).toBe(200); const saved = (await response.json()).knowledgePoint;
  expect(saved.recordDate).toEqual({ date: day, timeZone: "UTC" }); expect(saved.domainIds).toContain(a.id); expect(saved.domainIds).not.toContain(b.id); expect(saved.kind).toBe("experience"); expect(saved.aliases).toEqual([`补写别名-${key}`]); expect(saved.body).toBe("本人补写，不改系统创建时间。"); expect(saved.createdAt.slice(0, 10)).not.toBe(day);
  await expect(page.getByLabel("本人指定记录日期", { exact: true })).toHaveValue(day);
  await expect(page.getByLabel("新记录标题")).toHaveValue(""); await expect(page.getByLabel("新记录内容", { exact: true })).toHaveValue("");
  await page.getByLabel("新记录标题").fill(title); await page.getByLabel("新记录内容", { exact: true }).fill("本人补写，不改系统创建时间。"); await page.getByLabel("新记录别名").fill(`补写别名-${key}`);
  const after = await facts(), repeat = page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/knowledge-points");
  await page.getByRole("button", { name: "确认保存", exact: true }).click(); const repeated = await repeat; expect(repeated.status()).toBe(200); expect((await repeated.json()).knowledgePoint.id).toBe(saved.id); expect(await facts()).toEqual(after);
  const detail = page.waitForResponse(r => r.request().method() === "GET" && new URL(r.url()).pathname === pointPath(saved.id));
  await page.getByRole("link", { name: `打开已保存记录“${title}”`, exact: true }).click(); expect((await detail).status()).toBe(200);
  const back = new URL(new URL(page.url()).searchParams.get("returnTo")!, "http://knowledge.invalid"); expect(back.searchParams.get("calendarMonth")).toBe(month); expect(back.searchParams.get("dateField")).toBe("recorded"); expect(back.searchParams.get("domainId")).toBe(b.id);
  await page.getByRole("link", { name: "返回个人网络", exact: true }).click(); await expect(page.getByLabel("浏览月份")).toHaveValue(month); await expect(page.getByLabel("筛选领域")).toHaveValue(b.id);
  await page.screenshot({ path: info.outputPath("backdated-draft-domain-and-return.png"), fullPage: true });
});

test("日期修改与清空追加修订，旧日期、正文和固定来源保持可回看", async ({ page, request }) => {
  const key = crypto.randomUUID(), source = await record(request, `日期来源-${key}`, "固定来源原文。");
  const sourceRow = await db.knowledgePoint.findUniqueOrThrow({ where: { id: source.id } });
  const note = await record(request, `日期修订-${key}`, "正文未改。", { aliases: ["日期别名"], recordDate: { date: "2026-03-01", timeZone: "US/Pacific" }, sources: [{ kind: "record", knowledgePointId: source.id, revisionId: sourceRow.currentRevisionId }] });
  const point = await db.knowledgePoint.findUniqueOrThrow({ where: { id: note.id } }), old = await db.knowledgePointRevision.findUniqueOrThrow({ where: { id: point.currentRevisionId! } });
  await openDetail(page, note.id); await expect(page.getByLabel("本人指定记录日期", { exact: true })).toHaveValue("2026-03-01");
  await page.getByLabel("本人指定记录日期", { exact: true }).fill("2026-03-02"); await page.getByLabel("本人记录日期时区", { exact: true }).fill("UTC");
  const changed = await saveRevision(page, note.id, old.id); expect(changed.input.recordDate).toEqual({ date: "2026-03-02", timeZone: "UTC" }); expect(changed.result.knowledgePoint.recordDate).toEqual(changed.input.recordDate);
  const second = await db.knowledgePointRevision.findUniqueOrThrow({ where: { id: changed.result.knowledgePoint.currentRevisionId } }); expect(second.body).toBe(old.body); expect(second.aliasesJson).toBe(old.aliasesJson); expect(second.sourcesJson).toBe(old.sourcesJson); expect(await db.knowledgePointRevision.findUniqueOrThrow({ where: { id: old.id } })).toEqual(old);
  await expect(page.getByLabel("本人指定记录日期", { exact: true })).toHaveValue("2026-03-02");
  await page.getByRole("button", { name: "清空本人记录日期", exact: true }).click(); const cleared = await saveRevision(page, note.id, second.id); expect(cleared.input.recordDate).toBeNull(); expect(cleared.result.knowledgePoint.recordDate).toBeNull();
  const current = await db.knowledgePointRevision.findUniqueOrThrow({ where: { id: cleared.result.knowledgePoint.currentRevisionId } }); expect(current.recordDate).toBeNull(); expect(current.recordDateTimeZone).toBeNull(); expect(current.sourcesJson).toBe(old.sourcesJson); expect(await db.knowledgePointRevision.findUniqueOrThrow({ where: { id: second.id } })).toEqual(second);
  await page.reload(); await expect(page.getByLabel("本人指定记录日期", { exact: true })).toHaveValue("");
  const history = page.locator("details").filter({ has: page.getByText(`修订 1 · ${note.title} · user`, { exact: true }) }); await history.locator("summary").first().click(); await expect(history).toContainText("该修订本人记录日期：2026-03-01 · US/Pacific");
  expect((await calendar(request, key)).total).toBe(0); expect(await db.knowledgePointRevision.count({ where: { knowledgePointId: note.id } })).toBe(3);
});

test("日期409保留已编辑值，未编辑日期在明确采用最新基础后继承", async ({ page, request }) => {
  const key = crypto.randomUUID(), note = await record(request, `日期冲突-${key}`, "原正文。", { recordDate: { date: "2026-03-01", timeZone: "UTC" } });
  const initial = await db.knowledgePoint.findUniqueOrThrow({ where: { id: note.id } });
  await openDetail(page, note.id); await page.getByLabel("本人指定记录日期", { exact: true }).fill("2026-03-03"); await page.getByLabel("修订记录内容", { exact: true }).fill("本地正文保留。");
  const outside = await request.patch(pointPath(note.id), { data: { expectedRevisionId: initial.currentRevisionId, title: note.title, body: note.body, recordDate: { date: "2026-03-02", timeZone: "UTC" } } }); expect(outside.status()).toBe(200); const second = (await outside.json()).knowledgePoint;
  await saveRevision(page, note.id, initial.currentRevisionId!, 409); await expect(page.getByText("记录已有较新修订，你的编辑草稿仍保留。请比较并合并内容，再明确选择新的保存基础。", { exact: true })).toBeVisible();
  await expect(page.getByLabel("本人指定记录日期", { exact: true })).toHaveValue("2026-03-03"); await expect(page.getByLabel("修订记录内容", { exact: true })).toHaveValue("本地正文保留。");
  await page.getByRole("button", { name: "已合并，使用最新修订作为保存基础", exact: true }).click(); await expect(page.getByLabel("本人指定记录日期", { exact: true })).toHaveValue("2026-03-03");
  const kept = await saveRevision(page, note.id, second.currentRevisionId); expect(kept.result.knowledgePoint.recordDate).toEqual({ date: "2026-03-03", timeZone: "UTC" }); expect(kept.result.knowledgePoint.body).toBe("本地正文保留。");
  await openDetail(page, note.id); const third = kept.result.knowledgePoint;
  const next = await request.patch(pointPath(note.id), { data: { expectedRevisionId: third.currentRevisionId, title: note.title, body: third.body, recordDate: { date: "2026-03-04", timeZone: "Asia/Shanghai" } } }); expect(next.status()).toBe(200); const fourth = (await next.json()).knowledgePoint;
  await page.getByLabel("修订记录内容", { exact: true }).fill("只改正文，日期采用新基础。");
  const conflict = await saveRevision(page, note.id, third.currentRevisionId, 409); expect(conflict.input).not.toHaveProperty("recordDate");
  await page.getByRole("button", { name: "已合并，使用最新修订作为保存基础", exact: true }).click(); await expect(page.getByLabel("本人指定记录日期", { exact: true })).toHaveValue("2026-03-04"); await expect(page.getByLabel("本人记录日期时区", { exact: true })).toHaveValue("Asia/Shanghai");
  const inherited = await saveRevision(page, note.id, fourth.currentRevisionId); expect(inherited.input).not.toHaveProperty("recordDate"); expect(inherited.result.knowledgePoint.recordDate).toEqual({ date: "2026-03-04", timeZone: "Asia/Shanghai" }); expect(inherited.result.knowledgePoint.body).toBe("只改正文，日期采用新基础。");
});

test("旧坏日期不阻断正文且省略时保留raw，只有明确清空才改变元数据", async ({ page }) => {
  const key = crypto.randomUUID(), { point, revision } = await malformedRecord(key);
  await openDetail(page, point.id); await expect(page.getByText("当前已保存本人记录日期：不可用：本人指定日期不可读取，原值仍保留；请明确修改或清空日期。", { exact: true })).toBeVisible();
  await page.getByLabel("修订记录内容", { exact: true }).fill("正文可以继续保存，坏日期原值未改。");
  const changed = await saveRevision(page, point.id, revision.id); expect(changed.input).not.toHaveProperty("recordDate");
  const second = await db.knowledgePointRevision.findUniqueOrThrow({ where: { id: changed.result.knowledgePoint.currentRevisionId } }); expect(second.recordDate).toBe("2026-02-30"); expect(second.recordDateTimeZone).toBe("UTC"); expect(changed.result.knowledgePoint.recordDateUnavailableReason).toBeTruthy(); expect(await db.knowledgePointRevision.findUniqueOrThrow({ where: { id: revision.id } })).toEqual(revision);
  await page.getByRole("button", { name: "清空本人记录日期", exact: true }).click(); const cleared = await saveRevision(page, point.id, second.id); expect(cleared.input.recordDate).toBeNull(); expect(cleared.result.knowledgePoint.recordDate).toBeNull(); expect(cleared.result.knowledgePoint).not.toHaveProperty("recordDateUnavailableReason");
  expect(await db.knowledgePointRevision.findUniqueOrThrow({ where: { id: second.id } })).toEqual(second);
});

test("月历读取失败不造假零或阻断正文，失效主题保留条件直到明确清除", async ({ page, request }) => {
  const key = crypto.randomUUID(), note = await record(request, `读取恢复-${key}`, "日期记录。", { recordDate: { date: day, timeZone: "UTC" } });
  let fail = true;
  await page.route("**/api/knowledge-points/calendar?*", route => fail ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "月历暂时不可用。" }) }) : route.continue());
  const panel = await openCalendar(page, key, {}, 503), before = await facts();
  await expect(panel.getByText("月历暂时不可用。", { exact: true })).toBeVisible(); await expect(panel.getByRole("button", { name: /^查看 \d{4}-/ })).toHaveCount(0);
  await page.getByLabel("新记录标题").fill(`保留草稿-${key}`); await page.getByLabel("新记录内容", { exact: true }).fill("月历失败也能继续编辑。");
  fail = false; const retry = page.waitForResponse(r => r.request().method() === "GET" && new URL(r.url()).pathname === "/api/knowledge-points/calendar");
  await panel.getByRole("button", { name: "重试读取月历", exact: true }).click(); expect((await retry).status()).toBe(200); await expect(panel.getByRole("button", { name: `查看 ${day}，1 条记录`, exact: true })).toBeEnabled();
  await expect(page.getByLabel("新记录内容", { exact: true })).toHaveValue("月历失败也能继续编辑。"); expect(await facts()).toEqual(before);
  const made = await request.post("/api/knowledge-collections", { data: { title: `失效日期主题-${key}` } }); expect(made.status()).toBe(200); const topic = (await made.json()).collection;
  expect((await request.patch(`/api/knowledge-collections/${topic.id}`, { data: { knowledgePointId: note.id } })).status()).toBe(200); expect((await request.delete(`/api/knowledge-collections/${topic.id}`)).status()).toBe(200);
  const unavailable = await openCalendar(page, key, { collectionId: topic.id }); await expect(unavailable.getByText(/^月历条件不可用：/)).toBeVisible(); await expect(unavailable.getByRole("button", { name: /^查看 \d{4}-/ })).toHaveCount(0); await expect(page.getByLabel("筛选主题")).toHaveValue(topic.id);
  const empty = await calendar(request, key, { collectionId: topic.id }); expect(empty.days).toEqual([]); expect(empty.unavailableReason).toBeTruthy(); expect(empty.filters.collectionId).toBe(topic.id);
  await page.getByLabel("筛选主题").selectOption(""); await expect(unavailable.getByRole("button", { name: `查看 ${day}，1 条记录`, exact: true })).toBeEnabled();
  expect(await facts()).toEqual(before);
});

test("第三日期依据能保存重开，月份与CtrlK返回保留，未应用范围不被选日覆盖", async ({ page, request }) => {
  const key = crypto.randomUUID(), note = await record(request, `月份返回-${key}`, "应能从全局查找后返回月份。", { recordDate: { date: day, timeZone: "UTC" } });
  const panel = await openCalendar(page, key); await panel.getByRole("button", { name: `查看 ${day}，1 条记录`, exact: true }).click();
  await page.getByLabel("显示本人记录日期", { exact: true }).check(); const title = `归档日期视图-${key}`; await page.getByLabel("视图名称").fill(title);
  const before = await facts(), creating = page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/knowledge-points/views");
  await page.getByRole("button", { name: "保存为新视图", exact: true }).click(); const created = await creating; expect(created.status()).toBe(200); const view = (await created.json()).view;
  expect(view.schemaVersion).toBe(1); expect(view.config.filters.date).toEqual({ mode: "range", field: "recorded", timeZone: "UTC", from: day, to: day }); expect(view.config.displayFields).toContain("recordDate"); expect(view.config).not.toHaveProperty("calendarMonth"); expect(view.config.filters).not.toHaveProperty("calendarMonth");
  await panel.getByLabel("浏览月份").fill("2026-04"); await panel.getByRole("button", { name: "查看所填月份", exact: true }).click(); await expect(panel.getByRole("button", { name: "查看 2026-04-01，0 条记录", exact: true })).toBeVisible();
  await page.getByRole("button", { name: `打开视图“${title}”`, exact: true }).click(); await expect(page.getByLabel("浏览月份")).toHaveValue(month); await expect(panel.getByRole("button", { name: `查看 ${day}，1 条记录`, exact: true })).toBeVisible();
  await page.getByLabel("起始日期").fill("2026-03-01"); await expect(panel.getByRole("button", { name: `查看 ${day}，1 条记录`, exact: true })).toBeDisabled();
  await panel.getByLabel("浏览月份").fill("2026-04"); await panel.getByRole("button", { name: "查看所填月份", exact: true }).click(); await expect(panel.getByRole("button", { name: "查看 2026-04-01，0 条记录", exact: true })).toBeDisabled();
  await expect(page.getByLabel("起始日期")).toHaveValue("2026-03-01"); await page.getByRole("button", { name: "恢复已应用日期", exact: true }).click();
  await panel.getByLabel("浏览月份").fill(month); await panel.getByRole("button", { name: "查看所填月份", exact: true }).click(); await expect(panel.getByRole("button", { name: `查看 ${day}，1 条记录`, exact: true })).toBeEnabled();
  await page.keyboard.press("Control+k"); const dialog = page.getByRole("dialog", { name: "快速查找个人记录", exact: true }); await dialog.getByLabel("快速查找关键词").fill(note.title);
  const detail = page.waitForResponse(r => r.request().method() === "GET" && new URL(r.url()).pathname === pointPath(note.id)); await dialog.getByRole("link", { name: note.title, exact: true }).click(); expect((await detail).status()).toBe(200);
  const back = new URL(new URL(page.url()).searchParams.get("returnTo")!, "http://knowledge.invalid"); expect(back.searchParams.get("calendarMonth")).toBe(month); expect(back.searchParams.get("dateField")).toBe("recorded");
  await page.getByRole("link", { name: "返回个人网络", exact: true }).click(); await expect(page.getByLabel("浏览月份")).toHaveValue(month); await expect(page.getByLabel("显示本人记录日期", { exact: true })).toBeChecked();
  const after = await facts(); expect({ ...after, views: before.views }).toEqual(before); expect(after.views).toBe(before.views + 1);
});
