import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
test.afterAll(async () => db.$disconnect());

test("全文和同修订多段共存，重复段落不折叠，旧段落重载与反向回看保真", async ({ page, request }, info) => {
  const key = crypto.randomUUID();
  const sourceBody = "第一段：😀明确条件。\r\n同一段内的第二行。  \r\n\r\n重复原文。\r\n\r\n重复原文。\r\n\r\n末段暂不引用。";
  async function record(title: string, body: string) {
    const response = await request.post("/api/knowledge-points", { data: { requestId: crypto.randomUUID(), title: `${title}-${key}`, body, kind: "note" } });
    expect(response.ok()).toBe(true);
    return (await response.json()).knowledgePoint;
  }
  const source = await record("段落来源", sourceBody), target = await record("段落使用", "我把实际条件与例子对应起来。");
  await page.goto(`/learning/knowledge/${target.id}`);
  await page.getByText("添加记录引用", { exact: true }).click();
  await page.getByLabel("搜索要引用的记录").fill(source.title);
  await page.getByRole("button", { name: `引用“${source.title}”`, exact: true }).click();
  await page.getByText(`选择“${source.title}”的段落`, { exact: true }).click();
  for (const n of [1, 2, 3]) await page.getByRole("button", { name: `引用“${source.title}”的第${n}段`, exact: true }).click();
  await page.getByRole("button", { name: `取消新增引用“${source.title}”的第2段`, exact: true }).click();
  await expect(page.getByRole("article", { name: `草稿引用：${source.title} · 第2段`, exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: `引用“${source.title}”的第2段`, exact: true }).click();
  expect(await db.knowledgePointRevision.count({ where: { knowledgePointId: target.id } })).toBe(1);
  expect((await (await request.get(`/api/knowledge-points/${source.id}/context`)).json()).backlinks.page.total).toBe(0);
  const savedRequest = page.waitForRequest(r => r.method() === "PATCH" && new URL(r.url()).pathname === `/api/knowledge-points/${target.id}`);
  await page.getByRole("button", { name: "确认保存新修订", exact: true }).click();
  const submitted = (await savedRequest).postDataJSON();
  expect(submitted.sources).toHaveLength(4);
  expect(submitted.sources.filter((s: { selector?: unknown }) => s.selector)).toHaveLength(3);
  expect(submitted.sources.every((s: { body?: unknown; selector?: object }) => !Object.hasOwn(s, "body") && (!s.selector || !Object.hasOwn(s.selector, "quote")))).toBe(true);
  const context = page.getByRole("region", { name: "记录引用与反向引用" });
  await expect(context.getByRole("article", { name: `已保存引用：${source.title} · 第1段`, exact: true })).toBeVisible();
  await expect(context.getByRole("article", { name: `已保存引用：${source.title} · 第2段`, exact: true })).toBeVisible();
  await expect(context.getByRole("article", { name: `已保存引用：${source.title} · 第3段`, exact: true })).toBeVisible();
  const before = (await (await request.get(`/api/knowledge-points/${target.id}`)).json()).knowledgePoint.sources;
  expect(before).toHaveLength(4);
  const pieces = before.filter((s: { selector?: unknown }) => s.selector);
  expect(pieces.map((s: { selector: { quote: string } }) => s.selector.quote).filter((s: string) => s === "重复原文。")).toHaveLength(2);
  expect(new Set(pieces.map((s: { selector: { start: number } }) => s.selector.start)).size).toBe(3);
  expect(pieces.find((s: { selector: { start: number } }) => s.selector.start === 0).selector.quote).toBe("第一段：😀明确条件。\r\n同一段内的第二行。  ");
  const updated = await request.patch(`/api/knowledge-points/${source.id}`, { data: { expectedRevisionId: source.currentRevisionId, title: source.title, body: "当前版本已经改写，旧引用仍保留原文。", kind: "note" } });
  expect(updated.ok()).toBe(true);
  await page.reload();
  await expect(context.getByRole("article", { name: `已保存引用：${source.title} · 第1段`, exact: true })).toContainText("第一段：😀明确条件。");
  expect((await (await request.get(`/api/knowledge-points/${target.id}`)).json()).knowledgePoint.sources).toEqual(before);
  await page.screenshot({ path: info.outputPath("fixed-paragraph-previews.png"), fullPage: true });
  await page.goto(`/learning/knowledge/${source.id}`);
  await expect(context.getByRole("link", { name: target.title, exact: true })).toBeVisible();
  const backwards = (await (await request.get(`/api/knowledge-points/${source.id}/context`)).json()).backlinks;
  expect(backwards.page.total).toBe(1);
  expect(backwards.items[0].sources).toEqual(before);
});

test("选择器伪造不创建记录，保存冲突保留本地段落草稿并显式合并", async ({ page, request }) => {
  const key = crypto.randomUUID();
  async function record(title: string, body: string) {
    const response = await request.post("/api/knowledge-points", { data: { requestId: crypto.randomUUID(), title: `${title}-${key}`, body, kind: "note" } });
    expect(response.ok()).toBe(true);
    return (await response.json()).knowledgePoint;
  }
  const source = await record("冲突来源", "选中的真实段落。\n\n另一段原文。"), target = await record("冲突目标", "原始目标正文。");
  const count = await db.knowledgePoint.count();
  const forged = await request.post("/api/knowledge-points", { data: { requestId: crypto.randomUUID(), title: "不能保存的伪造来源", body: "伪造不应形成记录", sources: [{ kind: "record", knowledgePointId: source.id, revisionId: source.currentRevisionId, selector: { type: "paragraph-v1", start: 0, end: source.body.indexOf("\n"), quoteHash: "0".repeat(64), quote: "自报错误文字" } }] } });
  expect(forged.status()).toBe(400);
  expect(await db.knowledgePoint.count()).toBe(count);
  await page.goto(`/learning/knowledge/${target.id}`);
  await page.getByText("添加记录引用", { exact: true }).click();
  await page.getByLabel("搜索要引用的记录").fill(source.title);
  await page.getByText(`选择“${source.title}”的段落`, { exact: true }).click();
  await page.getByRole("button", { name: `引用“${source.title}”的第1段`, exact: true }).click();
  await page.getByLabel("修订记录内容").fill("浏览器保留的正文草稿。");
  const outside = await request.patch(`/api/knowledge-points/${target.id}`, { data: { expectedRevisionId: target.currentRevisionId, title: target.title, body: "另一个窗口的新正文。", kind: "note", sources: [] } });
  expect(outside.ok()).toBe(true);
  await page.getByRole("button", { name: "确认保存新修订", exact: true }).click();
  await expect(page.getByText("记录已有较新修订，你的编辑草稿仍保留。请比较并合并内容，再明确选择新的保存基础。", { exact: true })).toBeVisible();
  await expect(page.getByLabel("修订记录内容")).toHaveValue("浏览器保留的正文草稿。");
  await expect(page.getByRole("article", { name: `草稿引用：${source.title} · 第1段`, exact: true })).toBeVisible();
  expect(await db.knowledgePointRevision.count({ where: { knowledgePointId: target.id } })).toBe(2);
  expect((await (await request.get(`/api/knowledge-points/${target.id}`)).json()).knowledgePoint.sources).toEqual([]);
  await page.getByRole("button", { name: "已合并，使用最新修订作为保存基础", exact: true }).click();
  await page.getByRole("button", { name: "确认保存新修订", exact: true }).click();
  await expect(page.getByRole("article", { name: `已保存引用：${source.title} · 第1段`, exact: true })).toBeVisible();
  const final = (await (await request.get(`/api/knowledge-points/${target.id}`)).json()).knowledgePoint;
  expect(final.body).toBe("浏览器保留的正文草稿。");
  expect(final.sources[0].selector.quote).toBe("选中的真实段落。");
  expect(await db.knowledgePointRevision.count({ where: { knowledgePointId: target.id } })).toBe(3);
});
