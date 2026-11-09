import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
test.afterAll(async () => db.$disconnect());

test("类型视图、搜索地址恢复与全局快捷查找使用同一记录", async ({ page, request }) => {
  const key = crypto.randomUUID();
  const records = [];
  for (const [suffix, kind] of [["Z-疑问", "question"], ["A-理解", "understanding"], ["B-疑问", "question"]]) {
    const response = await request.post("/api/knowledge-points", { data: { requestId: crypto.randomUUID(), title: `${key}-${suffix}`, body: `需要找回的原始解释 ${key}`, kind } });
    expect(response.ok()).toBe(true);
    records.push((await response.json()).knowledgePoint);
  }
  const before = { ai: await db.aiCallLog.count(), revisions: await db.knowledgePointRevision.count(), audit: await db.learningProgress.count() };
  await page.goto(`/learning/knowledge?q=${key}&kind=question&sort=title_asc`);
  await expect(page.getByLabel("检索个人记录")).toHaveValue(key);
  await expect(page.getByLabel("筛选记录类型")).toHaveValue("question");
  await expect(page.getByRole("link", { name: `${key}-A-理解`, exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: `${key}-B-疑问`, exact: true })).toBeVisible();
  const recordLinks = page.locator('article a');
  await expect(recordLinks).toHaveText([`${key}-B-疑问`, `${key}-Z-疑问`]);
  await page.getByLabel("筛选记录类型").selectOption("understanding");
  await expect(recordLinks).toHaveText([`${key}-A-理解`]);
  await expect(page).toHaveURL(/kind=understanding/);
  await page.reload();
  await expect(page.getByLabel("筛选记录类型")).toHaveValue("understanding");
  await expect(recordLinks).toHaveText([`${key}-A-理解`]);
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "快速查找个人记录" });
  await expect(dialog).toBeVisible();
  await page.getByLabel("快速查找关键词").fill(`${key}-Z`);
  await dialog.getByRole("link", { name: `${key}-Z-疑问`, exact: true }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(`/learning/knowledge/${records[0].id}`);
  await expect(dialog).not.toBeVisible();
  expect(await db.aiCallLog.count()).toBe(before.ai);
  expect(await db.knowledgePointRevision.count()).toBe(before.revisions);
  expect(await db.learningProgress.count()).toBe(before.audit);
});

test("快捷查找读取失败可重试，关闭时退出对话框", async ({ page, request }) => {
  const key = crypto.randomUUID();
  const response = await request.post("/api/knowledge-points", { data: { requestId: key, title: `快捷恢复-${key}`, body: "读取失败不影响已保存记录", kind: "note" } });
  expect(response.ok()).toBe(true);
  await page.goto("/learning/knowledge");
  let fail = true;
  await page.route("**/api/knowledge-points?*", async route => {
    const params = new URL(route.request().url()).searchParams;
    if (params.get("limit") === "20" && fail) {
      fail = false;
      await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "临时读取失败" }) });
    } else await route.continue();
  });
  await page.getByRole("button", { name: /^查找记录/ }).click();
  const dialog = page.getByRole("dialog", { name: "快速查找个人记录" });
  await expect(dialog.getByRole("alert")).toContainText("临时读取失败");
  await dialog.getByRole("button", { name: "重试查找" }).click();
  await page.getByLabel("快速查找关键词").fill(key);
  await expect(dialog.getByRole("link", { name: `快捷恢复-${key}`, exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});

test("引用选择、固定修订回看、反向引用与两层图谱形成真实阅读闭环", async ({ page, request }, info) => {
  const key = crypto.randomUUID();
  async function create(title: string, body: string, sourceType = "user") {
    const response = await request.post("/api/knowledge-points", { data: { requestId: crypto.randomUUID(), title: `${title}-${key}`, body, kind: "understanding", sourceType, acceptAiContent: sourceType === "accepted_ai" } });
    expect(response.ok()).toBe(true);
    return (await response.json()).knowledgePoint;
  }
  const original = await create("条件概率", "条件改变后，分母应使用条件事件的范围。");
  const note = await create("筛查表解释", "需要把表格名单与条件事件对应起来。", "accepted_ai");
  const second = await create("名单计数", "同一份名单可能出现在不同条件中。");
  const excluded = await create("尚未确认的联系", "这条候选不进入局部图谱。");
  for (const [from, to] of [[original, note], [note, second]]) {
    expect((await request.post("/api/knowledge-points/relations", { data: { fromKnowledgePointId: from.id, toKnowledgePointId: to.id, type: "related", detail: "通过名单范围比较这两个解释" } })).ok()).toBe(true);
  }
  await db.knowledgeGraphEdge.create({ data: { fromKnowledgePointId: original.id, toKnowledgePointId: excluded.id, relationType: "related", status: "candidate", detail: "尚未接受的AI候选" } });
  await page.goto(`/learning/knowledge/${note.id}`);
  await page.getByText("添加记录引用", { exact: true }).click();
  await page.getByLabel("搜索要引用的记录").fill(`条件概率-${key}`);
  await page.getByRole("button", { name: `引用“条件概率-${key}”`, exact: true }).click();
  await expect(page.getByRole("article", { name: `草稿引用：${original.title} · 全文`, exact: true })).toBeVisible();
  // Selection is a draft: no backlink exists before explicit revision save.
  let context = await (await request.get(`/api/knowledge-points/${original.id}/context`)).json();
  expect(context.backlinks.page.total).toBe(0);
  await page.getByRole("button", { name: "确认保存新修订", exact: true }).click();
  const quoted = page.getByRole("region", { name: "记录引用与反向引用" });
  await expect(quoted.getByRole("link", { name: `查看“条件概率-${key}”当前版本` })).toBeVisible();
  expect((await (await request.get(`/api/knowledge-points/${note.id}`)).json()).knowledgePoint.sourceType).toBe("accepted_ai");
  await quoted.getByText("展开引用时的原文", { exact: true }).click();
  await expect(quoted.getByText(original.body, { exact: true })).toBeVisible();
  const changed = await request.patch(`/api/knowledge-points/${original.id}`, { data: { expectedRevisionId: original.currentRevisionId, title: original.title, body: "我后来补充：需要先明确条件事件并检查其概率非零。", kind: original.kind } });
  expect(changed.ok()).toBe(true);
  await page.reload();
  await quoted.getByText("展开引用时的原文", { exact: true }).click();
  await expect(quoted.getByText(original.body, { exact: true })).toBeVisible();
  await page.goto(`/learning/knowledge/${original.id}`);
  await expect(quoted.getByRole("link", { name: note.title, exact: true })).toBeVisible();
  const graph = page.getByRole("region", { name: "局部知识图谱" });
  await expect(graph.getByRole("link", { name: `打开记录：${note.title}`, exact: true })).toBeVisible();
  await expect(graph.getByRole("link", { name: `打开记录：${second.title}`, exact: true })).toHaveCount(0);
  await graph.getByLabel("图谱深度").selectOption("2");
  await expect(graph.getByRole("link", { name: `打开记录：${second.title}`, exact: true })).toBeVisible();
  await expect(graph.getByRole("link", { name: `打开记录：${excluded.title}`, exact: true })).toHaveCount(0);
  await page.screenshot({ path: info.outputPath("record-reading.png"), fullPage: true });
  await graph.getByRole("link", { name: `打开记录：${second.title}`, exact: true }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(`/learning/knowledge/${second.id}`);
  context = await (await request.get(`/api/knowledge-points/${original.id}/context`)).json();
  expect(context.backlinks.items[0].sources[0].revisionId).toBe(original.currentRevisionId);
});

test("引用、图谱和快捷查找返回原筛选视图，恶意返回地址不能外跳", async ({ page, request }) => {
  const key = crypto.randomUUID();
  const domain = await db.domain.create({ data: { name: `视图往返-${key}`, goal: "保留知识阅读位置" } });
  async function record(label: string, sources: unknown[] = []) {
    const response = await request.post("/api/knowledge-points", { data: { requestId: crypto.randomUUID(), title: `${label}-${key}`, body: `视图往返原文 ${key}`, kind: "question", domainId: domain.id, sources } });
    expect(response.ok()).toBe(true);
    return (await response.json()).knowledgePoint;
  }
  const b = await record("B来源");
  const a = await record("A阅读", [{ kind: "record", knowledgePointId: b.id, revisionId: b.currentRevisionId }]);
  const c = await record("C联系");
  expect((await request.post("/api/knowledge-points/relations", { data: { fromKnowledgePointId: b.id, toKnowledgePointId: c.id, type: "related", detail: "把来源与使用情境相互对照" } })).ok()).toBe(true);
  const before = { records: await db.knowledgePoint.count(), revisions: await db.knowledgePointRevision.count(), ai: await db.aiCallLog.count(), audit: await db.learningProgress.count() };
  await page.goto(`/learning/knowledge?q=${key}&domainId=${domain.id}&kind=question&sort=title_asc`);
  await page.getByRole("link", { name: a.title, exact: true }).click();
  const context = page.getByRole("region", { name: "记录引用与反向引用" });
  await context.getByRole("link", { name: `查看“${b.title}”当前版本`, exact: true }).click();
  const graph = page.getByRole("region", { name: "局部知识图谱" });
  await graph.getByRole("link", { name: `打开记录：${c.title}`, exact: true }).click();
  await page.getByRole("link", { name: "返回个人网络", exact: true }).click();
  await expect(page.getByLabel("检索个人记录")).toHaveValue(key);
  await expect(page.getByLabel("筛选领域")).toHaveValue(domain.id);
  await expect(page.getByLabel("筛选记录类型")).toHaveValue("question");
  await expect(page.getByLabel("记录排序")).toHaveValue("title_asc");
  await page.getByRole("link", { name: a.title, exact: true }).click();
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "快速查找个人记录" });
  await page.getByLabel("快速查找关键词").fill(c.title);
  await dialog.getByRole("link", { name: c.title, exact: true }).click();
  await page.getByRole("link", { name: "返回个人网络", exact: true }).click();
  await expect(page.getByLabel("检索个人记录")).toHaveValue(key);
  await expect(page.getByLabel("筛选领域")).toHaveValue(domain.id);
  await expect(page.getByLabel("筛选记录类型")).toHaveValue("question");
  await page.goto(`/learning/domains/${domain.id}/knowledge-graph`);
  await expect(page.getByLabel("筛选领域")).toHaveValue(domain.id);
  await page.getByLabel("筛选领域").selectOption("");
  await expect.poll(() => new URL(page.url()).searchParams.get("domainId")).toBe("");
  await page.reload();
  await expect(page.getByLabel("筛选领域")).toHaveValue("");
  await page.goto(`/learning/knowledge/${a.id}?returnTo=${encodeURIComponent("https://example.org/redirect")}`);
  await expect(page.getByRole("link", { name: "返回个人网络", exact: true })).toHaveAttribute("href", "/learning/knowledge");
  await page.getByRole("link", { name: "返回个人网络", exact: true }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe("/learning/knowledge");
  expect(await db.knowledgePoint.count()).toBe(before.records);
  expect(await db.knowledgePointRevision.count()).toBe(before.revisions);
  expect(await db.aiCallLog.count()).toBe(before.ai);
  expect(await db.learningProgress.count()).toBe(before.audit);
});
