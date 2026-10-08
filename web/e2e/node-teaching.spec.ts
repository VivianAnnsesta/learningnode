import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import lesson from "../test-fixtures/node-teaching.json";

test.skip(process.env.E2E_TEACHING_FIXTURE !== "1", "Run npm run test:e2e:teaching for an isolated local AI fixture.");
const prisma = new PrismaClient();
const domains = new Set<string>();

async function createNode(title = "平均变化率") {
  const domain = await prisma.domain.create({ data: {
    name: `e2e-node-teaching-${Date.now()}`, goal: "用变化率解释简单运动", currentLevel: "会基本运算",
    roadmapTitle: "变化率入门", roadmapStatus: "confirmed", mapRevision: 1,
    courseDesignStatus: "confirmed", courseDesignConfirmedAt: new Date(),
    courseDesignDraft: JSON.stringify({ sources: [] })
  } });
  domains.add(domain.id);
  const unit = await prisma.unit.create({ data: { domainId: domain.id, mapKey: "rates-stage", title: "变化率基础", goal: "解释变化快慢", orderIndex: 0, status: "expanded",
    moduleDirectionsJson: JSON.stringify(["变化率"]), planningBlueprintJson: JSON.stringify([{ key: "rates", title: "变化率", goal: "解释变化快慢", keyQuestions: [{ key: "rate-question", question: "如何比较变化快慢？", checkableOutcome: "计算并解释平均变化率" }] }]) } });
  const node = await prisma.learningNode.create({ data: { domainId: domain.id, unitId: unit.id, mapKey: "rate-node", moduleTitle: "变化率", moduleOrderIndex: 0, title, keyQuestion: "如何比较变化快慢？", objective: "计算并解释平均变化率", planningQuestionKey: "rate-question", status: "available", orderIndex: 0 } });
  return { domainId: domain.id, nodeId: node.id, url: `/learning/domains/${domain.id}/items/${node.id}`, api: `/api/domains/${domain.id}/nodes/${node.id}/teaching` };
}

async function prepare(page: Page, url: string) {
  await page.goto(url);
  await page.getByRole("button", { name: "准备本节点教学", exact: true }).click();
  await expect(page.getByText(lesson.explanation, { exact: true })).toBeVisible();
}

test.afterEach(async () => {
  for (const id of domains) await prisma.domain.deleteMany({ where: { id } });
  domains.clear();
});
test.afterAll(async () => { await prisma.$disconnect(); });

test("map to teaching, saved practice, help, feedback, questions and explicit seen sedimentation", async ({ page, request }, testInfo) => {
  const node = await createNode();
  await page.goto(`/learning/domains/${node.domainId}`);
  await page.locator(`a[href="${node.url}"]`).first().click();
  await page.getByRole("button", { name: "准备本节点教学", exact: true }).click();
  await expect(page.getByText(lesson.explanation, { exact: true })).toBeVisible();
  expect(await prisma.knowledgePoint.count({ where: { domainId: node.domainId } })).toBe(0);
  const initial = await (await request.get(node.api)).json();
  expect(JSON.stringify(initial.session.lesson.exercises)).not.toContain(lesson.exercises[0].expectedAnswer);
  await page.getByRole("button", { name: "看示范", exact: true }).click();
  await expect(page.getByText(lesson.workedExample.conclusion, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "练习与反馈", exact: true }).click();
  await page.getByLabel("练习作答", { exact: true }).fill("24 除以 6，平均每秒 4 米。  ");
  await expect(page.getByText("作答草稿已保存", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("练习作答", { exact: true })).toHaveValue("24 除以 6，平均每秒 4 米。  ");
  await page.getByRole("button", { name: "给我一个提示", exact: true }).click();
  await expect(page.getByText(`提示 1：${lesson.exercises[0].hints[0]}`, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "提交练习作答", exact: true }).click();
  await expect(page.getByText("已有本题帮助或反馈", { exact: true })).toBeVisible();
  await page.getByLabel("哪里还不清楚？", { exact: true }).fill("换一个例子说明每单位时间。");
  await page.getByRole("button", { name: "请 AI 帮助理解", exact: true }).click();
  await expect(page.getByText("可以把变化率理解成每单位时间平均变化多少。", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "查看参考解答", exact: true }).click();
  await expect(page.getByText(lesson.exercises[0].expectedAnswer, { exact: true })).toBeVisible();
  await expect(page.getByText("作答草稿已保存", { exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("node-teaching.png"), fullPage: true });
  await page.getByLabel("选择练习", { exact: true }).selectOption("independent-1");
  await expect(page.getByText(lesson.exercises[1].prompt, { exact: true })).toBeVisible();
  await page.getByLabel("练习作答", { exact: true }).fill("15 除以 3，平均每分钟上升 5 厘米。");
  await page.getByRole("button", { name: "提交练习作答", exact: true }).click();
  await expect(page.getByText("提交时无本题帮助记录", { exact: true })).toBeVisible();
  await page.getByPlaceholder("我认为……因为……一个例子是……它不适用于……").fill("平均变化率是区间变化量与时间变化量的比值，不代表每一时刻都相同。");
  await page.getByRole("button", { name: "我确认，沉淀并返回地图", exact: true }).click();
  await expect(page).toHaveURL(`/learning/domains/${node.domainId}`);
  expect((await prisma.knowledgePoint.findFirstOrThrow({ where: { domainId: node.domainId } })).masteryStatus).toBe("seen");
  expect(await prisma.nodeTeachingSession.count({ where: { nodeId: node.nodeId } })).toBe(1);
  expect(await prisma.aiCallLog.count({ where: { domainId: node.domainId, taskType: "node_lesson_preparation", status: "success" } })).toBe(1);
});

test("failed feedback survives reload and explicit retry keeps one saved answer", async ({ page }) => {
  const node = await createNode();
  await prepare(page, node.url);
  await page.getByRole("button", { name: "练习与反馈", exact: true }).click();
  await page.getByLabel("练习作答", { exact: true }).fill("模拟反馈失败：我的答案是 4 米每秒。");
  await page.getByRole("button", { name: "提交练习作答", exact: true }).click();
  await expect(page.getByText("AI 暂时未返回有效反馈，输入已保存，可以重试。", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("练习作答", { exact: true })).toHaveValue("模拟反馈失败：我的答案是 4 米每秒。");
  await page.getByRole("button", { name: "重试这次反馈", exact: true }).click();
  await expect(page.getByText("你的比值计算可以继续检查单位和对应的区间。", { exact: true })).toBeVisible();
  const session = await prisma.nodeTeachingSession.findFirstOrThrow({ where: { nodeId: node.nodeId }, include: { interactions: true } });
  expect(session.interactions).toHaveLength(1);
  expect(session.interactions[0].status).toBe("complete");
  expect(session.interactions[0].assistance).toBe(0);
  const logs = await prisma.aiCallLog.findMany({ where: { domainId: node.domainId, taskType: "node_lesson_feedback" }, orderBy: { createdAt: "asc" } });
  expect(logs.map((log) => log.status)).toEqual(["failed", "success"]);
});

test("a version conflict preserves local input and a new objective preserves the old lesson", async ({ page, request }) => {
  const node = await createNode();
  await prepare(page, node.url);
  await page.getByRole("button", { name: "练习与反馈", exact: true }).click();
  const initial = (await (await request.get(node.api)).json()).session;
  expect((await request.patch(node.api, { data: { sessionId: initial.id, revision: initial.revision, action: "hint" } })).ok()).toBeTruthy();
  await page.getByLabel("练习作答", { exact: true }).fill("保留我的本地回答");
  await expect(page.getByText("学习记录已在另一处更新，请重新加载；本地输入仍保留。", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "重新加载教学记录", exact: true }).click();
  await expect(page.getByLabel("练习作答", { exact: true })).toHaveValue("保留我的本地回答");
  await expect(page.getByText("作答草稿已保存", { exact: true })).toBeVisible();
  await page.getByLabel("选择练习", { exact: true }).selectOption("independent-1");
  await page.getByLabel("练习作答", { exact: true }).fill("另一个标签页更新前的旧内容");
  await expect(page.getByText("作答草稿已保存", { exact: true })).toBeVisible();
  const beforeRemoteUpdate = (await (await request.get(node.api)).json()).session;
  expect((await request.patch(node.api, { data: {
    sessionId: beforeRemoteUpdate.id, revision: beforeRemoteUpdate.revision,
    action: "save_answer", exerciseKey: "independent-1", answer: "另一个标签页刚保存的新内容"
  } })).ok()).toBeTruthy();
  await page.getByRole("button", { name: "看示范", exact: true }).click();
  await expect(page.getByText("学习记录已在另一处更新，请重新加载；本地输入仍保留。", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "重新加载教学记录", exact: true }).click();
  await page.getByRole("button", { name: "练习与反馈", exact: true }).click();
  await page.getByLabel("选择练习", { exact: true }).selectOption("independent-1");
  await expect(page.getByLabel("练习作答", { exact: true })).toHaveValue("另一个标签页刚保存的新内容");
  await expect(page.getByText("作答草稿已保存", { exact: true })).toBeVisible();
  await prisma.learningNode.update({ where: { id: node.nodeId }, data: { objective: "比较平均变化率与瞬时变化率" } });
  await page.reload();
  await expect(page.getByRole("button", { name: "按当前目标准备教学", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "按当前目标准备教学", exact: true }).click();
  await expect(page.getByText(lesson.explanation, { exact: true })).toBeVisible();
  expect(await prisma.nodeTeachingSession.count({ where: { nodeId: node.nodeId } })).toBe(2);
  const old = await prisma.nodeTeachingSession.findUniqueOrThrow({ where: { id: initial.id } });
  expect(JSON.parse(old.progressJson).drafts["guided-1"]).toBe("保留我的本地回答");
});

test("preparation failure can be retried without creating fallback teaching or personal knowledge", async ({ page }) => {
  const node = await createNode("备课失败一次");
  await page.goto(node.url);
  await page.getByRole("button", { name: "准备本节点教学", exact: true }).click();
  await expect(page.getByText("教学服务暂时不可用，请重试；已保存的学习记录会保留。", { exact: true })).toBeVisible();
  expect(await prisma.nodeTeachingSession.count({ where: { nodeId: node.nodeId } })).toBe(0);
  await page.getByRole("button", { name: "重新加载教学记录", exact: true }).click();
  await page.getByRole("button", { name: "准备本节点教学", exact: true }).click();
  await expect(page.getByText(lesson.explanation, { exact: true })).toBeVisible();
  expect(await prisma.knowledgePoint.count({ where: { domainId: node.domainId } })).toBe(0);
});

test("a failed autosave keeps local input and resumes saving after connection recovery", async ({ page }) => {
  const node = await createNode();
  await prepare(page, node.url);
  await page.getByRole("button", { name: "练习与反馈", exact: true }).click();
  let blocked = false;
  await page.route(`**${node.api}`, async (route) => {
    if (!blocked && route.request().method() === "PATCH") {
      blocked = true;
      await route.abort("failed");
    } else await route.continue();
  });
  await page.getByLabel("练习作答", { exact: true }).fill("网络中断也要保留这段做法");
  await expect(page.getByText("连接中断，本地输入仍保留，请重新加载记录后重试。", { exact: true })).toBeVisible();
  await expect(page.getByLabel("练习作答", { exact: true })).toHaveValue("网络中断也要保留这段做法");
  await page.getByRole("button", { name: "重新加载教学记录", exact: true }).click();
  await expect(page.getByText("作答草稿已保存", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("练习作答", { exact: true })).toHaveValue("网络中断也要保留这段做法");
});
