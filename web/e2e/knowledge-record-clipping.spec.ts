import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { isRecordClipSnapshot, RECORD_CLIP_STORE_ENTRIES, type RecordClipPreview } from "../src/lib/learning/recordClipContracts";

const db = new PrismaClient();
test.afterAll(async () => db.$disconnect());
const previewPath = "/api/knowledge-points/clip-preview";
const pointPath = (id: string) => `/api/knowledge-points/${encodeURIComponent(id)}`;
async function facts() {
  return { records: await db.knowledgePoint.count(), revisions: await db.knowledgePointRevision.count(), audit: await db.learningProgress.count(), relations: await db.knowledgeGraphEdge.count(), ai: await db.aiCallLog.count(), sessions: await db.nodeTeachingSession.count(), teachingSources: await db.teachingSource.count() };
}
async function openClipper(page: Page, key: string, pointId?: string) {
  await page.goto(pointId ? `/learning/knowledge/${encodeURIComponent(pointId)}` : `/learning/knowledge?q=${key}`);
  await expect(page.getByRole("button", { name: pointId ? "确认保存新修订" : "确认保存", exact: true })).toBeVisible();
  return page.getByRole("region", { name: "剪藏到正文草稿", exact: true });
}
async function pastedPreview(page: Page, title: string, text: string): Promise<RecordClipPreview> {
  const clip = page.getByRole("region", { name: "剪藏到正文草稿", exact: true });
  await clip.getByLabel("剪藏读取方式", { exact: true }).selectOption("pasted");
  await clip.getByLabel("本人提供的剪藏标题", { exact: true }).fill(title);
  await clip.getByLabel("本人提供的剪藏文字", { exact: true }).fill(text);
  const reading = page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === previewPath && r.request().postDataJSON()?.title === title);
  await clip.getByRole("button", { name: "读取剪藏预览", exact: true }).click();
  const response = await reading; expect(response.status()).toBe(200); const preview: RecordClipPreview = (await response.json()).preview;
  await expect(clip.getByLabel("选择剪藏片段 1", { exact: true })).toBeVisible(); return preview;
}
async function insertFirst(page: Page) {
  const clip = page.getByRole("region", { name: "剪藏到正文草稿", exact: true });
  await clip.getByLabel("选择剪藏片段 1", { exact: true }).check();
  await clip.getByRole("button", { name: "预览所选片段的插入位置", exact: true }).click();
  await clip.getByRole("button", { name: "插入剪藏片段和来源到草稿", exact: true }).click();
}
async function position(page: Page, label: string, start: number, end = start) {
  await page.getByLabel(label, { exact: true }).evaluate((node, range) => {
    const input = node as HTMLTextAreaElement; input.focus(); input.setSelectionRange(range.start, range.end); input.dispatchEvent(new Event("select", { bubbles: true }));
  }, { start, end });
}
async function evictOldPreviews(request: APIRequestContext, key: string) {
  for (let i = 0; i <= RECORD_CLIP_STORE_ENTRIES; i++) {
    const response = await request.post(previewPath, { data: { mode: "pasted", text: `${key}-另一窗口预览-${i}` } });
    expect(response.status()).toBe(200); expect((await response.json()).preview.mode).toBe("pasted");
  }
}
async function createFixture(request: APIRequestContext, title: string, body: string, extra: object = {}) {
  const response = await request.post("/api/knowledge-points", { data: { requestId: crypto.randomUUID(), title, body, ...extra } });
  expect(response.status()).toBe(200); return (await response.json()).knowledgePoint;
}

test("人工剪藏先预览再原子插入与撤销，日期领域等字段保留且只有明确保存才写记录", async ({ page }, info) => {
  const key = crypto.randomUUID(), domain = await db.domain.create({ data: { name: `剪藏领域-${key}` } });
  const clip = await openClipper(page, key), title = `人工剪藏-${key}`, sourceTitle = `本人选文-${key}`;
  await page.getByLabel("新记录标题").fill(title); await page.getByLabel("新记录内容", { exact: true }).fill("前😀后");
  await page.getByLabel("新记录别名").fill(`选文别名-${key}`); await page.getByLabel("新记录类型").selectOption("question"); await page.getByLabel("新记录保存领域").selectOption(domain.id);
  await page.getByLabel("本人指定记录日期", { exact: true }).fill("2026-03-08");
  const before = await facts(), preview = await pastedPreview(page, sourceTitle, "首段🙂 <script>window.clipProbe=1</script>\n条件仍保留。\n\n另一段未选择。");
  expect(preview.mode).toBe("pasted"); expect(preview.obtained).toBe(false); expect(await facts()).toEqual(before);
  await position(page, "新记录内容", 3); await insertFirst(page);
  const inserted = preview.fragments[0].text, expected = `前😀${inserted}后`;
  await expect(page.getByLabel("新记录内容", { exact: true })).toHaveValue(expected);
  await expect(page.getByRole("article", { name: `待保存剪藏来源：${sourceTitle}`, exact: true })).toContainText("本人提供的文字；系统未从声明网址取得这些文字。");
  expect(await page.evaluate(() => (window as unknown as Record<string, unknown>).clipProbe)).toBeUndefined(); expect(await facts()).toEqual(before);
  await clip.getByRole("button", { name: "撤销最近一次剪藏插入", exact: true }).click();
  await expect(page.getByLabel("新记录内容", { exact: true })).toHaveValue("前😀后"); await expect(page.getByRole("article", { name: `待保存剪藏来源：${sourceTitle}`, exact: true })).toHaveCount(0);
  await position(page, "新记录内容", 3); await insertFirst(page);
  await page.getByLabel("新记录内容", { exact: true }).fill(`${expected}，后来编辑`);
  await expect(clip.getByRole("button", { name: "撤销最近一次剪藏插入", exact: true })).toBeDisabled();
  await expect(page.getByLabel("新记录标题")).toHaveValue(title); await expect(page.getByLabel("新记录别名")).toHaveValue(`选文别名-${key}`); await expect(page.getByLabel("新记录类型")).toHaveValue("question"); await expect(page.getByLabel("新记录保存领域")).toHaveValue(domain.id); await expect(page.getByLabel("本人指定记录日期", { exact: true })).toHaveValue("2026-03-08");
  expect(await facts()).toEqual(before); await page.screenshot({ path: info.outputPath("clip-preview-atomic-draft-and-undo.png"), fullPage: true });
  const saving = page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/knowledge-points");
  await page.getByRole("button", { name: "确认保存", exact: true }).click(); const response = await saving; expect(response.status()).toBe(200); const result = await response.json();
  expect(result.reused).toBe(false); expect(result.savedRevisionId).toBe(result.knowledgePoint.currentRevisionId); expect(result.knowledgePoint.body).toBe(`${expected}，后来编辑`); expect(result.knowledgePoint.aliases).toEqual([`选文别名-${key}`]); expect(result.knowledgePoint.domainIds).toContain(domain.id); expect(result.knowledgePoint.recordDate).toEqual({ date: "2026-03-08", timeZone: "UTC" });
  const snapshot = result.knowledgePoint.sources[0]; expect(isRecordClipSnapshot(snapshot)).toBe(true); expect(snapshot.mode).toBe("pasted"); expect(snapshot.obtained).toBe(false); expect(snapshot.fragments).toEqual([preview.fragments[0]]); expect(snapshot.capturedAt).toBe(preview.capturedAt); expect(snapshot).not.toHaveProperty("receiptId");
  const after = await facts(); expect(after).toEqual({ ...before, records: before.records + 1, revisions: before.revisions + 1, audit: before.audit + 1 });
});

test("修订剪藏保留CRLF及旧raw来源，409后明确合并并从当前和历史读取固定片段", async ({ page, request }, info) => {
  const key = crypto.randomUUID(), title = `剪藏并发-${key}`, original = "甲😀\r\n乙\r丙";
  const rawSources = [{ kind: "future-source", version: 999, raw: { text: "旧原文\r\n😀", unknown: true } }];
  const point = await db.knowledgePoint.create({ data: { title, recordKind: "note", masteryStatus: "seen" } });
  const old = await db.knowledgePointRevision.create({ data: { knowledgePointId: point.id, sequence: 1, title, body: original, aliasesJson: '["原别名"]', sourceType: "user", sourcesJson: JSON.stringify(rawSources), recordDate: "2026-03-01", recordDateTimeZone: "UTC" } });
  await db.knowledgePoint.update({ where: { id: point.id }, data: { currentRevisionId: old.id } });
  await openClipper(page, key, point.id); const sourceTitle = `合并选文-${key}`, preview = await pastedPreview(page, sourceTitle, "选中原文🙂\n仍是本人提供。\n\n第二段。");
  await position(page, "修订记录内容", 4, 5); const before = await facts(); await insertFirst(page);
  const expected = `甲😀\r\n乙${preview.fragments[0].text}\r丙`;
  await expect(page.getByLabel("修订记录内容", { exact: true })).toHaveValue(expected.replace(/\r\n?/g, "\n")); expect(await facts()).toEqual(before);
  const external = await request.patch(pointPath(point.id), { data: { expectedRevisionId: old.id, title, body: "另一窗口已修改。", kind: "note", recordDate: { date: "2026-03-02", timeZone: "Asia/Shanghai" } } }); expect(external.status()).toBe(200); const externalPoint = (await external.json()).knowledgePoint;
  const conflict = page.waitForResponse(r => r.request().method() === "PATCH" && new URL(r.url()).pathname === pointPath(point.id) && r.request().postDataJSON()?.expectedRevisionId === old.id);
  await page.getByRole("button", { name: "确认保存新修订", exact: true }).click(); expect((await conflict).status()).toBe(409);
  await expect(page.getByText("记录已有较新修订，你的编辑草稿仍保留。请比较并合并内容，再明确选择新的保存基础。", { exact: true })).toBeVisible(); await expect(page.getByRole("article", { name: `待保存剪藏来源：${sourceTitle}`, exact: true })).toBeVisible();
  await page.getByRole("button", { name: "已合并，使用最新修订作为保存基础", exact: true }).click(); await expect(page.getByLabel("本人指定记录日期", { exact: true })).toHaveValue("2026-03-02");
  await expect(page.getByLabel("修订记录内容", { exact: true })).toHaveValue(expected.replace(/\r\n?/g, "\n"));
  const saving = page.waitForResponse(r => r.request().method() === "PATCH" && new URL(r.url()).pathname === pointPath(point.id) && r.request().postDataJSON()?.expectedRevisionId === externalPoint.currentRevisionId);
  await page.getByRole("button", { name: "确认保存新修订", exact: true }).click(); const response = await saving; expect(response.status()).toBe(200); const saved = await response.json();
  expect(response.request().postDataJSON()).not.toHaveProperty("recordDate"); expect(response.request().postDataJSON().sources[0]).toEqual({ kind: "retained", sourceIndex: 0 });
  expect(saved.knowledgePoint.body).toBe(expected); expect(saved.knowledgePoint.aliases).toEqual(["原别名"]); expect(saved.knowledgePoint.recordDate).toEqual({ date: "2026-03-02", timeZone: "Asia/Shanghai" }); expect(saved.knowledgePoint.sources[0]).toEqual(rawSources[0]);
  const snapshot = saved.knowledgePoint.sources[1]; expect(isRecordClipSnapshot(snapshot)).toBe(true); expect(snapshot.fragments).toEqual([preview.fragments[0]]); expect(snapshot.capturedAt).toBe(preview.capturedAt);
  expect(await db.knowledgePointRevision.findUniqueOrThrow({ where: { id: old.id } })).toEqual(old);
  await expect(page.getByRole("article", { name: `已保存剪藏来源：${sourceTitle}`, exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByRole("article", { name: `已保存剪藏来源：${sourceTitle}`, exact: true })).toContainText(preview.fragments[0].text);
  await page.getByLabel("修订记录内容", { exact: true }).fill(`${expected}后来只改正文。`);
  const appended = page.waitForResponse(r => r.request().method() === "PATCH" && new URL(r.url()).pathname === pointPath(point.id));
  await page.getByRole("button", { name: "确认保存新修订", exact: true }).click(); const result = await appended; expect(result.status()).toBe(200); const latest = (await result.json()).knowledgePoint; expect(latest.sources).toEqual(saved.knowledgePoint.sources);
  await expect(page.getByRole("article", { name: `已保存剪藏来源：${sourceTitle}`, exact: true })).toBeVisible();
  const history = page.locator("details").filter({ has: page.getByText(`修订 3 · ${title} · user`, { exact: true }) }); await history.locator("summary").first().click(); await expect(history.getByRole("article", { name: `历史剪藏来源：${sourceTitle}`, exact: true })).toContainText(preview.fragments[0].text);
  const firstHistory = page.locator("details").filter({ has: page.getByText(`修订 1 · ${title} · user`, { exact: true }) }); await firstHistory.locator("summary").first().click(); await firstHistory.getByText("查看完整来源快照", { exact: true }).click(); await expect(firstHistory).toContainText("future-source");
  await page.screenshot({ path: info.outputPath("clip-cas-retained-raw-and-history.png"), fullPage: true });
});

test("创建结果不明时冻结原命令，收据淘汰后核对仍找回原保存且不重复写入", async ({ page, request }) => {
  const key = crypto.randomUUID(), title = `核对剪藏-${key}`, sourceTitle = `核对来源-${key}`;
  await openClipper(page, key); await page.getByLabel("新记录标题").fill(title); await page.getByLabel("新记录内容", { exact: true }).fill("保留原命令。");
  await pastedPreview(page, sourceTitle, "核对所见原文。\n\n另一段。"); await insertFirst(page); const before = await facts();
  const captured: { first?: { knowledgePoint: { id: string }; savedRevisionId: string }; input?: string; retry?: string } = {};
  let first = true;
  await page.route("**/api/knowledge-points", async route => {
    if (route.request().method() !== "POST") return route.continue();
    if (first) { first = false; captured.input = route.request().postData()!; const upstream = await route.fetch(); expect(upstream.status()).toBe(200); captured.first = await upstream.json(); return route.fulfill({ status: 200, contentType: "application/json", body: "{" }); }
    captured.retry = route.request().postData()!; return route.continue();
  });
  await page.getByRole("button", { name: "确认保存", exact: true }).click(); await expect(page.getByRole("alert").filter({ hasText: "上次剪藏保存结果不明" })).toContainText("上次剪藏保存结果不明");
  await expect(page.getByLabel("新记录标题")).toBeDisabled(); await expect(page.getByLabel("新记录内容", { exact: true })).toBeDisabled(); await expect(page.getByRole("button", { name: "采用新预览替换待保存来源", exact: true })).toHaveCount(0);
  if (!captured.first) throw new Error("The original real save did not return before the response was deliberately corrupted.");
  const afterFirst = await facts(); expect(afterFirst).toEqual({ ...before, records: before.records + 1, revisions: before.revisions + 1, audit: before.audit + 1 });
  await evictOldPreviews(request, key); expect(await facts()).toEqual(afterFirst);
  const checking = page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/knowledge-points");
  await page.getByRole("button", { name: "核对上次剪藏保存结果", exact: true }).click(); const checked = await checking; expect(checked.status()).toBe(200); const result = await checked.json();
  expect(captured.retry).toBe(captured.input); expect(result.reused).toBe(true); expect(result.knowledgePoint.id).toBe(captured.first.knowledgePoint.id); expect(result.savedRevisionId).toBe(captured.first.savedRevisionId); expect(await facts()).toEqual(afterFirst);
  await expect(page.getByText(/本次保存对应修订 1/)).toBeVisible(); await expect(page.getByLabel("新记录标题")).toBeEnabled(); await expect(page.getByRole("button", { name: "核对上次剪藏保存结果", exact: true })).toHaveCount(0);
});

test("未保存收据失效保留正文，重读并明确替换只更新来源且新命令可保存", async ({ page, request }, info) => {
  const key = crypto.randomUUID(), sourceTitle = `过期来源-${key}`; await openClipper(page, key);
  await page.getByLabel("新记录标题").fill(`失效后保存-${key}`); await page.getByLabel("新记录内容", { exact: true }).fill("原正文。");
  const original = await pastedPreview(page, sourceTitle, "所选原文😀\n条件保留。"); await insertFirst(page); const body = await page.getByLabel("新记录内容", { exact: true }).inputValue(), before = await facts();
  await evictOldPreviews(request, key); expect(await facts()).toEqual(before);
  const failed = page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/knowledge-points");
  await page.getByRole("button", { name: "确认保存", exact: true }).click(); const expired = await failed; expect(expired.status()).toBe(410); const oldRequestId = expired.request().postDataJSON().requestId;
  await expect(page.getByLabel("新记录内容", { exact: true })).toHaveValue(body); expect(await facts()).toEqual(before);
  const card = page.getByRole("article", { name: `待保存剪藏来源：${sourceTitle}`, exact: true }), reading = page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === previewPath);
  await card.getByRole("button", { name: "重新读取这个剪藏来源", exact: true }).click(); const response = await reading; expect(response.status()).toBe(200); const refreshed: RecordClipPreview = (await response.json()).preview;
  expect(refreshed.receiptId).not.toBe(original.receiptId); expect(refreshed.snapshotKey).not.toBe(original.snapshotKey);
  await page.getByLabel("选择剪藏片段 1", { exact: true }).check(); await page.getByRole("button", { name: "采用新预览替换待保存来源", exact: true }).click(); await expect(page.getByLabel("新记录内容", { exact: true })).toHaveValue(body); expect(await facts()).toEqual(before);
  await page.screenshot({ path: info.outputPath("clip-expired-reread-explicit-replacement.png"), fullPage: true });
  const saving = page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/knowledge-points"); await page.getByRole("button", { name: "确认保存", exact: true }).click(); const savedResponse = await saving; expect(savedResponse.status()).toBe(200); expect(savedResponse.request().postDataJSON().requestId).not.toBe(oldRequestId);
  const saved = (await savedResponse.json()).knowledgePoint; expect(saved.body).toBe(body); expect(saved.sources).toHaveLength(1); expect(saved.sources[0].snapshotKey).toBe(refreshed.snapshotKey); expect(saved.sources[0].capturedAt).toBe(refreshed.capturedAt);
});

test("预览失败与私网读取均不改草稿或事实，重试后仍可选择真实人工来源", async ({ page, request }) => {
  const key = crypto.randomUUID(); await openClipper(page, key); await page.getByLabel("新记录标题").fill(`读取失败-${key}`); await page.getByLabel("新记录内容", { exact: true }).fill("正文保留。");
  const before = await facts(); let reject = true;
  await page.route(`**${previewPath}`, route => reject ? route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "本次剪藏读取失败，请重试。" }) }) : route.continue());
  const clip = page.getByRole("region", { name: "剪藏到正文草稿", exact: true }); await clip.getByLabel("剪藏读取方式").selectOption("pasted"); await clip.getByLabel("本人提供的剪藏文字").fill("本人提供的内容。"); await clip.getByRole("button", { name: "读取剪藏预览", exact: true }).click();
  await expect(clip.getByRole("alert")).toContainText("本次剪藏读取失败"); await expect(clip.getByLabel("选择剪藏片段 1", { exact: true })).toHaveCount(0); await expect(page.getByLabel("新记录内容", { exact: true })).toHaveValue("正文保留。"); expect(await facts()).toEqual(before);
  for (const url of ["http://example.com/", "https://127.0.0.1/private", "https://[::1]/private"]) { const response = await request.post(previewPath, { data: { mode: "web", url } }); expect(response.status()).toBe(400); await response.json(); }
  expect(await facts()).toEqual(before); reject = false; const preview = await pastedPreview(page, `重试来源-${key}`, "真实服务取得的本人提供文字。"); expect(preview.obtained).toBe(false); await insertFirst(page); expect(await facts()).toEqual(before);
});

test("来源变化禁用旧剪藏撤销，模板撤销仅恢复正文而不移除仍保留的来源", async ({ page }) => {
  const key = crypto.randomUUID(); await openClipper(page, key); await page.getByLabel("新记录标题").fill(`撤销边界-${key}`); await page.getByLabel("新记录内容", { exact: true }).fill("原正文。");
  const before = await facts(); await pastedPreview(page, `来源甲-${key}`, "甲片段。"); await insertFirst(page); await pastedPreview(page, `来源乙-${key}`, "乙片段。"); await insertFirst(page);
  const body = await page.getByLabel("新记录内容", { exact: true }).inputValue();
  await page.getByRole("button", { name: `取消待保存剪藏来源“来源甲-${key}”`, exact: true }).click(); await expect(page.getByRole("button", { name: "撤销最近一次剪藏插入", exact: true })).toBeDisabled(); await expect(page.getByLabel("新记录内容", { exact: true })).toHaveValue(body);
  await page.getByText("使用记录模板", { exact: true }).click(); await page.getByRole("button", { name: "选择示例“整理疑问”", exact: true }).click(); await page.getByRole("button", { name: "预览模板", exact: true }).click(); await page.getByRole("button", { name: "插入正文草稿", exact: true }).click();
  await expect(page.getByRole("button", { name: "撤销最近一次剪藏插入", exact: true })).toBeDisabled(); await page.getByRole("button", { name: "撤销最近一次模板插入", exact: true }).click(); await expect(page.getByLabel("新记录内容", { exact: true })).toHaveValue(body);
  await expect(page.getByRole("article", { name: `待保存剪藏来源：来源乙-${key}`, exact: true })).toBeVisible(); await expect(page.getByRole("article", { name: `待保存剪藏来源：来源甲-${key}`, exact: true })).toHaveCount(0); expect(await facts()).toEqual(before);
});

test("公开HTTPS网页经真实预览选片保存，当前与历史保留系统取得身份", async ({ page }, info) => {
  const key = crypto.randomUUID(); const clip = await openClipper(page, key); await page.getByLabel("新记录标题").fill(`公开网页剪藏-${key}`); await page.getByLabel("新记录内容", { exact: true }).fill("我的理解："); const before = await facts();
  await clip.getByLabel("剪藏读取方式", { exact: true }).selectOption("web"); await clip.getByLabel("剪藏网址", { exact: true }).fill("https://example.com/");
  const reading = page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === previewPath); await clip.getByRole("button", { name: "读取剪藏预览", exact: true }).click();
  const response = await reading; expect(response.status()).toBe(200); const preview: RecordClipPreview = (await response.json()).preview;
  expect(preview.mode).toBe("web"); expect(preview.obtained).toBe(true); expect(preview.requestedUrl).toBe("https://example.com/"); expect(preview.finalUrl?.startsWith("https://")).toBe(true); expect(preview.fragments.length).toBeGreaterThan(0); expect(preview.text.trim().length).toBeGreaterThan(0); expect(await facts()).toEqual(before);
  await insertFirst(page); await expect(page.getByRole("article", { name: `待保存剪藏来源：${preview.title}`, exact: true })).toContainText("系统读取的公开网页文字；内容未经核实。"); expect(await facts()).toEqual(before);
  const saving = page.waitForResponse(r => r.request().method() === "POST" && new URL(r.url()).pathname === "/api/knowledge-points"); await page.getByRole("button", { name: "确认保存", exact: true }).click(); const savedResponse = await saving; expect(savedResponse.status()).toBe(200); const result = await savedResponse.json();
  const source = result.knowledgePoint.sources[0]; expect(isRecordClipSnapshot(source)).toBe(true); expect(source.obtained).toBe(true); expect(source.fragments).toEqual([preview.fragments[0]]); expect(source.capturedAt).toBe(preview.capturedAt); expect(source).not.toHaveProperty("receiptId");
  await expect(page.getByRole("link", { name: `打开已保存记录“公开网页剪藏-${key}”`, exact: true })).toBeVisible(); await page.getByRole("link", { name: `打开已保存记录“公开网页剪藏-${key}”`, exact: true }).click();
  await expect(page.getByRole("article", { name: `已保存剪藏来源：${preview.title}`, exact: true })).toContainText(preview.fragments[0].text);
  const history = page.locator("details").filter({ has: page.getByText(`修订 1 · 公开网页剪藏-${key} · user`, { exact: true }) }); await history.locator("summary").first().click(); await expect(history.getByRole("article", { name: `历史剪藏来源：${preview.title}`, exact: true })).toContainText("内容未经核实"); await page.screenshot({ path: info.outputPath("real-public-html-clip-current-and-history.png"), fullPage: true });
  const after = await facts(); expect(after).toEqual({ ...before, records: before.records + 1, revisions: before.revisions + 1, audit: before.audit + 1 });
});
