import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

type LearningDomain = {
  id: string;
  name: string;
};

type RoadmapRun = {
  source?: string;
  skeleton?: {
    planningVersion?: number;
    stages?: Array<{
      moduleBlueprints?: Array<{
        goal?: string;
        keyQuestions?: Array<{
          key?: string;
          question?: string;
          checkableOutcome?: string;
        }>;
      }>;
    }>;
  };
  qualityReport?: {
    status?: string;
    blockingIssues?: unknown[];
  };
  aiCallLogIds?: string[];
  [key: string]: unknown;
};

const liveAiEnabled = process.env.E2E_LIVE_AI === "1";
const outputDirectory = process.env.E2E_ROADMAP_ACCEPTANCE_OUTPUT_DIR?.trim();
const prisma = new PrismaClient();

test.skip(
  !liveAiEnabled || !outputDirectory,
  "Set E2E_LIVE_AI=1 and E2E_ROADMAP_ACCEPTANCE_OUTPUT_DIR to run acceptance."
);

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("current provider generates three reviewable calculus roadmaps", async ({
  request
}) => {
  test.setTimeout(1_200_000);

  const taskBrief =
    "为准备工科研究生入学考试的学习者规划高等数学路线，覆盖函数与极限、连续、导数与微分、积分及其应用；排除实变函数和泛函分析。";
  const domainInput = {
    name: `e2e-live-ai-roadmap-acceptance-${Date.now()}`,
    description: "学习者学过高中函数和基础代数，但高数知识零散。",
    currentLevel: "能做基础代数运算，尚不能解释极限、导数和积分的概念边界。",
    goal: "形成可用于考研复习和题型迁移的高等数学知识路线。",
    scope: "函数与极限、连续、导数与微分、中值定理、积分、级数和常见应用。",
    excludedScope: "实变函数、复分析、泛函分析。",
    depth: "考研数学一所需的概念理解、方法选择、边界辨析和综合应用。",
    outputType: "学习路线图",
    outputTarget: "一份可逐阶段展开、可检查覆盖的高数复习路线。",
    taskBrief
  };
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

  const createResponse = await request.post("/api/domains", {
    data: domainInput
  });
  expect(createResponse.ok()).toBeTruthy();
  const { domain } = (await createResponse.json()) as {
    domain: LearningDomain;
  };
  expect(
    (await request.patch(`/api/domains/${domain.id}/task-brief`)).ok()
  ).toBeTruthy();

  const courseLog = await prisma.aiCallLog.create({
    data: {
      canvasId: domain.id,
      domainId: domain.id,
      taskType: "course_design_research",
      provider: "acceptance-input-fixture",
      model: null,
      status: "success",
      inputSummary: "Fixed source-backed input for three-run route comparison.",
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

  const absoluteOutputDirectory = path.resolve(outputDirectory!);
  fs.mkdirSync(absoluteOutputDirectory, { recursive: true });
  const manifestRuns: Array<Record<string, unknown>> = [];

  for (let runIndex = 0; runIndex < 3; runIndex += 1) {
    const startedAt = Date.now();
    const response = await request.post(
      `/api/domains/${domain.id}/map/ai-draft`,
      {
        data: {
          step: "skeleton",
          courseDesign,
          courseDesignAiCallLogId: courseLog.id
        },
        timeout: 360_000
      }
    );
    const result = (await response.json().catch(() => ({}))) as RoadmapRun;
    const elapsedMs = Date.now() - startedAt;

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

    const logs = await prisma.aiCallLog.findMany({
      where: { id: { in: result.aiCallLogIds || [] } },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        taskType: true,
        provider: true,
        model: true,
        status: true,
        latencyMs: true,
        providerRequestId: true,
        promptVersion: true,
        createdAt: true
      }
    });
    const evidence = {
      run: runIndex + 1,
      elapsedMs,
      generatedAt: new Date().toISOString(),
      providerCalls: logs,
      result
    };
    fs.writeFileSync(
      path.join(absoluteOutputDirectory, `run-${runIndex + 1}.json`),
      `${JSON.stringify(evidence, null, 2)}\n`,
      "utf8"
    );
    manifestRuns.push({
      run: runIndex + 1,
      elapsedMs,
      stageCount: result.skeleton?.stages?.length || 0,
      qualityStatus: result.qualityReport?.status,
      providerCalls: logs
    });
  }

  fs.writeFileSync(
    path.join(absoluteOutputDirectory, "manifest.json"),
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        input: { domain: domainInput, courseDesign },
        isolation: "Playwright temporary SQLite; deleted after the run.",
        runs: manifestRuns
      },
      null,
      2
    )}\n`,
    "utf8"
  );
});
