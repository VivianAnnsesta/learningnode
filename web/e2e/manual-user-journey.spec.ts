import { expect, test, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { recordPassingMapDraftReview } from "./helpers/roadmap-quality";

const prisma = new PrismaClient();

const createMappedDomainForManualFlow = async (
  request: APIRequestContext,
  name: string
) => {
  const taskBrief = `Confirm the ${name} learning route.`;
  const domainResponse = await request.post("/api/domains", {
    data: {
      name,
      goal: "Build and explain two connected concepts",
      scope: "Concept foundations and application",
      excludedScope: "Advanced specialist topics",
      description: "I know the basic vocabulary but need to explain it with boundaries.",
      currentLevel: "Beginner",
      outputType: "Explanation",
      outputTarget: "A checked explanation with an example",
      depth: "Applied",
      taskBrief
    }
  });
  expect(domainResponse.ok()).toBeTruthy();
  const { domain } = await domainResponse.json();
  const briefResponse = await request.patch(`/api/domains/${domain.id}/task-brief`);
  expect(briefResponse.ok()).toBeTruthy();

  const courseDesignAiCallLogId = `manual-course-design-${domain.id}`;
  const courseDesign = {
    taskBriefSnapshot: taskBrief,
    globalExplanation: {
      theorySkeleton: "Build the first concept before connecting it to the second.",
      sourceBasis: "A controlled manual-flow fixture.",
      optimizationRationale: "Prerequisites are explicit and do not impose a single route.",
      risksAndValidation: "The learner must explain both concepts in their own words."
    },
    sources: [
      {
        url: "https://www.typescriptlang.org/docs/handbook/intro.html",
        title: "Controlled source",
        reason: "A safe deterministic source for the manual UI flow."
      }
    ],
    keyTradeoffs: ["Keep the route small while preserving evidence gates."],
    qualityGate: { passed: true, missing: [] }
  };
  await prisma.domain.update({
    where: { id: domain.id },
    data: {
      courseDesignDraft: JSON.stringify(courseDesign),
      courseDesignStatus: "draft",
      courseDesignAiCallLogId
    }
  });

  const draft = {
    planningVersion: 2 as const,
    title: `${name} map`,
    status: "draft",
    baseRevision: 0,
    stages: [
      {
        key: "core",
        title: "Core concepts",
        goal: "Explain and connect the two concepts.",
        status: "expanded",
        rationale: "Start with the foundation, then connect the application.",
        moduleDirections: ["Concept foundations"],
        moduleBlueprints: [
          {
            key: "foundations",
            title: "Foundations",
            goal: "Build a stable conceptual base.",
            keyQuestions: [
              {
                key: "concept-a-question",
                question: "What does Concept A explain?",
                checkableOutcome: "Explain Concept A with an example and boundary."
              },
              {
                key: "concept-b-question",
                question: "How does Concept B extend Concept A?",
                checkableOutcome: "Connect Concept B to Concept A in a new example."
              }
            ]
          }
        ],
        prerequisiteStageKeys: [],
        modules: [
          {
            title: "Foundations",
            goal: "Build a stable conceptual base.",
            items: [
              {
                key: "concept-a",
                title: "Concept A",
                keyQuestion: "What does Concept A explain?",
                objective: "Explain Concept A with an example and boundary.",
                prerequisite: "The domain goal",
                commonMistake: "Repeating a definition without a boundary.",
                transferPrompt: "Apply Concept A to a new situation.",
                prerequisiteKeys: [],
                planningQuestionKey: "concept-a-question",
                status: "not_started"
              },
              {
                key: "concept-b",
                title: "Concept B",
                keyQuestion: "How does Concept B extend Concept A?",
                objective: "Connect Concept B to Concept A in a new example.",
                prerequisite: "Concept A",
                commonMistake: "Treating the two concepts as unrelated.",
                transferPrompt: "Compare Concept A and Concept B.",
                prerequisiteKeys: ["concept-a"],
                planningQuestionKey: "concept-b-question",
                status: "not_started"
              }
            ]
          }
        ]
      }
    ]
  };
  const draftResponse = await request.patch(`/api/domains/${domain.id}/map`, {
    data: { draft, courseDesignAiCallLogId }
  });
  expect(draftResponse.ok()).toBeTruthy();
  const draftData = await draftResponse.json();
  await recordPassingMapDraftReview(prisma, {
    domainId: domain.id,
    draft: draftData.draft,
    courseDesignAiCallLogId
  });
  const confirmResponse = await request.post(`/api/domains/${domain.id}/map`, {
    data: {
      draft,
      courseDesign,
      reason: "Manual UI flow confirms the deterministic fixture."
    }
  });
  expect(confirmResponse.ok()).toBeTruthy();
  return domain;
};

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("a new learner can discover the no-AI configuration boundary", async ({
  page
}) => {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const requestFailures: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));
  page.on("requestfailed", (request) => {
    const errorText = request.failure()?.errorText || "failed";
    if (errorText === "net::ERR_ABORTED" && request.url().includes("_rsc=")) {
      return;
    }
    requestFailures.push(`${request.method()} ${request.url()}: ${errorText}`);
  });

  const domainName = `manual-new-learner-${Date.now()}`;

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "学习领域", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "创建领域", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "创建领域", exact: true }).click();
  await expect(page).toHaveURL(/\/learning\/domains\/new$/);
  await expect(
    page.getByRole("heading", { name: "创建可确认的学习路线", level: 1 })
  ).toBeVisible();

  await page.waitForTimeout(500);
  await page.getByLabel("领域名称").fill(domainName);
  await page.getByLabel("当前水平").fill("刚开始建立基础");
  await page.getByLabel("背景描述").fill("我已经完成基础入门练习，但还没有独立完成过完整项目。");
  await page.getByLabel("学习目标").fill("完成一条可执行的学习路线");
  await page.getByLabel("输出类型").fill("项目");
  await page.getByLabel("输出目标").fill("一个可检查的学习成果");
  await page.getByLabel("深度").fill("可独立完成");
  await page.getByLabel("包含范围").fill("核心概念、练习和一个小型应用");
  await page.getByLabel("排除范围").fill("暂不覆盖高级专题");
  await page.getByRole("button", { name: "保存领域" }).click();
  await expect(page.getByText("领域已保存。", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/\/learning\/domains\/new\?domainId=/);

  await page.reload();
  await expect(page.getByText("已恢复这个学习领域的创建进度。", { exact: true })).toBeVisible();
  await expect(page.getByLabel("领域名称")).toHaveValue(domainName);

  await page.getByLabel("任务书草稿").fill("完成一条可检查、可恢复的学习路线。");
  await page.getByRole("button", { name: "确认任务书" }).click();
  await expect(page.getByText("已确认", { exact: true })).toBeVisible();

  const researchButton = page.getByRole("button", {
    name: "AI 生成课程设计方向"
  });
  await expect(researchButton).toBeEnabled();
  await researchButton.click();

  await expect(
    page.getByText("云端 AI 课程研究未完成，正式地图保持阻断；请检查 AI 设置后重试。", {
      exact: true
    })
  ).toBeVisible({ timeout: 15000 });
  await expect(page.getByText(/缺失或无效项：sources/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "AI 生成完整 Stage 骨架" })
  ).toBeDisabled();

  await page.getByRole("link", { name: "检查或切换 AI 设置" }).click();
  await expect(page).toHaveURL(/\/settings\/ai$/);
  await expect(page.getByRole("heading", { name: "AI 设置", level: 1 })).toBeVisible();

  expect(pageErrors).toEqual([]);
  expect(requestFailures).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("AI settings explain the desktop-only persistence boundary", async ({
  page
}) => {
  let settingsReadCount = 0;
  await page.route("**/api/ai/settings", async (route) => {
    if (route.request().method() === "GET") {
      settingsReadCount += 1;
      if (settingsReadCount === 1) {
        await page.waitForTimeout(1000);
      }
    }
    await route.continue();
  });

  await page.goto("/settings/ai");
  await expect(page.getByRole("heading", { name: "AI 设置", level: 1 })).toBeVisible();
  await expect(page.getByText(/当前 AI 尚未配置完整/)).toBeVisible();
  await expect(page.getByRole("button", { name: "测试 AI 连接" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "保存 AI 设置" })).toBeDisabled();

  const modelInput = page.getByPlaceholder("例如 gpt-4.1-mini 或 LM Studio 当前模型 ID");
  await modelInput.fill("manual-placeholder-model");
  await page.waitForTimeout(1200);
  await expect(modelInput).toHaveValue("manual-placeholder-model");
  await expect(page.getByRole("button", { name: "保存 AI 设置" })).toBeEnabled();
  await page.getByRole("button", { name: "保存 AI 设置" }).click();
  await expect(
    page.getByText("AI 设置只能由桌面运行时写入用户数据目录。", { exact: true })
  ).toBeVisible();
  await expect(page.getByText(/当前 AI 尚未配置完整/)).toBeVisible();
});

test("diagnostics keep manual answers usable when AI is unavailable", async ({
  page,
  request
}) => {
  const domainName = `manual-diagnostics-${Date.now()}`;
  const domainResponse = await request.post("/api/domains", {
    data: {
      name: domainName,
      goal: "Try a manual diagnostic flow",
      scope: "Foundations only",
      excludedScope: "Advanced topics",
      description: "I know the basic terms but need practice explaining them.",
      currentLevel: "Beginner",
      outputType: "Explanation",
      outputTarget: "One checked explanation",
      depth: "Applied"
    }
  });
  expect(domainResponse.ok()).toBeTruthy();
  const { domain } = await domainResponse.json();

  await page.goto("/");
  await page.getByRole("link", { name: domainName }).click();
  await expect(page.getByRole("link", { name: "学习诊断" })).toBeVisible();
  await page.getByRole("link", { name: "学习诊断" }).click();
  await expect(
    page.getByRole("heading", { name: `${domainName}诊断`, level: 1 })
  ).toBeVisible();
  await expect(page.getByText("还没有诊断会话。", { exact: true })).toBeVisible();
  await expect(page.getByText("0 个会话 · 0 道题 · 已作答 0 道", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "AI 生成草稿", exact: true })).toBeDisabled();
  await expect(
    page.getByText("请先保存路线图，再生成诊断题草稿；手动创建诊断仍可用。", {
      exact: true
    })
  ).toBeVisible();

  await page.getByPlaceholder("诊断摘要").fill("手动检查基础理解。");
  await page.getByPlaceholder("诊断题目").fill("请解释一个基础概念，并说明它的适用边界。");
  await page.getByPlaceholder("预期答案").fill("能说出定义、例子和一个不适用的情况。");
  await page.getByRole("button", { name: "创建会话" }).click();
  await expect(page.getByText("诊断会话已创建。", { exact: true })).toBeVisible();
  await expect(page.getByText("1 道题 · 已作答 0 道", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "打开会话" }).click();

  await expect(page.getByRole("heading", { name: "初始诊断", level: 1 })).toBeVisible();
  await page.route("**/api/diagnostic-questions/*/answers", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await route.continue();
  });
  const answerInput = page.getByPlaceholder("先写下你的答案。");
  await answerInput.fill(
    "我认为这个概念描述了一个稳定关系；例如可以用一个简单例子说明，但在条件改变时并不适用。"
  );
  await page.getByRole("button", { name: "保存答案" }).click();
  await expect(answerInput).toBeDisabled();
  await expect(page.getByText("答案已保存。", { exact: true })).toBeVisible();
  await expect(page.getByText(/我认为这个概念描述了一个稳定关系/)).toBeVisible();

  await page.getByRole("button", { name: "AI 评价" }).click();
  await expect(page.getByText(/AI provider is not configured|AI.*未配置|配置/)).toBeVisible({
    timeout: 15000
  });
  await expect(page.getByText(/我认为这个概念描述了一个稳定关系/)).toBeVisible();

  await page.getByRole("link", { name: "返回诊断列表" }).click();
  await expect(page.getByRole("button", { name: "AI 生成草稿", exact: true })).toBeDisabled();
});

test("diagnostic review exposes L1 acceptance and keeps map changes pending", async ({
  page,
  request
}) => {
  const domain = await createMappedDomainForManualFlow(
    request,
    `manual-diagnostic-route-${Date.now()}`
  );
  const mapResponse = await request.get(`/api/domains/${domain.id}/map`);
  expect(mapResponse.ok()).toBeTruthy();
  const mapData = await mapResponse.json();
  const sourceNode = mapData.map.nodes.find(
    (node: { title: string; id: string }) => node.title === "Concept A"
  );
  expect(sourceNode).toBeTruthy();

  await page.goto(`/learning/domains/${domain.id}/diagnostics`);
  await expect(page.getByRole("heading", { name: /诊断$/, level: 1 })).toBeVisible();
  await page.getByPlaceholder("诊断摘要").fill("检查路线选择");
  await page.getByPlaceholder("诊断题目").fill("请说明 Concept A 的边界。");
  await page.getByPlaceholder("预期答案").fill("能给出定义、例子和不适用边界。");
  await page.locator("select").nth(1).selectOption(sourceNode.id);
  await page.getByRole("button", { name: "创建会话" }).click();
  await expect(page.getByText("诊断会话已创建。", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "打开会话" }).click();
  await expect(page.getByRole("heading", { name: "初始诊断", level: 1 })).toBeVisible();

  await page.route(
    "**/api/diagnostic-answers/*/evaluate",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          suggestedRoadmapItemUpdate: true,
          evaluation: {
            summary: "答案需要补充一个明确边界。",
            suggestedResult: "partial"
          }
        })
      });
    }
  );

  await page.getByPlaceholder("先写下你的答案。").fill(
    "Concept A explains the shared boundary, but it does not apply when the required condition is absent."
  );
  await page.getByRole("button", { name: "保存答案" }).click();
  await expect(page.getByText("答案已保存。", { exact: true })).toBeVisible();

  const answer = await prisma.diagnosticAnswer.findFirst({
    where: { question: { session: { domainId: domain.id } } },
    orderBy: { createdAt: "desc" }
  });
  expect(answer).toBeTruthy();

  const suggestionRows = [
    {
      id: `manual-l1-${domain.id}`,
      domainId: domain.id,
      sourceNodeId: sourceNode.id,
      level: "L1",
      title: "在当前节点补做练习",
      rationale: "不改变地图，只增加一次聚焦练习。",
      changesMap: false,
      status: "candidate",
      payload: JSON.stringify({ action: "practice_in_place" })
    },
    {
      id: `manual-l2-${domain.id}`,
      domainId: domain.id,
      sourceNodeId: sourceNode.id,
      level: "L2",
      title: "添加补救节点",
      rationale: "需要转换为绑定版本的地图草稿。",
      changesMap: true,
      status: "candidate",
      payload: JSON.stringify({ action: "add_remedial_node" })
    }
  ];
  await prisma.routeSuggestion.createMany({ data: suggestionRows });

  await page.route(
    "**/api/diagnostic-answers/*/route-suggestions",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          suggestions: suggestionRows.map((suggestion) => ({
            ...suggestion,
            payload: JSON.parse(suggestion.payload)
          }))
        })
      });
    }
  );

  await page.getByRole("button", { name: "AI 评价" }).click();
  await expect(page.getByText("AI 评价已完成，现在可以为关联节点生成路线建议。", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "生成路线建议" }).click();
  await expect(page.getByText("在当前节点补做练习", { exact: true })).toBeVisible();
  await expect(page.getByText("添加补救节点", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "接受建议" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "需转为地图草稿" })).toBeDisabled();

  await page.getByRole("button", { name: "接受建议" }).click();
  await expect(page.getByText("建议已接受。", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "已接受", exact: true })
  ).toBeVisible();
  const accepted = await prisma.routeSuggestion.findUnique({
    where: { id: suggestionRows[0].id }
  });
  expect(accepted).toMatchObject({ status: "accepted" });
});

test("diagnostic draft locks the editor during a long AI request", async ({
  page,
  request
}) => {
  const domain = await createMappedDomainForManualFlow(
    request,
    `manual-diagnostic-lock-${Date.now()}`
  );

  await page.goto(`/learning/domains/${domain.id}/diagnostics`);
  await expect(page.getByRole("heading", { name: /诊断$/, level: 1 })).toBeVisible();

  await page.route(
    `**/api/domains/${domain.id}/diagnostics/ai-draft`,
    async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          draft: {
            title: "AI generated diagnostic",
            summary: "A deterministic diagnostic draft.",
            questions: [
              {
                prompt: "Explain Concept A with a boundary.",
                questionType: "concept",
                expectedAnswer: "An explanation with an example and boundary.",
                roadmapItemId: null
              }
            ]
          },
          source: "ai"
        })
      });
    }
  );

  const title = page.getByPlaceholder("诊断标题");
  await title.fill("My draft title");
  await page.getByPlaceholder("诊断题目").fill("My own diagnostic question.");
  await page.getByRole("button", { name: "AI 生成草稿", exact: true }).click();

  await expect(title).toBeDisabled();
  await expect(page.getByPlaceholder("诊断题目")).toBeDisabled();
  await expect(page.getByRole("button", { name: "创建会话" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "再添加一道题" })).toBeDisabled();
  await expect(title).toHaveValue("AI generated diagnostic");
  await expect(page.getByPlaceholder("诊断题目")).toHaveValue(
    "Explain Concept A with a boundary."
  );
});

test("an empty domain keeps diagnostics and knowledge graph discoverable", async ({
  page,
  request
}) => {
  const domainName = `manual-empty-domain-${Date.now()}`;
  const domainResponse = await request.post("/api/domains", {
    data: {
      name: domainName,
      goal: "Check empty-domain navigation",
      scope: "Foundations only",
      excludedScope: "Advanced topics",
      description: "I am starting from zero and want to inspect the available entry points.",
      currentLevel: "Beginner",
      outputType: "Explanation",
      outputTarget: "A short checked explanation",
      depth: "Introductory"
    }
  });
  expect(domainResponse.ok()).toBeTruthy();
  const { domain } = await domainResponse.json();

  await page.goto("/");
  await page.getByRole("link", { name: domainName, exact: true }).click();
  await expect(page.getByRole("heading", { name: domainName, level: 1 })).toBeVisible();
  await expect(page.getByText("尚未生成地图", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "学习诊断", exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "知识体系图谱", exact: true })
  ).toBeVisible();

  await page.getByRole("link", { name: "知识体系图谱", exact: true }).click();
  await expect(page.getByRole("heading", { name: "知识体系图谱", level: 1 })).toBeVisible();
  await expect(page.getByText("先完成学习节点，这里才会出现沉淀后的知识点。", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "AI 整理核心概念", exact: true })).toBeDisabled();
  await expect(page.getByText("先沉淀至少一个知识点，再整理核心概念。", { exact: true })).toBeVisible();
  await expect(page.getByText("0", { exact: true })).toHaveCount(4);

  await page.getByRole("link", { name: "领域地图", exact: true }).click();
  await expect(page.getByRole("heading", { name: domainName, level: 1 })).toBeVisible();
  await page.getByRole("link", { name: "学习诊断", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: `${domainName}诊断`, level: 1 })
  ).toBeVisible();
  await expect(page.getByText("还没有诊断会话。", { exact: true })).toBeVisible();
  await expect(page.getByText("0 个会话 · 0 道题 · 已作答 0 道", { exact: true })).toBeVisible();
});

test("the learner can review and confirm a knowledge-graph relation", async ({
  page,
  request
}) => {
  const domain = await createMappedDomainForManualFlow(
    request,
    `manual-graph-${Date.now()}`
  );
  const mapResponse = await request.get(`/api/domains/${domain.id}/map`);
  expect(mapResponse.ok()).toBeTruthy();
  const mapData = await mapResponse.json();
  const conceptA = mapData.map.nodes.find(
    (node: { title: string; id: string }) => node.title === "Concept A"
  );
  const conceptB = mapData.map.nodes.find(
    (node: { title: string; id: string }) => node.title === "Concept B"
  );
  if (!conceptA || !conceptB) {
    throw new Error("Manual graph fixture did not create both concepts.");
  }

  for (const [nodeId, title] of [
    [conceptA.id, "Concept A"],
    [conceptB.id, "Concept B"]
  ] as const) {
    const completion = await request.post(
      `/api/domains/${domain.id}/nodes/${nodeId}/complete`,
      {
        data: {
          userUnderstanding: `${title} is explained in my own words with an example and boundary.`
        }
      }
    );
    expect(completion.ok()).toBeTruthy();
  }

  await page.route(
    `**/api/domains/${domain.id}/knowledge-graph/relation-candidates`,
    async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          candidates: [
            {
              targetWordId: conceptB.id,
              relationType: "related",
              status: "candidate",
              evidenceStrength: "medium",
              detail: "Concept B reuses and extends the boundary introduced by Concept A.",
              userQuestion: "Does this connection hold outside the original example?",
              applicability: "When both concepts describe the same application boundary.",
              misuseRisk: "Do not treat the connection as a universal dependency.",
              shouldCreateWormhole: false
            }
          ],
          targets: [
            {
              id: conceptB.id,
              text: "Concept B",
              canvasName: domain.name,
              isWormholeTarget: false
            }
          ]
        })
      });
    }
  );
  await page.route(
    `**/api/domains/${domain.id}/knowledge-graph/organize-core`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          insight: {
            summary: "The current concepts share a boundary worth revisiting.",
            coreConcepts: [
              {
                title: "Shared boundary",
                essence: "Both concepts depend on the same stated condition.",
                knowledgePointIds: [conceptA.id, conceptB.id],
                whyItMatters: "It prevents the relation from becoming an implicit universal rule."
              }
            ],
            priorityGaps: ["State one counterexample."]
          }
        })
      });
    }
  );
  await page.route(
    `**/api/domains/${domain.id}/knowledge-graph/relations/*/explain`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          explanation: {
            summary: "This relation connects the shared boundary.",
            connectionLogic: ["Concept B extends the condition introduced by Concept A."],
            boundaryCheck: "It applies only when the same condition is present.",
            evidenceNote: "The explanation remains a review aid until the learner confirms it.",
            misuseRisk: "Do not treat it as a universal dependency."
          }
        })
      });
    }
  );
  await page.route(
    `**/api/domains/${domain.id}/knowledge-graph/relations/*`,
    async (route) => {
      if (route.request().method() === "PUT") {
        await new Promise((resolve) => setTimeout(resolve, 1500));
      }
      await route.fallback();
    }
  );

  await page.goto(`/learning/domains/${domain.id}`);
  await expect(page.getByRole("heading", { name: `${domain.name} map` })).toBeVisible();
  await expect(page.getByText("Concept A", { exact: true })).toBeVisible();
  await expect(page.getByText("Concept B", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "前置关系图" }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(2);
  await page.getByRole("button", { name: "Stage 目录" }).click();
  await page.locator(
    `a[href="/learning/domains/${domain.id}/items/${conceptA.id}"]`
  ).click();
  await expect(page.getByRole("heading", { name: "Concept A", exact: true })).toBeVisible();
  await page.getByPlaceholder(/我认为/).fill(
    "Concept A is my foundation because it explains the shared boundary before application."
  );
  await page.getByRole("button", { name: "我确认，沉淀并返回地图" }).click();
  await expect(page).toHaveURL(`/learning/domains/${domain.id}`);

  await page.getByRole("link", { name: "知识体系图谱" }).click();
  await expect(page.getByRole("heading", { name: "知识体系图谱" })).toBeVisible();
  await page.getByRole("button", { name: "AI 整理核心概念" }).click();
  await expect(page.getByText("整理结果", { exact: true })).toBeVisible();
  await expect(page.getByText("Shared boundary", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Concept A/ }).click();
  await expect(page.getByRole("heading", { name: /从“Concept A”出发/ })).toBeVisible();
  const relationQuestionInput = page.getByPlaceholder(
    "可选关注点：前置关系、边界、类比、迁移等"
  );
  await relationQuestionInput.fill("Check the boundary before generating candidates.");
  await page.getByRole("button", { name: "AI 生成关系候选" }).click();
  await expect(relationQuestionInput).toBeDisabled();
  await expect(page.getByRole("button", { name: /Concept B/ }).first()).toBeDisabled();
  await expect(page.getByText("Concept B", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "保存候选" }).click();
  await expect(page.getByText("关系候选已写入知识体系图谱，仍需确认后才会成为正式关系。", { exact: true })).toBeVisible();

  const relationButton = page.getByRole("button", { name: /Concept A\s*->\s*Concept B/ });
  await expect(relationButton).toBeVisible();
  await relationButton.click();
  await expect(page.getByRole("heading", { name: "Concept A -> Concept B" })).toBeVisible();
  await page.getByRole("button", { name: "AI 解释关系" }).click();
  await expect(page.getByText("This relation connects the shared boundary.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "确认为正式关系" }).click();
  await expect(page.getByText("确认或降级关系前，请先写下你的解释和证据。", { exact: true })).toBeVisible();

  const relationExplanationInput = page.getByPlaceholder(
    "写下你确认或降级这条关系的解释、证据和保留意见。"
  );
  await relationExplanationInput.fill(
    "I confirm this relation because Concept B extends the boundary established by Concept A."
  );
  await page.getByPlaceholder("适用边界").fill("Use it when the same boundary is present.");
  await page.getByPlaceholder("误用风险").fill("Do not infer a universal dependency.");
  await page.getByRole("button", { name: "确认为正式关系" }).click();
  await expect(relationExplanationInput).toBeDisabled();
  await expect(page.getByText("关系已确认。", { exact: true })).toBeVisible();

  const graphResponse = await request.get(
    `/api/domains/${domain.id}/knowledge-graph/relations`
  );
  expect(graphResponse.ok()).toBeTruthy();
  const graph = await graphResponse.json();
  expect(graph.relations).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        status: "confirmed",
        fromKnowledgePointId: conceptA.id,
        toKnowledgePointId: conceptB.id
      })
    ])
  );
});
