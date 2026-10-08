import {
  expect,
  test,
  type APIRequestContext,
  type Page
} from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { recordPassingMapDraftReview } from "./helpers/roadmap-quality";

type LearningDomain = {
  id: string;
  name: string;
};

const prisma = new PrismaClient();
const createdDomainIds = new Set<string>();

const persistConfirmedPlanningFixture = async (
  request: APIRequestContext,
  domainId: string
) => {
  const confirmationResponse = await request.patch(
    `/api/domains/${domainId}/task-brief`
  );
  expect(confirmationResponse.ok()).toBeTruthy();
  await prisma.domain.update({
    where: { id: domainId },
    data: {
      courseDesignDraft: JSON.stringify(courseDesignFixture),
      courseDesignStatus: "draft",
      courseDesignRepairCount: 0,
      courseDesignConfirmedAt: null,
      courseDesignAiCallLogId: `e2e-course-design-${domainId}`
    }
  });
};

const persistMapDraftFixture = async (
  request: APIRequestContext,
  domainId: string,
  draft: object
) => {
  const response = await request.patch(`/api/domains/${domainId}/map`, {
    data: {
      draft,
      courseDesignAiCallLogId: `e2e-course-design-${domainId}`
    }
  });
  expect(response.ok()).toBeTruthy();
  if ((draft as { planningVersion?: number }).planningVersion === 2) {
    const persisted = await prisma.domain.findUniqueOrThrow({
      where: { id: domainId },
      select: { roadmapDraftJson: true }
    });
    await recordPassingMapDraftReview(prisma, {
      domainId,
      draft: JSON.parse(persisted.roadmapDraftJson || "{}"),
      courseDesignAiCallLogId: `e2e-course-design-${domainId}`
    });
  }
};

const cleanupE2eDomains = async (request: APIRequestContext) => {
  const domainIds = Array.from(createdDomainIds);
  createdDomainIds.clear();
  await Promise.all(
    domainIds.map((domainId) => request.delete(`/api/domains/${domainId}`))
  );
};

const createMappedDomain = async (
  request: APIRequestContext,
  name: string
): Promise<LearningDomain> => {
  const domainResponse = await request.post("/api/domains", {
    data: {
      name,
      goal: "Verify the PRD v1.2 learning flow",
      scope: "domain map, node learning, diagnostic",
      taskBrief: "User-confirmed task brief for the PRD v1.2 E2E flow."
    }
  });
  expect(domainResponse.ok()).toBeTruthy();
  const { domain } = await domainResponse.json();
  createdDomainIds.add(domain.id);
  await persistConfirmedPlanningFixture(request, domain.id);
  const draft = {
    planningVersion: 2 as const,
    title: `${name} map`,
    status: "confirmed",
    stages: [
      {
        key: "unit-1",
        title: "Unit 1",
        goal: "Complete two concepts",
        status: "expanded",
        moduleDirections: ["Core module"],
        moduleBlueprints: [
          {
            key: "core-module",
            title: "Core module",
            goal: "Build a minimal route",
            keyQuestions: [
              {
                key: "concept-a-plan",
                question: "What does Concept A explain?",
                checkableOutcome: "Explain Concept A with an example."
              },
              {
                key: "concept-b-plan",
                question: "How does Concept B extend Concept A?",
                checkableOutcome: "Connect Concept B back to Concept A."
              }
            ]
          }
        ],
        prerequisiteStageKeys: [],
        modules: [
          {
            title: "Core module",
            goal: "Build a minimal route",
            items: [
              {
                key: "concept-a",
                title: "Concept A",
                keyQuestion: "What does Concept A explain?",
                objective: "Explain Concept A with an example.",
                prerequisite: "Domain goal",
                commonMistake: "Copying an answer without boundaries.",
                transferPrompt: "Apply Concept A to a new situation.",
                prerequisiteKeys: [],
                planningQuestionKey: "concept-a-plan",
                status: "not_started"
              },
              {
                key: "concept-b",
                title: "Concept B",
                keyQuestion: "How does Concept B extend Concept A?",
                objective: "Connect Concept B back to Concept A.",
                prerequisite: "Concept A",
                commonMistake: "Treating the two concepts as unrelated.",
                transferPrompt: "Compare Concept A and B.",
                prerequisiteKeys: ["concept-a"],
                planningQuestionKey: "concept-b-plan",
                status: "not_started"
              }
            ]
          }
        ]
      }
    ]
  };
  await persistMapDraftFixture(request, domain.id, draft);
  const mapResponse = await request.post(`/api/domains/${domain.id}/map`, {
    data: {
      courseDesign: courseDesignFixture,
      draft,
      reason: "E2E confirmed map"
    }
  });
  expect(mapResponse.ok()).toBeTruthy();

  return domain as LearningDomain;
};

const courseDesignFixture = {
  taskBriefSnapshot: "User-confirmed task brief for the PRD v1.2 E2E flow.",
  globalExplanation: {
    theorySkeleton: "Use foundations before application while preserving parallel branches.",
    sourceBasis: "E2E fixture uses a controlled course source for deterministic testing.",
    optimizationRationale: "Prerequisite correctness remains ahead of display order.",
    risksAndValidation: "The learner must review every generated Stage before confirmation."
  },
  sources: [
    {
      url: "https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/",
      title: "MIT 18.06 Linear Algebra",
      reason: "Provides a deterministic source for the test course design."
    }
  ],
  keyTradeoffs: ["Keep the fixture short while preserving prerequisite semantics."]
};

const createDomain = async (request: APIRequestContext, name: string) => {
  const response = await request.post("/api/domains", {
    data: {
      name,
      goal: "Verify recoverable progressive Domain Map planning",
      scope: "planning drafts and progressive Stage expansion",
      taskBrief: "User-confirmed task brief for recoverable Domain Map planning."
    }
  });
  expect(response.ok()).toBeTruthy();
  const { domain } = await response.json();
  await persistConfirmedPlanningFixture(request, domain.id);
  return domain as LearningDomain;
};

const plannedStages = [
  {
    key: "foundations",
    title: "Foundations",
    goal: "Build the first principles.",
    status: "planned",
    rationale: "Start from the stable conceptual base.",
    moduleDirections: ["Core concepts"],
    moduleBlueprints: [
      {
        key: "core-concepts",
        title: "Core concepts",
        goal: "Explain the stable conceptual base.",
        keyQuestions: [
          {
            key: "foundation-meaning",
            question: "What makes the foundation coherent?",
            checkableOutcome: "Explain the foundation with one boundary."
          }
        ]
      }
    ],
    prerequisiteStageKeys: [],
    modules: []
  },
  {
    key: "applications",
    title: "Applications",
    goal: "Apply foundations in parallel contexts.",
    status: "planned",
    rationale: "Delay detail until the learner requests it.",
    moduleDirections: ["Applied practice"],
    moduleBlueprints: [
      {
        key: "applied-practice",
        title: "Applied practice",
        goal: "Apply the foundation in a new context.",
        keyQuestions: [
          {
            key: "application-transfer",
            question: "How does the foundation transfer to an application?",
            checkableOutcome: "Apply it and explain one failure boundary."
          }
        ]
      }
    ],
    prerequisiteStageKeys: ["foundations"],
    modules: []
  }
];

const installDeterministicStageGeneration = async (
  page: Page,
  request: APIRequestContext,
  domainId: string,
  options: { failFirst?: boolean } = {}
) => {
  let attempts = 0;
  await page.route(`**/api/domains/${domainId}/map/ai-draft`, async (route) => {
    const payload = (await route.request().postDataJSON()) as {
      step?: string;
      stageKey?: string;
      baseRevision?: number;
    };
    if (payload.step !== "stage") {
      await route.continue();
      return;
    }
    attempts += 1;
    if (options.failFirst && attempts === 1) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "E2E temporary Stage generation failure." })
      });
      return;
    }

    const mapResponse = await request.get(`/api/domains/${domainId}/map`);
    expect(mapResponse.ok()).toBeTruthy();
    const mapData = await mapResponse.json();
    const baseDraft =
      mapData.draft ||
      ({
        planningVersion: 2,
        title: mapData.map.roadmap.title,
        status: "draft",
        baseRevision: mapData.map.roadmap.mapRevision,
        stages: mapData.map.units.map((unit: any) => ({
          key: unit.key,
          title: unit.title,
          goal: unit.goal,
          status: unit.status,
          rationale: unit.rationale,
          moduleDirections: unit.moduleDirections,
          moduleBlueprints: unit.moduleBlueprints,
          prerequisiteStageKeys: unit.prerequisiteStageKeys,
          modules: []
        }))
      } as const);
    expect(payload.baseRevision).toBe(mapData.map.roadmap.mapRevision);
    const target = baseDraft.stages.find(
      (stage: any) => stage.key === payload.stageKey
    );
    expect(target).toBeTruthy();
    const generatedStage = {
      ...target,
      status: "expanded",
      rationale: "Deterministic E2E Stage expansion.",
      modules: (target.moduleBlueprints || []).map((blueprint: any) => ({
        title: blueprint.title,
        goal: blueprint.goal,
        items: blueprint.keyQuestions.map((question: any, index: number) => ({
          key: `${target.key}-${question.key}-node`,
          title: `${blueprint.title} ${index + 1}`,
          keyQuestion: question.question,
          objective: question.checkableOutcome,
          prerequisite: null,
          commonMistake: "Treating order as an implicit prerequisite.",
          transferPrompt: "Apply this answer in a nearby context.",
          prerequisiteKeys: [],
          planningQuestionKey: question.key,
          status: "not_started"
        }))
      }))
    };
    const draft = {
      ...baseDraft,
      status: "draft",
      stages: baseDraft.stages.map((stage: any) =>
        stage.key === target.key ? generatedStage : stage
      )
    };
    await persistMapDraftFixture(request, domainId, draft);
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        stage: generatedStage,
        stageIndex: baseDraft.stages.findIndex(
          (stage: any) => stage.key === target.key
        ),
        draft,
        source: "ai",
        aiCallLogId: "e2e-stage-generation",
        aiCallLogIds: ["e2e-stage-generation"],
        qualityReport: {
          status: "passed",
          summary: "Deterministic E2E coverage review passed.",
          blockingIssues: [],
          warnings: []
        },
        reviewState: "passed"
      })
    });
  });
  return { attempts: () => attempts };
};

const installDeterministicMapReview = async (
  page: Page,
  request: APIRequestContext,
  domainId: string,
  options: { delayMs?: number } = {}
) => {
  await page.route(`**/api/domains/${domainId}/map/reviews`, async (route) => {
    if (options.delayMs) {
      await new Promise((resolve) => setTimeout(resolve, options.delayMs));
    }
    const mapResponse = await request.get(`/api/domains/${domainId}/map`);
    expect(mapResponse.ok()).toBeTruthy();
    const mapData = await mapResponse.json();
    expect(mapData.draft?.planningVersion).toBe(2);
    await recordPassingMapDraftReview(prisma, {
      domainId,
      draft: mapData.draft,
      courseDesignAiCallLogId: mapData.draftCourseDesignAiCallLogId,
      scope: "stage",
      stageKey: mapData.draft.stages.find(
        (stage: { status: string }) => stage.status === "expanded"
      )?.key
    });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        draft: mapData.draft,
        mapRevision: mapData.mapRevision,
        reviewState: "passed",
        qualityReport: {
          status: "passed",
          summary: "Deterministic E2E edited-draft review passed.",
          blockingIssues: [],
          warnings: []
        },
        aiCallLogIds: ["e2e-review"],
        repairAttempts: 0
      })
    });
  });
};

const createPlannedDomain = async (request: APIRequestContext, name: string) => {
  const domain = await createDomain(request, name);
  const draft = {
    planningVersion: 2 as const,
    title: `${name} progressive map`,
    status: "confirmed",
    baseRevision: 0,
    stages: plannedStages
  };
  await persistMapDraftFixture(request, domain.id, draft);
  const response = await request.post(`/api/domains/${domain.id}/map`, {
    data: {
      courseDesign: courseDesignFixture,
      draft,
      reason: "E2E confirms the complete Stage skeleton."
    }
  });
  expect(response.ok()).toBeTruthy();
  return domain;
};

const complexDagItems = [
  { key: "root-a", title: "Root A", prerequisiteKeys: [] },
  { key: "root-b", title: "Root B", prerequisiteKeys: [] },
  { key: "left-branch", title: "Left Branch", prerequisiteKeys: ["root-a"] },
  { key: "right-branch", title: "Right Branch", prerequisiteKeys: ["root-b"] },
  {
    key: "merge",
    title: "Merge",
    prerequisiteKeys: ["left-branch", "right-branch"]
  },
  { key: "started-keep", title: "Started Keep", prerequisiteKeys: [] },
  { key: "knowledge-keep", title: "Knowledge Keep", prerequisiteKeys: [] }
].map((item) => ({
  ...item,
  keyQuestion: `What makes ${item.title} independently verifiable?`,
  objective: `Explain ${item.title}.`,
  prerequisite: "Only explicit prerequisite keys apply.",
  commonMistake: "Inferring dependency from display order.",
  transferPrompt: `Transfer ${item.title} to another context.`,
  planningQuestionKey: `plan-${item.key}`,
  status: "not_started"
}));

const complexDagStage = (items = complexDagItems) => ({
  key: "dag-stage",
  title: "Parallel DAG",
  goal: "Preserve multiple roots, parallel branches, and multiple prerequisites.",
  status: "expanded",
  rationale: "The subject structure is not linear.",
  moduleDirections: ["DAG module"],
  moduleBlueprints: [
    {
      key: "dag-module",
      title: "DAG module",
      goal: "Exercise explicit dependency semantics.",
      keyQuestions: items.map((item) => ({
        key: `plan-${item.key}`,
        question: item.keyQuestion,
        checkableOutcome: item.objective
      }))
    }
  ],
  prerequisiteStageKeys: [],
  modules: [
    {
      title: "DAG module",
      goal: "Exercise explicit dependency semantics.",
      items
    }
  ]
});

const createComplexDagDomain = async (request: APIRequestContext, name: string) => {
  const domain = await createDomain(request, name);
  const draft = {
    planningVersion: 2 as const,
    title: `${name} DAG map`,
    status: "confirmed",
    baseRevision: 0,
    stages: [complexDagStage()]
  };
  await persistMapDraftFixture(request, domain.id, draft);
  const response = await request.post(`/api/domains/${domain.id}/map`, {
    data: {
      courseDesign: courseDesignFixture,
      draft,
      reason: "E2E confirms an explicit non-linear DAG."
    }
  });
  expect(response.ok()).toBeTruthy();
  return domain;
};

test.afterEach(async ({ request }) => {
  await cleanupE2eDomains(request);
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("domain map keeps explicit prerequisites and materializes the learner's understanding", async ({
  page,
  request
}) => {
  const domainName = `e2e-learning-domain-${Date.now()}`;
  const domain = await createMappedDomain(request, domainName);
  const answer = "Concept A explains a focused idea, with an example and boundary.";

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "学习领域" })).toBeVisible();
  await page.getByRole("link", { name: domainName }).click();

  await expect(
    page.getByRole("heading", { name: domainName, exact: true })
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: `${domainName} map` })).toBeVisible();
  await expect(page.getByRole("link", { name: "学习诊断" })).toHaveAttribute(
    "href",
    `/learning/domains/${domain.id}/diagnostics`
  );
  const conceptALink = page.getByRole("link", {
    name: /^知识点 可学习 Concept A Core module/
  });
  const conceptBLink = page.getByRole("link", {
    name: /^知识点 可学习 Concept B Core module/
  });
  await expect(conceptALink).toBeVisible();
  await expect(conceptBLink).toContainText("尚有 1 个前置节点未完成");

  await page.getByRole("button", { name: "前置关系图" }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(2);
  await expect(page.locator(".react-flow__edge")).toHaveCount(1);
  await page.getByRole("button", { name: "Stage 目录" }).click();

  const conceptAHref = await conceptALink.getAttribute("href");
  expect(conceptAHref).toBeTruthy();
  const nodeDetailLoaded = page.waitForResponse(
    (response) =>
      response.request().method() === "GET" &&
      response.url().includes(`/api/domains/${domain.id}/nodes/`) &&
      response.ok(),
    { timeout: 15_000 }
  );
  await conceptALink.click();
  await nodeDetailLoaded;
  await expect(
    page.getByRole("heading", { name: "Concept A", exact: true })
  ).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "开始学习" }).click();
  await expect(page.getByText(/节点已开始/)).toBeVisible();
  await expect(page.getByText("学习中")).toBeVisible();

  await page
    .getByPlaceholder("我认为……因为……一个例子是……它不适用于……")
    .fill(answer);
  await page.getByRole("button", { name: "我确认，沉淀并返回地图" }).click();
  await expect(page).toHaveURL(`/learning/domains/${domain.id}`);
  await page.getByRole("link", { name: "知识体系图谱" }).click();
  await expect(page.getByRole("heading", { name: "知识体系图谱" })).toBeVisible();
  const conceptNode = page.getByRole("button", { name: /Concept A/ });
  await expect(conceptNode).toContainText("已接触");
  const graphResponse = await request.get(
    `/api/domains/${domain.id}/knowledge-graph/relations`
  );
  expect(graphResponse.ok()).toBeTruthy();
  const graph = await graphResponse.json();
  const conceptA = graph.nodes.find(
    (candidate: { title: string }) => candidate.title === "Concept A"
  );
  expect(conceptA.status).toBe("seen");
  const mapResponse = await request.get(`/api/domains/${domain.id}/map`);
  const mapData = await mapResponse.json();
  const conceptAMapNode = mapData.map.nodes.find(
    (candidate: { title: string }) => candidate.title === "Concept A"
  );
  const nodeResponse = await request.get(
    `/api/domains/${domain.id}/nodes/${conceptAMapNode.id}`
  );
  const nodeData = await nodeResponse.json();
  expect(nodeData.item.linkedWord.userUnderstanding).toBe(answer);
  expect(nodeData.item.linkedWord.masteryStatus).toBe("seen");

  createdDomainIds.delete(domain.id);
  await request.delete(`/api/domains/${domain.id}`);
});

test("formal map reports a network failure instead of staying on the loading screen", async ({
  page,
  request
}) => {
  const domain = await createMappedDomain(request, `e2e-learning-map-network-${Date.now()}`);
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route(`**/api/domains/${domain.id}/map`, async (route) => {
    await route.abort("failed");
  });

  await page.goto(`/learning/domains/${domain.id}`);
  await expect(page.getByText("加载领域地图失败：无法连接到应用服务。", { exact: true })).toBeVisible();
  await expect(page.getByText("正在加载领域地图...", { exact: true })).not.toBeVisible();
  expect(pageErrors).toEqual([]);
});

test("learning-node AI check can be retried after a network failure", async ({
  page,
  request
}) => {
  const domain = await createMappedDomain(request, `e2e-learning-node-network-${Date.now()}`);
  const mapResponse = await request.get(`/api/domains/${domain.id}/map`);
  expect(mapResponse.ok()).toBeTruthy();
  const mapData = await mapResponse.json();
  const node = mapData.map.nodes.find(
    (candidate: { title: string }) => candidate.title === "Concept A"
  );
  expect(node).toBeTruthy();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route(
    `**/api/domains/${domain.id}/nodes/${node.id}`,
    async (route) => {
      if (route.request().method() === "GET") {
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
      await route.continue();
    }
  );
  await page.route(
    `**/api/domains/${domain.id}/nodes/${node.id}/check-answer`,
    async (route) => {
      await route.abort("failed");
    }
  );

  await page.goto(`/learning/domains/${domain.id}/items/${node.id}`);
  const understanding = page.getByPlaceholder(/我认为/);
  const answer = "My own explanation with an example and boundary.";
  await understanding.fill(answer);
  await page.getByRole("button", { name: "让 AI 给检查建议" }).click();
  await expect(
    page.getByText("AI 检查暂时不可用：无法连接到应用服务。 你仍可自行检查后确认沉淀。", {
      exact: true
    })
  ).toBeVisible();
  await expect(page.getByText("AI 检查失败，可自行确认", { exact: true })).toBeVisible();
  await expect(understanding).toHaveValue(answer);
  await expect(page.getByRole("button", { name: "让 AI 给检查建议" })).toBeEnabled();
  expect(pageErrors).toEqual([]);
});

test("learning-node answer stays fixed during a long AI check", async ({
  page,
  request
}) => {
  const domain = await createMappedDomain(request, `e2e-learning-node-lock-${Date.now()}`);
  const mapResponse = await request.get(`/api/domains/${domain.id}/map`);
  expect(mapResponse.ok()).toBeTruthy();
  const mapData = await mapResponse.json();
  const node = mapData.map.nodes.find(
    (candidate: { title: string }) => candidate.title === "Concept A"
  );
  expect(node).toBeTruthy();

  await page.route(
    `**/api/domains/${domain.id}/nodes/${node.id}/check-answer`,
    async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          feedback: {
            summary: "The delayed check completed.",
            accurateParts: [],
            vagueParts: [],
            missingBoundaries: [],
            nextRevisionPrompt: null
          }
        })
      });
    }
  );

  await page.goto(`/learning/domains/${domain.id}/items/${node.id}`);
  const understanding = page.getByPlaceholder(/我认为/);
  await understanding.fill("My own explanation with an example and boundary.");
  await page.getByRole("button", { name: "让 AI 给检查建议" }).click();

  await expect(understanding).toBeDisabled();
  await expect(page.getByText("The delayed check completed.", { exact: true })).toBeVisible();
  await expect(understanding).toBeEnabled();
});

test("diagnostic answer saving can be retried after a network failure", async ({
  page,
  request
}) => {
  const domain = await createMappedDomain(request, `e2e-learning-diagnostic-network-${Date.now()}`);
  const sessionResponse = await request.post(`/api/domains/${domain.id}/diagnostics`, {
    data: {
      title: "Network retry diagnostic",
      questions: [{ prompt: "Explain Concept A.", expectedAnswer: "Use an example and boundary." }]
    }
  });
  expect(sessionResponse.ok()).toBeTruthy();
  const sessionData = await sessionResponse.json();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/api/diagnostic-questions/*/answers", async (route) => {
    await route.abort("failed");
  });

  await page.goto(`/learning/domains/${domain.id}/diagnostics/${sessionData.session.id}`);
  await page.getByPlaceholder("先写下你的答案。").fill("My answer includes an example and a boundary.");
  await page.getByRole("button", { name: "保存答案" }).click();
  await expect(
    page.getByText("保存答案失败：无法连接到应用服务。", { exact: true })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "保存答案" })).toBeEnabled();
  expect(pageErrors).toEqual([]);
});

test("knowledge-graph relation candidates can be retried after a network failure", async ({
  page,
  request
}) => {
  const domain = await createMappedDomain(request, `e2e-learning-graph-network-${Date.now()}`);
  const mapResponse = await request.get(`/api/domains/${domain.id}/map`);
  expect(mapResponse.ok()).toBeTruthy();
  const mapData = await mapResponse.json();
  for (const node of mapData.map.nodes as Array<{ id: string; title: string }>) {
    const completion = await request.post(`/api/domains/${domain.id}/nodes/${node.id}/complete`, {
      data: { userUnderstanding: `${node.title} is explained with my own example and boundary.` }
    });
    expect(completion.ok()).toBeTruthy();
  }
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route(
    `**/api/domains/${domain.id}/knowledge-graph/relation-candidates`,
    async (route) => {
      await route.abort("failed");
    }
  );

  await page.goto(`/learning/domains/${domain.id}/knowledge-graph`);
  await page.getByRole("button", { name: /Concept A/ }).click();
  await page.getByRole("button", { name: "AI 生成关系候选" }).click();
  await expect(
    page.getByText("生成关系候选失败：无法连接到应用服务。", { exact: true })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "AI 生成关系候选" })).toBeEnabled();
  expect(pageErrors).toEqual([]);
});

test("AI failure leaves the learner in control of final seen knowledge confirmation", async ({
  page,
  request
}) => {
  const domainName = `e2e-learning-ai-failure-${Date.now()}`;
  const domain = await createMappedDomain(request, domainName);
  const mapResponse = await request.get(`/api/domains/${domain.id}/map`);
  const mapData = await mapResponse.json();
  const node = mapData.map.nodes.find(
    (candidate: { title: string }) => candidate.title === "Concept A"
  );
  expect(node).toBeTruthy();

  await page.route(
    `**/api/domains/${domain.id}/nodes/${node.id}/check-answer`,
    async (route) => {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "E2E AI provider unavailable." })
      });
    }
  );

  await page.goto(`/learning/domains/${domain.id}/items/${node.id}`);
  await expect(
    page.getByRole("heading", { name: "Concept A", exact: true })
  ).toBeVisible();
  await expect(page.getByText("未经 AI 检查（可直接确认）")).toBeVisible();
  const answer = "My own explanation remains valid evidence even when AI is offline.";
  await page.getByPlaceholder(/我认为/).fill(answer);
  await page.getByRole("button", { name: "让 AI 给检查建议" }).click();

  await expect(page.getByText(/E2E AI provider unavailable/)).toBeVisible();
  await expect(page.getByText("AI 检查失败，可自行确认")).toBeVisible();
  const beforeConfirmation = await request.get(
    `/api/domains/${domain.id}/nodes/${node.id}`
  );
  expect((await beforeConfirmation.json()).item.linkedWord).toBeNull();

  await page.getByRole("button", { name: "我确认，沉淀并返回地图" }).click();
  await expect(page).toHaveURL(`/learning/domains/${domain.id}`);
  const afterConfirmation = await request.get(
    `/api/domains/${domain.id}/nodes/${node.id}`
  );
  const confirmedNode = await afterConfirmation.json();
  expect(confirmedNode.item.linkedWord).toMatchObject({
    userUnderstanding: answer,
    masteryStatus: "seen"
  });
});

test("AI feedback never substitutes for the learner's final confirmation", async ({
  page,
  request
}) => {
  const domainName = `e2e-learning-ai-feedback-${Date.now()}`;
  const domain = await createMappedDomain(request, domainName);
  const mapResponse = await request.get(`/api/domains/${domain.id}/map`);
  const mapData = await mapResponse.json();
  const node = mapData.map.nodes.find(
    (candidate: { title: string }) => candidate.title === "Concept A"
  );
  expect(node).toBeTruthy();

  await page.route(
    `**/api/domains/${domain.id}/nodes/${node.id}/check-answer`,
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          feedback: {
            summary: "The explanation is useful but still belongs to the learner.",
            accurateParts: ["It uses the learner's own example."],
            vagueParts: [],
            missingBoundaries: ["State one non-example."],
            nextRevisionPrompt: "Add a boundary before deciding whether to save it."
          }
        })
      });
    }
  );

  await page.goto(`/learning/domains/${domain.id}/items/${node.id}`);
  await expect(
    page.getByRole("heading", { name: "Concept A", exact: true })
  ).toBeVisible();
  await page
    .getByPlaceholder(/我认为/)
    .fill("This is my own explanation, pending my final confirmation.");
  await page.getByRole("button", { name: "让 AI 给检查建议" }).click();

  await expect(page.getByText("AI 已给检查建议")).toBeVisible();
  await expect(page.getByText(/最终是否沉淀由你确认/)).toBeVisible();
  const nodeResponse = await request.get(
    `/api/domains/${domain.id}/nodes/${node.id}`
  );
  expect((await nodeResponse.json()).item.linkedWord).toBeNull();
});

test("formal and compatibility APIs cannot bypass first-seen mastery gates", async ({
  request
}) => {
  const domainName = `e2e-learning-mastery-gate-${Date.now()}`;
  const domain = await createMappedDomain(request, domainName);
  const mapResponse = await request.get(`/api/domains/${domain.id}/map`);
  const mapData = await mapResponse.json();
  const node = mapData.map.nodes.find(
    (candidate: { title: string }) => candidate.title === "Concept A"
  );
  expect(node).toBeTruthy();

  const directPatch = await request.patch(
    `/api/domains/${domain.id}/nodes/${node.id}`,
    { data: { masteryStatus: "integrated" } }
  );
  expect(directPatch.status()).toBe(405);
  const directMaterialize = await request.post(
    `/api/domains/${domain.id}/nodes/${node.id}/materialize`,
    { data: { masteryStatus: "integrated" } }
  );
  expect(directMaterialize.status()).toBe(409);

  const completeResponse = await request.post(
    `/api/domains/${domain.id}/nodes/${node.id}/complete`,
    {
      data: {
        userUnderstanding: "My own explanation is the only first-knowledge evidence.",
        masteryStatus: "integrated"
      }
    }
  );
  expect(completeResponse.ok()).toBeTruthy();
  expect((await completeResponse.json()).word.masteryStatus).toBe("seen");

  for (const masteryStatus of ["can_apply", "can_transfer", "integrated"]) {
    const createAttempt = await request.post("/api/words", {
      data: {
        canvasId: domain.id,
        word: `Forged ${masteryStatus}`,
        masteryStatus
      }
    });
    expect(createAttempt.status()).toBe(400);

    const updateAttempt = await request.patch(
      `/api/words/${node.id}?canvasId=${domain.id}`,
      {
        data: {
          word: "Concept A",
          masteryStatus
        }
      }
    );
    expect(updateAttempt.status()).toBe(400);
  }

  const nodeResponse = await request.get(
    `/api/domains/${domain.id}/nodes/${node.id}`
  );
  expect((await nodeResponse.json()).item.linkedWord.masteryStatus).toBe("seen");
});

test("the learner confirms the complete skeleton before triggering Stage expansion", async ({
  page,
  request
}) => {
  const domainName = `e2e-learning-planning-${Date.now()}`;
  const domain = await createDomain(request, domainName);
  const recoveredDraft = {
    planningVersion: 2 as const,
    title: `${domainName} recovered plan`,
    status: "draft",
    baseRevision: 0,
    stages: plannedStages
  };
  await persistMapDraftFixture(request, domain.id, recoveredDraft);
  await installDeterministicStageGeneration(page, request, domain.id);

  await page.goto(`/learning/domains/${domain.id}`);
  await expect(page.getByText("已恢复规划草稿")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: `${domainName} recovered plan` })
  ).toBeVisible();
  await expect(page.getByText("Foundations", { exact: true })).toBeVisible();
  await expect(page.getByText("Applications", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText("已恢复规划草稿")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: `${domainName} recovered plan` })
  ).toBeVisible();

  await page.getByRole("button", { name: "确认规划并建立正式地图" }).click();
  await expect(page.getByText("课程设计方向与完整 Stage 骨架已确认。")).toBeVisible();
  await expect(page.getByText("仍有待展开 Stage")).toBeVisible();

  await page.getByRole("button", { name: "展开这个 Stage" }).first().click();
  await expect(page.getByText("Stage 展开草稿")).toBeVisible();
  await expect(page.getByText(/Stage 草稿已按服务端蓝图生成/)).toBeVisible();

  await page.getByRole("button", { name: "确认并进入第一个学习节点" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/learning/domains/${domain.id}/items/[^/]+$`)
  );
  const nodeId = page.url().split("/").pop();
  const initialNodeResponse = await request.get(
    `/api/domains/${domain.id}/nodes/${nodeId}`
  );
  const initialNode = await initialNodeResponse.json();
  await expect(
    page.getByRole("heading", { name: initialNode.item.title, exact: true })
  ).toBeVisible();
  await page.getByRole("button", { name: "开始学习" }).click();
  await expect(
    page.getByText("节点已开始。可以准备教学、练习，或在下方写下自己的理解。")
  ).toBeVisible();
  const understanding =
    "I can explain this generated node in my own words and state one boundary.";
  await page.getByPlaceholder(/我认为/).fill(understanding);
  const confirmKnowledgeButton = page.getByRole("button", {
    name: "我确认，沉淀并返回地图"
  });
  await expect(confirmKnowledgeButton).toBeEnabled();
  await confirmKnowledgeButton.click();
  await expect(page).toHaveURL(`/learning/domains/${domain.id}`);

  const nodeResponse = await request.get(
    `/api/domains/${domain.id}/nodes/${nodeId}`
  );
  expect((await nodeResponse.json()).item.linkedWord).toMatchObject({
    userUnderstanding: understanding,
    masteryStatus: "seen"
  });
});

test("Stage draft can retry, persist through refresh, and then be confirmed", async ({
  page,
  request
}) => {
  const domainName = `e2e-learning-stage-${Date.now()}`;
  const domain = await createPlannedDomain(request, domainName);
  const generation = await installDeterministicStageGeneration(
    page,
    request,
    domain.id,
    { failFirst: true }
  );
  await installDeterministicMapReview(page, request, domain.id);

  await page.goto(`/learning/domains/${domain.id}`);
  const expandButton = page.getByRole("button", { name: "展开这个 Stage" }).first();
  await expandButton.click();
  await expect(page.getByText("E2E temporary Stage generation failure.")).toBeVisible();

  await expandButton.click();
  await expect(page.getByText("Stage 展开草稿")).toBeVisible();
  await expect(page.getByText(/Stage 草稿已按服务端蓝图生成/)).toBeVisible();
  expect(generation.attempts()).toBe(2);

  const stageTitle = page.locator('input[value="Foundations"]').first();
  await stageTitle.fill("Edited Foundations");
  await expect(
    page.getByRole("button", { name: "确认并进入第一个学习节点" })
  ).toBeDisabled();
  await page.getByRole("button", { name: "保存并复审路线质量" }).click();
  await expect(page.getByText(/Stage 路线质量复审已通过/)).toBeVisible();

  await page.reload();
  await expect(page.getByText("Stage 展开草稿")).toBeVisible();
  await expect(page.locator('input[value="Edited Foundations"]')).toBeVisible();
  await expect(
    page.getByRole("button", { name: "确认并进入第一个学习节点" })
  ).toBeEnabled();

  await page.getByRole("button", { name: "确认并进入第一个学习节点" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/learning/domains/${domain.id}/items/[^/]+$`)
  );
  const mapResponse = await request.get(`/api/domains/${domain.id}/map`);
  expect(mapResponse.ok()).toBeTruthy();
  const mapData = await mapResponse.json();
  const foundations = mapData.map.units.find(
    (unit: { key: string }) => unit.key === "foundations"
  );
  expect(foundations).toMatchObject({ title: "Edited Foundations", status: "expanded" });
  expect(mapData.draft).toBeNull();
});

test("Stage editor locks while route quality review is running", async ({
  page,
  request
}) => {
  const domain = await createPlannedDomain(request, `e2e-learning-stage-lock-${Date.now()}`);
  await installDeterministicStageGeneration(page, request, domain.id);
  await installDeterministicMapReview(page, request, domain.id, { delayMs: 1500 });

  await page.goto(`/learning/domains/${domain.id}`);
  await page.getByRole("button", { name: "展开这个 Stage" }).first().click();
  await expect(page.getByText("Stage 展开草稿")).toBeVisible();

  const stageTitle = page.locator("input").first();
  await stageTitle.fill("Edited while review runs");
  await page.getByRole("button", { name: "保存并复审路线质量" }).click();
  await expect(stageTitle).toBeDisabled();
});

test("stale Stage response cannot overwrite a newer map and offers conflict recovery", async ({
  page,
  request
}) => {
  const domainName = `e2e-learning-conflict-${Date.now()}`;
  const domain = await createPlannedDomain(request, domainName);
  await installDeterministicStageGeneration(page, request, domain.id);
  await installDeterministicMapReview(page, request, domain.id);

  await page.goto(`/learning/domains/${domain.id}`);
  await expect(page.getByText("Foundations", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "展开这个 Stage" }).first().click();
  await expect(page.getByText("Stage 展开草稿")).toBeVisible();
  await page.locator('input[value="Foundations"]').fill("Local Conflict Draft");

  const newerStages = plannedStages.map((stage) =>
    stage.key === "foundations" ? { ...stage, title: "Foundations v2" } : stage
  );
  const newerDraft = {
    planningVersion: 2 as const,
    title: `${domainName} progressive map`,
    status: "confirmed",
    baseRevision: 1,
    stages: newerStages
  };
  await persistMapDraftFixture(request, domain.id, newerDraft);
  const newerMapResponse = await request.post(`/api/domains/${domain.id}/map`, {
    data: {
      draft: newerDraft,
      reason: "E2E advances the formal map while the browser still holds revision 1."
    }
  });
  expect(newerMapResponse.ok()).toBeTruthy();

  await page.getByRole("button", { name: "保存并复审路线质量" }).click();
  await expect(page.getByText(/地图已更新，请刷新后重试/)).toBeVisible();
  await expect(page.getByRole("button", { name: "重新加载最新地图" })).toBeVisible();

  await page.getByRole("button", { name: "重新加载最新地图" }).click();
  await expect(page.getByText("Foundations v2", { exact: true })).toBeVisible();
  await expect(page.locator('input[value="Local Conflict Draft"]')).toBeVisible();
  await expect(page.getByText(/本地 Stage 编辑仍保留/)).toBeVisible();
  await expect(page.getByText(/地图已更新，请刷新后重试/)).not.toBeVisible();

  await page.getByRole("button", { name: "保存并复审路线质量" }).click();
  await expect(page.getByText(/Stage 路线质量复审已通过/)).toBeVisible();
  await page.getByRole("button", { name: "确认并进入第一个学习节点" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/learning/domains/${domain.id}/items/[^/]+$`)
  );

  const mapResponse = await request.get(`/api/domains/${domain.id}/map`);
  const mapData = await mapResponse.json();
  expect(mapData.map.roadmap.mapRevision).toBe(3);
  expect(mapData.map.units.find((unit: { key: string }) => unit.key === "foundations")).toMatchObject({
    title: "Local Conflict Draft",
    status: "expanded"
  });
});

test("parallel DAG and protected learning evidence survive map reconcile", async ({
  page,
  request
}) => {
  const domainName = `e2e-learning-dag-${Date.now()}`;
  const domain = await createComplexDagDomain(request, domainName);
  const initialResponse = await request.get(`/api/domains/${domain.id}/map`);
  const initialData = await initialResponse.json();
  const initialNodes = new Map(
    initialData.map.nodes.map((node: { key: string; id: string }) => [node.key, node])
  );
  const startedNode = initialNodes.get("started-keep") as { id: string };
  const knowledgeNode = initialNodes.get("knowledge-keep") as { id: string };

  expect((await request.post(`/api/domains/${domain.id}/nodes/${startedNode.id}/start`)).ok()).toBeTruthy();
  expect(
    (
      await request.post(`/api/domains/${domain.id}/nodes/${knowledgeNode.id}/complete`, {
        data: { userUnderstanding: "My confirmed understanding must survive reconcile." }
      })
    ).ok()
  ).toBeTruthy();

  const editedItems = complexDagItems.map((item) =>
    item.key === "started-keep"
      ? { ...item, title: "Started Keep Edited" }
      : item.key === "knowledge-keep"
        ? { ...item, title: "Knowledge Keep Edited" }
        : item
  );
  const reconcileDraft = {
    planningVersion: 2 as const,
    title: `${domainName} DAG map revised`,
    status: "confirmed",
    baseRevision: 1,
    stages: [complexDagStage(editedItems)]
  };
  await persistMapDraftFixture(request, domain.id, reconcileDraft);
  const reconcileResponse = await request.post(`/api/domains/${domain.id}/map`, {
    data: {
      draft: reconcileDraft,
      reason: "E2E reconciles by stable key while preserving learning evidence."
    }
  });
  expect(reconcileResponse.ok()).toBeTruthy();

  const reconciledResponse = await request.get(`/api/domains/${domain.id}/map`);
  const reconciledData = await reconciledResponse.json();
  const reconciledNodes = new Map(
    reconciledData.map.nodes.map((node: { key: string; id: string; status: string }) => [
      node.key,
      node
    ])
  );
  expect(reconciledNodes.get("started-keep")).toMatchObject({
    id: startedNode.id,
    status: "in_progress",
    title: "Started Keep Edited"
  });
  expect(reconciledNodes.get("knowledge-keep")).toMatchObject({
    id: knowledgeNode.id,
    status: "completed",
    title: "Knowledge Keep Edited"
  });

  const deletionDraft = {
    planningVersion: 2 as const,
    title: `${domainName} invalid deletion`,
    status: "confirmed",
    baseRevision: 2,
    stages: [
      complexDagStage(
        editedItems.filter(
          (item) => !["started-keep", "knowledge-keep"].includes(item.key)
        )
      )
    ]
  };
  await persistMapDraftFixture(request, domain.id, deletionDraft);
  const deletionResponse = await request.post(`/api/domains/${domain.id}/map`, {
    data: {
      draft: deletionDraft,
      reason: "E2E attempts to delete protected learning evidence."
    }
  });
  expect(deletionResponse.status()).toBe(400);
  expect((await deletionResponse.json()).error).toMatch(/已沉淀或已开始的节点/);

  await page.goto(`/learning/domains/${domain.id}`);
  await page.getByRole("button", { name: "前置关系图" }).click();
  await expect(page.locator(".react-flow__node")).toHaveCount(7);
  await expect(page.locator(".react-flow__edge")).toHaveCount(4);

  const finalResponse = await request.get(`/api/domains/${domain.id}/map`);
  const finalData = await finalResponse.json();
  expect(finalData.map.roadmap.mapRevision).toBe(2);
  expect(finalData.map.nodes.filter((node: { dependencyIds: string[] }) => node.dependencyIds.length === 0)).toHaveLength(4);
  expect(finalData.map.nodes.find((node: { key: string }) => node.key === "merge").dependencyIds).toHaveLength(2);
  const knowledgeDetails = await request.get(
    `/api/domains/${domain.id}/nodes/${knowledgeNode.id}`
  );
  const knowledgeData = await knowledgeDetails.json();
  expect(knowledgeData.item.linkedWord).toMatchObject({
    masteryStatus: "seen",
    userUnderstanding: "My confirmed understanding must survive reconcile."
  });
});

test("nested Domain resources reject forged cross-Domain URLs", async ({ request }) => {
  const suffix = Date.now();
  const domainA = await createComplexDagDomain(request, `e2e-learning-owner-a-${suffix}`);
  const domainB = await createComplexDagDomain(request, `e2e-learning-owner-b-${suffix}`);
  const mapBResponse = await request.get(`/api/domains/${domainB.id}/map`);
  const mapBData = await mapBResponse.json();
  const nodeB = mapBData.map.nodes.find((node: { key: string }) => node.key === "root-a");
  const nodeB2 = mapBData.map.nodes.find((node: { key: string }) => node.key === "root-b");
  const stageB = mapBData.map.units[0];

  for (const node of [nodeB, nodeB2]) {
    const completed = await request.post(`/api/domains/${domainB.id}/nodes/${node.id}/complete`, {
      data: { userUnderstanding: `Confirmed understanding for ${node.key}.` }
    });
    expect(completed.ok()).toBeTruthy();
  }

  const relationResponse = await request.post(
    `/api/domains/${domainB.id}/knowledge-graph/relations`,
    {
      data: {
        fromKnowledgePointId: nodeB.id,
        toKnowledgePointId: nodeB2.id,
        relationType: "related",
        detail: "Owned by Domain B."
      }
    }
  );
  expect(relationResponse.ok()).toBeTruthy();
  const relationId = (await relationResponse.json()).relation.id;

  const forgedCandidate = await request.post(
    `/api/domains/${domainA.id}/knowledge-graph/relation-candidates`,
    { data: { sourceKnowledgePointId: nodeB.id } }
  );
  expect(forgedCandidate.status()).toBe(404);
  const forgedRelationCreate = await request.post(
    `/api/domains/${domainA.id}/knowledge-graph/relations`,
    {
      data: {
        fromKnowledgePointId: nodeB.id,
        toKnowledgePointId: nodeB2.id,
        relationType: "related"
      }
    }
  );
  expect(forgedRelationCreate.status()).toBe(400);

  const forgedDiagnosticCreate = await request.post(
    `/api/domains/${domainA.id}/diagnostics`,
    {
      data: {
        title: "Forged diagnostic",
        questions: [{ prompt: "Cross-domain node", roadmapItemId: nodeB.id }]
      }
    }
  );
  expect(forgedDiagnosticCreate.status()).toBe(404);

  const diagnosticResponse = await request.post(`/api/domains/${domainB.id}/diagnostics`, {
    data: { title: "Domain B diagnostic", summary: "Ownership fixture", questions: [] }
  });
  expect(diagnosticResponse.ok()).toBeTruthy();
  const sessionId = (await diagnosticResponse.json()).session.id;

  const forgedNodeResponses = await Promise.all([
    request.get(`/api/domains/${domainA.id}/nodes/${nodeB.id}`),
    request.post(`/api/domains/${domainA.id}/nodes/${nodeB.id}/start`),
    request.post(`/api/domains/${domainA.id}/nodes/${nodeB.id}/complete`, {
      data: { userUnderstanding: "Forged cross-Domain write." }
    }),
    request.post(`/api/domains/${domainA.id}/nodes/${nodeB.id}/hint`, { data: {} }),
    request.post(`/api/domains/${domainA.id}/nodes/${nodeB.id}/check-answer`, { data: {} }),
    request.post(`/api/domains/${domainA.id}/nodes/${nodeB.id}/practice`, { data: {} }),
    request.post(`/api/domains/${domainA.id}/nodes/${nodeB.id}/materialize`, { data: {} }),
    request.post(`/api/domains/${domainA.id}/nodes/${nodeB.id}/route-suggestions`, {
      data: {}
    })
  ]);
  expect(forgedNodeResponses.map((response) => response.status())).toEqual(
    Array(forgedNodeResponses.length).fill(404)
  );

  const forgedRelationResponses = await Promise.all([
    request.put(
      `/api/domains/${domainA.id}/knowledge-graph/relations/${relationId}`,
      { data: { detail: "Forged update." } }
    ),
    request.post(
      `/api/domains/${domainA.id}/knowledge-graph/relations/${relationId}/explain`,
      { data: {} }
    ),
    request.delete(`/api/domains/${domainA.id}/knowledge-graph/relations/${relationId}`)
  ]);
  expect(forgedRelationResponses.map((response) => response.status())).toEqual([404, 404, 404]);

  const forgedSession = await request.get(
    `/api/domains/${domainA.id}/diagnostics/${sessionId}`
  );
  expect(forgedSession.status()).toBe(404);
  const forgedStage = await request.post(`/api/domains/${domainA.id}/stage-assessment`, {
    data: { stageId: stageB.id }
  });
  expect(forgedStage.status()).toBe(404);

  const relationStillExists = await request.get(
    `/api/domains/${domainB.id}/knowledge-graph/relations`
  );
  const relationGraph = await relationStillExists.json();
  expect(relationGraph.relations.some((relation: { id: string }) => relation.id === relationId)).toBe(true);
});
