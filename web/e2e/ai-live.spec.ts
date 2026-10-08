import { expect, test, type APIRequestContext } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

type LearningDomain = {
  id: string;
  name: string;
};

const liveAiEnabled = process.env.E2E_LIVE_AI === "1";
const prisma = new PrismaClient();

test.skip(!liveAiEnabled, "Set E2E_LIVE_AI=1 to run live cloud AI checks.");

const cleanupLiveDomains = async (request: APIRequestContext) => {
  const response = await request.get("/api/domains");
  if (!response.ok()) return;

  const data = await response.json();
  const domains: LearningDomain[] = data.domains || [];

  await Promise.all(
    domains
      .filter((domain) => domain.name.startsWith("e2e-live-ai-"))
      .map((domain) => request.delete(`/api/domains/${domain.id}`))
  );
};

test.afterEach(async ({ request }) => {
  await cleanupLiveDomains(request);
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("live Qwen can repair an incomplete course design draft", async ({
  request
}) => {
  test.setTimeout(300000);

  const domainName = `e2e-live-ai-qwen-${Date.now()}`;
  const createResponse = await request.post("/api/domains", {
    data: {
      name: domainName,
      description:
        "I can write basic JavaScript and simple React components, but I lack a systematic TypeScript project workflow.",
      currentLevel: "Basic JavaScript and React, weak TypeScript architecture.",
      goal: "Build a reliable TypeScript React learning path for a small web app.",
      scope: "TypeScript types, React component props, async API calls, project structure.",
      excludedScope: "Backend deployment, advanced type-level programming, mobile apps.",
      depth: "Project-ready beginner to intermediate level within two weeks.",
      outputType: "Project",
      outputTarget: "A small typed React app that calls an API and documents key type decisions.",
      taskBrief:
        "Design a two-week TypeScript React learning route for building a small typed web app. Include core concepts, source-backed ordering, risks, and validation approach."
    }
  });
  expect(createResponse.ok()).toBeTruthy();
  const { domain } = (await createResponse.json()) as { domain: LearningDomain };
  const confirmTaskBriefResponse = await request.patch(
    `/api/domains/${domain.id}/task-brief`
  );
  expect(confirmTaskBriefResponse.ok()).toBeTruthy();

  const incompleteDraft = {
    taskBriefSnapshot:
      "Design a two-week TypeScript React learning route for a typed web app.",
    globalExplanation: {
      theorySkeleton:
        "Start from TypeScript's type model, then apply it to React components and asynchronous boundaries.",
      sourceBasis: "The persisted draft intentionally needs source repair.",
      optimizationRationale:
        "Language-level guarantees should precede framework integration.",
      risksAndValidation:
        "Validate JavaScript fundamentals and React component understanding."
    },
    sources: [],
    keyTradeoffs: ["Keep advanced type-level programming out of scope."],
    qualityGate: { passed: false, missing: ["sources"] }
  };
  await prisma.domain.update({
    where: { id: domain.id },
    data: {
      courseDesignDraft: JSON.stringify(incompleteDraft),
      courseDesignStatus: "incomplete",
      courseDesignRepairCount: 0,
      courseDesignAiCallLogId: null
    }
  });

  const repairResponse = await request.post(
    `/api/domains/${domain.id}/course-design/ai-draft`,
    {
      data: { mode: "repair" },
      timeout: 240000
    }
  );
  const repairResult = await repairResponse.json().catch(() => ({}));
  expect(repairResponse.ok(), JSON.stringify(repairResult)).toBeTruthy();
  expect(repairResult.source, JSON.stringify(repairResult)).toBe("ai");
  expect(repairResult.draft?.qualityGate?.passed, JSON.stringify(repairResult)).toBe(
    true
  );
  expect(repairResult.repair, JSON.stringify(repairResult)).toMatchObject({
    attempted: true,
    succeeded: true
  });
  expect(repairResult.repair?.attempts).toBeGreaterThanOrEqual(1);

  const repairLogs = await prisma.aiCallLog.findMany({
    where: {
      domainId: domain.id,
      taskType: "course_design_repair"
    }
  });
  expect(repairLogs.length).toBeGreaterThanOrEqual(1);
  expect(repairLogs.at(-1)?.status).toBe("success");
});

test("live Qwen repeatedly produces and independently reviews a layered calculus blueprint", async ({
  request
}) => {
  test.setTimeout(600000);

  const domainName = `e2e-live-ai-calculus-roadmap-${Date.now()}`;
  const taskBrief =
    "为准备工科研究生入学考试的学习者规划高等数学路线，覆盖函数与极限、连续、导数与微分、积分及其应用；排除实变函数和泛函分析。";
  const createResponse = await request.post("/api/domains", {
    data: {
      name: domainName,
      description: "学习者学过高中函数和基础代数，但高数知识零散。",
      currentLevel: "能做基础代数运算，尚不能解释极限、导数和积分的概念边界。",
      goal: "形成可用于考研复习和题型迁移的高等数学知识路线。",
      scope: "函数与极限、连续、导数与微分、中值定理、积分、级数和常见应用。",
      excludedScope: "实变函数、复分析、泛函分析。",
      depth: "考研数学一所需的概念理解、方法选择、边界辨析和综合应用。",
      outputType: "学习路线图",
      outputTarget: "一份可逐阶段展开、可检查覆盖的高数复习路线。",
      taskBrief
    }
  });
  expect(createResponse.ok()).toBeTruthy();
  const { domain } = (await createResponse.json()) as { domain: LearningDomain };
  expect(
    (
      await request.patch(`/api/domains/${domain.id}/task-brief`)
    ).ok()
  ).toBeTruthy();

  const courseDesign = {
    taskBriefSnapshot: taskBrief,
    globalExplanation: {
      theorySkeleton:
        "以函数语言和极限为基础，经过连续与微分学进入积分学，再连接级数和综合应用；每一阶段同时处理概念、方法选择条件、典型边界与迁移。",
      sourceBasis:
        "以 MIT 单变量微积分课程和同济大学高等数学课程结构作为顺序与覆盖参考。",
      optimizationRationale:
        "先修依赖优先；将公式操练放在概念与适用条件之后，避免把章节标题压缩成少量复合问题。",
      risksAndValidation:
        "重点检查极限定义、定理条件、方法选择与反例边界是否被过度合并。"
    },
    sources: [
      {
        url: "https://ocw.mit.edu/courses/18-01sc-single-variable-calculus-fall-2010/",
        title: "MIT OpenCourseWare 18.01SC Single Variable Calculus",
        reason: "提供单变量微积分的完整主题顺序、讲义和问题集。"
      },
      {
        url: "https://www.icourse163.org/course/TONGJI-53004",
        title: "同济大学 高等数学",
        reason: "与中文工科高数和考研语境相近，可核对章节覆盖。"
      }
    ],
    keyTradeoffs: [
      "不以固定问题数量作为质量指标。",
      "保留逐 Stage 展开，不在骨架阶段生成全部 Learning Node。"
    ],
    qualityGate: { passed: true, missing: [] }
  };
  const courseLog = await prisma.aiCallLog.create({
    data: {
      canvasId: domain.id,
      domainId: domain.id,
      taskType: "course_design_research",
      provider: "live-roadmap-input-fixture",
      model: null,
      status: "success",
      inputSummary: "Versioned live roadmap acceptance input.",
      outputSummary: "Grounded calculus Course Design Direction fixture."
    }
  });
  await prisma.domain.update({
    where: { id: domain.id },
    data: {
      courseDesignDraft: JSON.stringify(courseDesign),
      courseDesignStatus: "draft",
      courseDesignRepairCount: 0,
      courseDesignAiCallLogId: courseLog.id
    }
  });

  const runs: any[] = [];
  for (let runIndex = 0; runIndex < 2; runIndex += 1) {
    const response = await request.post(
      `/api/domains/${domain.id}/map/ai-draft`,
      {
        data: {
          step: "skeleton",
          courseDesign,
          courseDesignAiCallLogId: courseLog.id
        },
        timeout: 300000
      }
    );
    const result = await response.json().catch(() => ({}));
    expect(response.ok(), JSON.stringify(result)).toBeTruthy();
    expect(result.source).toBe("ai");
    expect(result.skeleton?.planningVersion).toBe(2);
    expect(result.qualityReport).toMatchObject({
      status: "passed",
      blockingIssues: []
    });
    expect(result.aiCallLogIds?.length).toBeGreaterThanOrEqual(2);
    for (const stage of result.skeleton?.stages || []) {
      expect(stage.moduleBlueprints?.length).toBeGreaterThan(0);
      for (const blueprint of stage.moduleBlueprints || []) {
        expect(blueprint.goal?.trim()).toBeTruthy();
        expect(blueprint.keyQuestions?.length).toBeGreaterThan(0);
        for (const question of blueprint.keyQuestions || []) {
          expect(question.key?.trim()).toBeTruthy();
          expect(question.question?.trim()).toBeTruthy();
          expect(question.checkableOutcome?.trim()).toBeTruthy();
        }
      }
    }
    runs.push(result);
  }

  const qualityLogs = await prisma.aiCallLog.findMany({
    where: {
      domainId: domain.id,
      taskType: {
        in: [
          "roadmap_skeleton_generation",
          "roadmap_skeleton_critique",
          "roadmap_skeleton_repair"
        ]
      },
      status: "success"
    },
    orderBy: { createdAt: "asc" }
  });
  expect(
    qualityLogs.filter((log) => log.taskType === "roadmap_skeleton_generation")
  ).toHaveLength(2);
  expect(
    qualityLogs.filter((log) => log.taskType === "roadmap_skeleton_critique")
  ).toHaveLength(2);
  expect(new Set(qualityLogs.map((log) => log.provider)).size).toBe(1);
  expect(new Set(qualityLogs.map((log) => log.model)).size).toBe(1);
  expect(qualityLogs.every((log) => log.provider !== "unconfigured")).toBe(true);
  expect(runs).toHaveLength(2);
});
