import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  generateCourseDesignDraft,
  generateRoadmapDraft,
  generateRoadmapSkeletonDraft,
  reviewRoadmapDraftQuality,
  repairCourseDesignDraft,
  runSourceRelevanceCheck
} from "./tutorService";
import { AiProviderError } from "./provider";

const providerMock = vi.hoisted(() => ({
  generateText: vi.fn()
}));

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  domain: {
    findUnique: vi.fn(),
    update: vi.fn()
  },
  aiCallLog: {
    create: vi.fn(),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => ({ id: where.id, ...data }))
  }
}));

vi.mock("../prisma", () => ({
  prisma: prismaMock
}));

vi.mock("./openaiCompatibleProvider", () => ({
  readOpenAiCompatibleConfig: vi.fn(() => ({
    provider: "qwen",
    baseUrl: "https://example.com/v1",
    apiKey: "sk-test",
    model: "glm-5.2",
    temperature: 0.25,
    timeoutMs: 300000,
    maxTokens: 130000
  })),
  createOpenAiCompatibleProvider: vi.fn(() => ({
    config: {
      provider: "qwen",
      baseUrl: "https://example.com/v1",
      apiKey: "sk-test",
      model: "glm-5.2",
      temperature: 0.25,
      timeoutMs: 300000,
      maxTokens: 130000
    },
    generateText: providerMock.generateText
  }))
}));

vi.mock("../learning/sourceGroundingService", () => ({
  groundCourseSources: vi.fn(async (urls: string[]) =>
    urls.map((url) => ({
      ok: true,
      status: 200,
      finalUrl: url,
      title: `Grounded ${url}`,
      excerpt: `Excerpt for ${url}`
    }))
  )
}));

const critiqueResultText = (draft: unknown, significantIssues = false) =>
  JSON.stringify({
    report: {
      summary: significantIssues ? "仍有问题。" : "整体合格。",
      significantIssues,
      dimensions: [
        { key: "prerequisiteCorrectness", score: 4, note: "先修链正确。" },
        { key: "goalMatch", score: 4, note: "匹配目标。" },
        { key: "cognitiveLoad", score: 4, note: "负荷可控。" },
        { key: "sourceQuality", score: 4, note: "来源可达。" },
        { key: "checkability", score: 4, note: "产出可检验。" }
      ]
    },
    draft
  });

const confirmedCourseDesign = {
  taskBriefSnapshot: "Learn calculus for exam preparation.",
  globalExplanation: {
    theorySkeleton: "Limits precede derivatives and integrals.",
    sourceBasis: "Authoritative calculus courses.",
    optimizationRationale: "Prerequisites first.",
    risksAndValidation: "Check algebra gaps."
  },
  sources: [
    {
      url: "https://example.edu/calculus",
      title: "Calculus",
      reason: "Clear prerequisite order."
    }
  ],
  keyTradeoffs: ["Keep the first pass focused."],
  qualityGate: { passed: true, missing: [] }
};

const courseResearchDomain = {
  id: "domain-1",
  name: "TypeScript React",
  description: "Can build small React components.",
  currentLevel: "Basic JavaScript and React.",
  goal: "Build a typed React application.",
  scope: "TypeScript, React props, async API calls.",
  excludedScope: "Advanced type-level programming.",
  depth: "Project-ready in two weeks.",
  outputType: "Project",
  outputTarget: "A small typed React app.",
  taskBrief: "Design a source-backed TypeScript React learning route.",
  taskBriefConfirmedAt: new Date("2026-07-19T03:00:00.000Z")
};

const incompleteCourseDesign = {
  taskBriefSnapshot: courseResearchDomain.taskBrief,
  globalExplanation: {
    theorySkeleton: "Start from TypeScript's type system, then apply it to React.",
    sourceBasis: "Sources still need repair.",
    optimizationRationale: "Types before component integration.",
    risksAndValidation: "Validate JavaScript and React prerequisites."
  },
  sources: [],
  keyTradeoffs: ["Prefer project relevance over advanced type theory."]
};

const repairedCourseDesign = {
  ...incompleteCourseDesign,
  globalExplanation: {
    ...incompleteCourseDesign.globalExplanation,
    sourceBasis: "Use the TypeScript Handbook and React TypeScript guide."
  },
  sources: [
    {
      url: "https://www.typescriptlang.org/docs/handbook/intro.html",
      title: "TypeScript Handbook",
      reason: "Official language concepts and examples."
    }
  ]
};

describe("course design automatic repair", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let logIndex = 0;
    prismaMock.domain.findUnique.mockResolvedValue(courseResearchDomain);
    prismaMock.aiCallLog.create.mockImplementation(async () => {
      logIndex += 1;
      return { id: `log-${logIndex}` };
    });
    prismaMock.$transaction.mockImplementation((callback) =>
      callback(prismaMock)
    );
    prismaMock.domain.update.mockImplementation(async ({ data }: any) => ({
      courseDesignDraft: data.courseDesignDraft,
      courseDesignStatus: data.courseDesignStatus,
      courseDesignRepairCount: data.courseDesignRepairCount,
      courseDesignConfirmedAt: data.courseDesignConfirmedAt,
      courseDesignAiCallLogId: data.courseDesignAiCallLogId
    }));
  });

  it("repairs a failed cloud research draft before returning it", async () => {
    const taskTypes: string[] = [];
    providerMock.generateText.mockImplementation(async (input: any) => {
      taskTypes.push(input.taskType);
      return {
        raw: {},
        text:
          input.taskType === "course_design_repair"
            ? JSON.stringify(repairedCourseDesign)
            : input.taskType === "course_design_critique"
              ? critiqueResultText(incompleteCourseDesign)
              : JSON.stringify(incompleteCourseDesign)
      };
    });

    const result = await generateCourseDesignDraft("domain-1");

    expect(taskTypes).toEqual([
      "course_design_research",
      "course_design_critique",
      "course_design_repair"
    ]);
    expect(providerMock.generateText.mock.calls[0][0]).toMatchObject({
      timeoutMs: 120000,
      requiresWebResearch: true
    });
    expect(providerMock.generateText.mock.calls[2][0]).toMatchObject({
      timeoutMs: 90000,
      requiresWebResearch: true
    });
    expect(result.source).toBe("ai");
    expect(result.draft.qualityGate.passed).toBe(true);
    expect(result.draft.qualityReport?.significantIssues).toBe(false);
    expect(result.draft.sources[0].grounding?.ok).toBe(true);
    expect(result.aiCallLogId).toBe("log-3");
    expect(result.repair).toEqual({
      attempted: true,
      attempts: 1,
      totalAttempts: 1,
      succeeded: true,
      initialAiCallLogId: "log-1",
      aiCallLogIds: ["log-3"]
    });
    expect(prismaMock.aiCallLog.create).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        data: expect.objectContaining({
          domainId: "domain-1",
          canvasId: undefined,
          taskType: "course_design_repair"
        })
      })
    );
    expect(prismaMock.domain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          courseDesignStatus: "draft",
          courseDesignRepairCount: 1,
          courseDesignAiCallLogId: "log-3"
        })
      })
    );
  });

  it("stops after two structural repair attempts and keeps map creation blocked", async () => {
    const taskTypes: string[] = [];
    providerMock.generateText.mockImplementation(async (input: any) => {
      taskTypes.push(input.taskType);
      return {
        raw: {},
        text:
          input.taskType === "course_design_critique"
            ? critiqueResultText(incompleteCourseDesign)
            : JSON.stringify(incompleteCourseDesign)
      };
    });

    const result = await generateCourseDesignDraft("domain-1");

    expect(taskTypes).toEqual([
      "course_design_research",
      "course_design_critique",
      "course_design_repair",
      "course_design_repair"
    ]);
    expect(result.draft.qualityGate.passed).toBe(false);
    expect(result.repair).toMatchObject({
      attempted: true,
      attempts: 2,
      totalAttempts: 2,
      succeeded: false
    });
    expect(result.warning).toContain("仍未通过质量门");
    expect(prismaMock.domain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          courseDesignStatus: "incomplete",
          courseDesignRepairCount: 2
        })
      })
    );
  });

  it("keeps the original AI draft blocked when the repair provider fails", async () => {
    providerMock.generateText.mockImplementation(async (input: any) => {
      if (input.taskType === "course_design_repair") {
        throw new AiProviderError("Repair provider timed out.");
      }
      if (input.taskType === "course_design_critique") {
        return { raw: {}, text: critiqueResultText(incompleteCourseDesign) };
      }
      return { raw: {}, text: JSON.stringify(incompleteCourseDesign) };
    });

    const result = await generateCourseDesignDraft("domain-1");

    expect(result.source).toBe("ai");
    expect(result.draft.qualityGate.passed).toBe(false);
    expect(result.aiCallLogId).toBe("log-1");
    expect(result.repair).toMatchObject({
      attempted: true,
      attempts: 2,
      totalAttempts: 2,
      succeeded: false,
      error: "Repair provider timed out."
    });
    expect(providerMock.generateText).toHaveBeenCalledTimes(4);
    expect(prismaMock.aiCallLog.create).toHaveBeenCalledTimes(4);
    expect(result.warning).toContain("自动修复失败");
    expect(prismaMock.domain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          courseDesignStatus: "incomplete",
          courseDesignRepairCount: 2,
          courseDesignAiCallLogId: "log-1"
        })
      })
    );
  });

  it("uses the second bounded repair attempt after invalid repair JSON without a hidden provider retry", async () => {
    let repairCallCount = 0;
    providerMock.generateText.mockImplementation(async (input: any) => {
      if (input.taskType === "course_design_critique") {
        return { raw: {}, text: critiqueResultText(incompleteCourseDesign) };
      }
      if (input.taskType !== "course_design_repair") {
        return { raw: {}, text: JSON.stringify(incompleteCourseDesign) };
      }
      repairCallCount += 1;
      return {
        raw: {},
        text:
          repairCallCount === 1
            ? "not-json"
            : JSON.stringify(repairedCourseDesign)
      };
    });

    const result = await generateCourseDesignDraft("domain-1");

    expect(repairCallCount).toBe(2);
    expect(providerMock.generateText).toHaveBeenCalledTimes(4);
    expect(prismaMock.aiCallLog.create).toHaveBeenCalledTimes(4);
    expect(result.draft.qualityGate.passed).toBe(true);
    expect(result.aiCallLogId).toBe("log-4");
    expect(result.repair).toMatchObject({
      attempts: 2,
      totalAttempts: 2,
      succeeded: true,
      aiCallLogIds: ["log-4"]
    });
  });

  it("bounds transient cloud research retries before returning a blocked fallback", async () => {
    providerMock.generateText.mockRejectedValue(
      new AiProviderError("Research provider timed out.")
    );

    const result = await generateCourseDesignDraft("domain-1");

    expect(providerMock.generateText).toHaveBeenCalledTimes(2);
    expect(result.source).toBe("fallback");
    expect(result.draft.qualityGate.passed).toBe(false);
    expect(result.repair).toMatchObject({
      attempted: false,
      attempts: 0,
      totalAttempts: 0,
      succeeded: false
    });
  });

  it("stops the critique loop early when the report has no significant issues", async () => {
    const taskTypes: string[] = [];
    providerMock.generateText.mockImplementation(async (input: any) => {
      taskTypes.push(input.taskType);
      return {
        raw: {},
        text:
          input.taskType === "course_design_critique"
            ? critiqueResultText(repairedCourseDesign, false)
            : JSON.stringify(repairedCourseDesign)
      };
    });

    const result = await generateCourseDesignDraft("domain-1");

    expect(
      taskTypes.filter((type) => type === "course_design_critique")
    ).toHaveLength(1);
    expect(taskTypes).not.toContain("course_design_repair");
    expect(result.draft.qualityGate.passed).toBe(true);
    expect(result.draft.qualityReport?.summary).toBe("整体合格。");
  });

  it("binds course sources and the AI call log to provider search evidence", async () => {
    const citedUrl =
      "https://www.typescriptlang.org/docs/handbook/intro.html";
    const unboundDraft = {
      ...repairedCourseDesign,
      sources: [
        {
          url: "https://invented.invalid/course",
          title: "Unverified course",
          reason: "Model supplied URL"
        }
      ]
    };
    providerMock.generateText.mockImplementation(async (input: any) => {
      if (input.taskType === "course_design_research") {
        return {
          raw: {},
          text: JSON.stringify(unboundDraft),
          providerRequestId: "resp-1",
          sources: [{ url: citedUrl, title: "TypeScript Handbook" }]
        };
      }
      return {
        raw: {},
        text: critiqueResultText(repairedCourseDesign, false)
      };
    });

    const result = await generateCourseDesignDraft("domain-1");

    expect(result.draft.sources.map((source) => source.url)).toEqual([citedUrl]);
    expect(prismaMock.aiCallLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "log-1" },
        data: expect.objectContaining({
          providerRequestId: "resp-1",
          researchSourcesJson: JSON.stringify([
            { url: citedUrl, title: "TypeScript Handbook" }
          ])
        })
      })
    );
  });

  it("runs at most two critique passes when issues stay significant", async () => {
    const taskTypes: string[] = [];
    providerMock.generateText.mockImplementation(async (input: any) => {
      taskTypes.push(input.taskType);
      return {
        raw: {},
        text:
          input.taskType === "course_design_critique"
            ? critiqueResultText(repairedCourseDesign, true)
            : JSON.stringify(repairedCourseDesign)
      };
    });

    const result = await generateCourseDesignDraft("domain-1");

    expect(
      taskTypes.filter((type) => type === "course_design_critique")
    ).toHaveLength(2);
    expect(result.draft.qualityReport?.significantIssues).toBe(true);
  });

  it("keeps the research draft and warns when the critique pass fails", async () => {
    providerMock.generateText.mockImplementation(async (input: any) => {
      if (input.taskType === "course_design_critique") {
        throw new AiProviderError("Critique provider timed out.");
      }
      return { raw: {}, text: JSON.stringify(repairedCourseDesign) };
    });

    const result = await generateCourseDesignDraft("domain-1");

    expect(result.source).toBe("ai");
    expect(result.draft.qualityGate.passed).toBe(true);
    expect(result.warning).toContain("课程批判轮未完成");
  });

  it("rejects initial course research when the persisted task brief is not confirmed", async () => {
    prismaMock.domain.findUnique.mockResolvedValue({
      ...courseResearchDomain,
      taskBriefConfirmedAt: null
    });

    await expect(generateCourseDesignDraft("domain-1")).rejects.toThrow(
      "请先确认任务书，再研究课程设计方向。"
    );
    expect(providerMock.generateText).not.toHaveBeenCalled();
    expect(prismaMock.aiCallLog.create).not.toHaveBeenCalled();
  });

  it("can explicitly retry a persisted incomplete draft and accumulates repair count", async () => {
    prismaMock.domain.findUnique.mockResolvedValue({
      ...courseResearchDomain,
      courseDesignDraft: JSON.stringify(incompleteCourseDesign),
      courseDesignRepairCount: 2,
      courseDesignAiCallLogId: "log-original"
    });
    providerMock.generateText.mockResolvedValue({
      raw: {},
      text: JSON.stringify(repairedCourseDesign)
    });

    const result = await repairCourseDesignDraft("domain-1");

    expect(result.draft.qualityGate.passed).toBe(true);
    expect(result.repair).toMatchObject({
      attempts: 1,
      totalAttempts: 3,
      succeeded: true,
      initialAiCallLogId: "log-original"
    });
    expect(prismaMock.domain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ courseDesignRepairCount: 3 })
      })
    );
  });

  it("rejects persisted-draft repair after task brief confirmation is invalidated", async () => {
    prismaMock.domain.findUnique.mockResolvedValue({
      ...courseResearchDomain,
      taskBriefConfirmedAt: null,
      courseDesignDraft: JSON.stringify(incompleteCourseDesign),
      courseDesignRepairCount: 2,
      courseDesignAiCallLogId: "log-original"
    });

    await expect(repairCourseDesignDraft("domain-1")).rejects.toThrow(
      "请先确认任务书，再修复课程设计方向。"
    );
    expect(providerMock.generateText).not.toHaveBeenCalled();
  });
});

describe("layered roadmap skeleton quality pipeline", () => {
  const skeletonDraft = {
    planningVersion: 2,
    title: "Calculus roadmap",
    status: "draft",
    stages: [
      {
        key: "limits",
        title: "Limits",
        goal: "Understand limiting behavior.",
        coreTopics: ["limit definition"],
        prerequisiteStageTitles: [],
        prerequisiteStageKeys: [],
        moduleBlueprints: [
          {
            key: "limit-foundations",
            title: "Limit foundations",
            goal: "Explain limits.",
            keyQuestions: [
              {
                key: "limit-meaning",
                question: "What does a limit express?",
                checkableOutcome: "Explain the definition with an example."
              }
            ]
          }
        ]
      }
    ]
  };

  const critiqueText = (blocking = false) =>
    JSON.stringify({
      report: {
        summary: blocking ? "The question is still overloaded." : "Ready for review.",
        blockingIssues: blocking
          ? [
              {
                code: "questionAtomicity",
                targetKey: "limit-meaning",
                message: "The question combines independent abilities.",
                suggestion: "Split it."
              }
            ]
          : [],
        warnings: []
      },
      draft: skeletonDraft
    });

  beforeEach(() => {
    vi.clearAllMocks();
    let logIndex = 0;
    prismaMock.domain.findUnique.mockResolvedValue({
      id: "domain-1",
      name: "Calculus",
      description: "Exam calculus",
      currentLevel: "basic",
      goal: "Master calculus",
      scope: "limits",
      excludedScope: null,
      depth: "exam ready",
      outputType: "roadmap",
      outputTarget: "study plan",
      taskBrief: "Build a calculus route."
    });
    prismaMock.aiCallLog.create.mockImplementation(async () => {
      logIndex += 1;
      return { id: `log-${logIndex}` };
    });
  });

  it("generates a v2 skeleton and always reviews it in a fresh AI call", async () => {
    const taskTypes: string[] = [];
    providerMock.generateText.mockImplementation(async (input: any) => {
      taskTypes.push(input.taskType);
      return {
        raw: {},
        text:
          input.taskType === "roadmap_skeleton_generation"
            ? JSON.stringify(skeletonDraft)
            : critiqueText(false)
      };
    });

    const result = await generateRoadmapSkeletonDraft("domain-1", {
      courseDesign: confirmedCourseDesign
    });

    expect(taskTypes).toEqual([
      "roadmap_skeleton_generation",
      "roadmap_skeleton_critique"
    ]);
    expect(result.source).toBe("ai");
    expect(result.qualityReport.status).toBe("passed");
    expect(result.aiCallLogIds).toEqual(["log-1", "log-2"]);
    expect(providerMock.generateText.mock.calls[0][0].maxTokens).toBe(24000);
  });

  it("uses at most two logged repairs and returns only after critical issues clear", async () => {
    const taskTypes: string[] = [];
    let repairCount = 0;
    providerMock.generateText.mockImplementation(async (input: any) => {
      taskTypes.push(input.taskType);
      if (input.taskType === "roadmap_skeleton_generation") {
        return { raw: {}, text: JSON.stringify(skeletonDraft) };
      }
      if (input.taskType === "roadmap_skeleton_repair") repairCount += 1;
      return {
        raw: {},
        text:
          input.taskType === "roadmap_skeleton_critique" || repairCount === 1
            ? critiqueText(true)
            : critiqueText(false)
      };
    });

    const result = await generateRoadmapSkeletonDraft("domain-1", {
      courseDesign: confirmedCourseDesign
    });

    expect(taskTypes).toEqual([
      "roadmap_skeleton_generation",
      "roadmap_skeleton_critique",
      "roadmap_skeleton_repair",
      "roadmap_skeleton_repair"
    ]);
    expect(result.repairAttempts).toBe(2);
    expect(result.qualityReport.status).toBe("passed");
  });

  it("fails closed instead of returning a confirmable fallback", async () => {
    providerMock.generateText.mockRejectedValue(new Error("provider unavailable"));

    await expect(
      generateRoadmapSkeletonDraft("domain-1", {
        courseDesign: confirmedCourseDesign
      })
    ).rejects.toThrow("provider unavailable");
  });

  it("keeps a deterministic-valid skeleton when only semantic review is unavailable", async () => {
    providerMock.generateText.mockImplementation(async (input: any) => {
      if (input.taskType === "roadmap_skeleton_generation") {
        return { raw: {}, text: JSON.stringify(skeletonDraft) };
      }
      throw new AiProviderError("AI review timed out.");
    });

    const result = await generateRoadmapSkeletonDraft("domain-1", {
      courseDesign: confirmedCourseDesign
    });

    expect(result.skeleton.planningVersion).toBe(2);
    expect(result.reviewAvailability).toBe("unavailable");
    expect(result.qualityReport).toMatchObject({
      status: "blocked",
      blockingIssues: []
    });
    expect(result.aiCallLogIds).toEqual(["log-1"]);
  });

  it("reviews an edited persisted Map Draft in a fresh logged call", async () => {
    const draft = {
      planningVersion: 2 as const,
      title: skeletonDraft.title,
      status: "draft",
      baseRevision: 0,
      stages: skeletonDraft.stages.map((stage) => ({
        key: stage.key,
        title: stage.title,
        goal: stage.goal,
        status: "planned" as const,
        moduleDirections: stage.coreTopics,
        moduleBlueprints: stage.moduleBlueprints,
        prerequisiteStageKeys: stage.prerequisiteStageKeys,
        modules: []
      }))
    };
    const taskTypes: string[] = [];
    providerMock.generateText.mockImplementation(async (input: any) => {
      taskTypes.push(input.taskType);
      return {
        raw: {},
        text: JSON.stringify({
          report: {
            summary: "Edited blueprint is coherent.",
            blockingIssues: [],
            warnings: []
          },
          draft
        })
      };
    });

    const result = await reviewRoadmapDraftQuality("domain-1", {
      courseDesign: confirmedCourseDesign,
      draft,
      scope: "skeleton"
    });

    expect(taskTypes).toEqual(["roadmap_stage_critique"]);
    expect(result.qualityReport.status).toBe("passed");
    expect(result.draft).toEqual(draft);
    expect(result.aiCallLogIds).toEqual(["log-1"]);
  });

  it("accepts a report-only review without asking the reviewer to mutate the draft", async () => {
    const draft = {
      planningVersion: 2 as const,
      title: skeletonDraft.title,
      status: "draft",
      baseRevision: 0,
      stages: skeletonDraft.stages.map((stage) => ({
        key: stage.key,
        title: stage.title,
        goal: stage.goal,
        status: "planned" as const,
        moduleDirections: stage.coreTopics,
        moduleBlueprints: stage.moduleBlueprints,
        prerequisiteStageKeys: stage.prerequisiteStageKeys,
        modules: []
      }))
    };
    providerMock.generateText.mockResolvedValue({
      raw: {},
      text: JSON.stringify({
        report: {
          summary: "The complete draft is ready.",
          blockingIssues: [],
          warnings: []
        }
      })
    });

    const result = await reviewRoadmapDraftQuality("domain-1", {
      courseDesign: confirmedCourseDesign,
      draft,
      scope: "map"
    });

    expect(providerMock.generateText).toHaveBeenCalledTimes(1);
    expect(providerMock.generateText.mock.calls[0][0].maxTokens).toBe(24000);
    expect(result.draft).toEqual(draft);
    expect(result.qualityReport.status).toBe("passed");
  });

  it("rejects a quality review that expands a Stage the learner did not request", async () => {
    const draft = {
      planningVersion: 2 as const,
      title: skeletonDraft.title,
      status: "draft",
      baseRevision: 0,
      stages: skeletonDraft.stages.map((stage) => ({
        key: stage.key,
        title: stage.title,
        goal: stage.goal,
        status: "planned" as const,
        moduleDirections: stage.coreTopics,
        moduleBlueprints: stage.moduleBlueprints,
        prerequisiteStageKeys: stage.prerequisiteStageKeys,
        modules: []
      }))
    };
    const expandedWithoutRequest = {
      ...draft,
      stages: [
        {
          ...draft.stages[0],
          status: "expanded",
          modules: [
            {
              title: "Limit foundations",
              goal: "Explain limits.",
              items: [
                {
                  key: "limit-definition",
                  title: "Limit definition",
                  keyQuestion: "What does a limit express?",
                  objective: "Explain the definition with an example.",
                  planningQuestionKey: "limit-meaning",
                  prerequisiteKeys: [],
                  status: "not_started"
                }
              ]
            }
          ]
        }
      ]
    };
    providerMock.generateText.mockImplementation(async (input: any) => ({
      raw: {},
      text: JSON.stringify(
        input.taskType === "roadmap_stage_critique"
          ? {
              report: {
                summary: "The question is overloaded.",
                blockingIssues: [
                  {
                    code: "questionAtomicity",
                    targetKey: "limit-meaning",
                    message: "The question combines independent abilities.",
                    suggestion: "Split it."
                  }
                ],
                warnings: []
              }
            }
          : {
              report: {
                summary: "Expanded the Stage while repairing.",
                blockingIssues: [],
                warnings: []
              },
              draft: expandedWithoutRequest
            }
      )
    }));

    await expect(
      reviewRoadmapDraftQuality("domain-1", {
        courseDesign: confirmedCourseDesign,
        draft,
        scope: "skeleton"
      })
    ).rejects.toThrow("preserve each Stage expansion state");
  });
});

describe("generateRoadmapDraft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let logIndex = 0;
    prismaMock.domain.findUnique.mockResolvedValue({
      id: "domain-1",
      name: "Calculus",
      description: "Exam prep",
      currentLevel: "basic algebra",
      goal: "Master core calculus",
      scope: "limits, derivatives, integrals",
      excludedScope: "advanced analysis",
      depth: "exam ready",
      outputType: "roadmap",
      outputTarget: "study plan",
      taskBrief: "Build a calculus roadmap."
    });
    prismaMock.aiCallLog.create.mockImplementation(async () => {
      logIndex += 1;
      return { id: `log-${logIndex}` };
    });
  });

  it("gets a global skeleton first, then expands each stage in order", async () => {
    const taskTypes: string[] = [];
    const userPrompts: string[] = [];
    let stageExpansionIndex = 0;

    providerMock.generateText.mockImplementation(async (input: any) => {
      taskTypes.push(input.taskType);
      userPrompts.push(input.messages[1].content);

      if (input.taskType === "roadmap_skeleton_generation") {
        return {
          raw: {},
          text: JSON.stringify({
            title: "Calculus roadmap",
            status: "draft",
            stages: [
              {
                title: "Limits",
                goal: "Understand limiting behavior.",
                coreTopics: ["limit definition", "continuity"],
                prerequisiteStageTitles: []
              },
              {
                title: "Derivatives",
                goal: "Describe local change.",
                coreTopics: ["derivative", "chain rule"],
                prerequisiteStageTitles: ["Limits"]
              }
            ]
          })
        };
      }

      stageExpansionIndex += 1;
      const isLimitsStage = stageExpansionIndex === 1;
      return {
        raw: {},
        text: JSON.stringify({
          title: isLimitsStage ? "Limits" : "Derivatives",
          goal: isLimitsStage
            ? "Understand limiting behavior."
            : "Describe local change.",
          modules: [
            {
              title: isLimitsStage ? "Limit basics" : "Derivative basics",
              goal: "Build usable understanding.",
              items: [
                {
                  title: isLimitsStage ? "Limit definition" : "Derivative definition",
                  keyQuestion: "What problem does this idea solve?",
                  objective: "Explain and use the idea.",
                  prerequisite: isLimitsStage ? "Algebra" : "Limits",
                  commonMistake: "Applying formulas without boundary checks.",
                  transferPrompt: "Use the same reasoning in a new context.",
                  status: "not_started"
                }
              ]
            }
          ]
        })
      };
    });

    const result = await generateRoadmapDraft("domain-1", {
      courseDesign: confirmedCourseDesign
    });

    expect(taskTypes).toEqual([
      "roadmap_skeleton_generation",
      "roadmap_stage_generation",
      "roadmap_stage_generation"
    ]);
    expect(userPrompts[0]).toContain(
      "all course stages, structured Module directions, their critical questions, and prerequisite relationships"
    );
    expect(userPrompts[0]).toContain(
      "Do not generate Learning Nodes, exercises, common mistakes"
    );
    expect(userPrompts[1]).toContain('"title": "Limits"');
    expect(userPrompts[2]).toContain('"title": "Derivatives"');
    expect(result.source).toBe("ai");
    expect(result.skeleton).toBeDefined();
    expect(result.skeleton!.stages[0]).not.toHaveProperty("modules");
    expect(result.draft.stages?.map((stage) => stage.title)).toEqual([
      "Limits",
      "Derivatives"
    ]);
    expect(result.stageAiCallLogIds).toEqual(["log-2", "log-3"]);
  });

  it("retries transient provider failures before using fallback", async () => {
    let calls = 0;
    providerMock.generateText.mockImplementation(async (input: any) => {
      calls += 1;
      if (calls === 1) {
        throw new AiProviderError("AI request timed out.");
      }
      if (input.taskType === "roadmap_stage_generation") {
        return {
          raw: {},
          text: JSON.stringify({
            title: "Limits",
            goal: "Understand limiting behavior.",
            modules: [
              {
                title: "Limit basics",
                goal: "Build usable understanding.",
                items: [
                  {
                    title: "Limit definition",
                    keyQuestion: "What problem does this idea solve?",
                    objective: "Explain and use the idea.",
                    prerequisite: "Algebra",
                    commonMistake: "Applying formulas without boundary checks.",
                    transferPrompt: "Use the same reasoning in a new context.",
                    status: "not_started"
                  }
                ]
              }
            ]
          })
        };
      }
      return {
        raw: {},
        text: JSON.stringify({
          title: "Calculus roadmap",
          status: "draft",
          stages: [
            {
              title: "Limits",
              goal: "Understand limiting behavior.",
              coreTopics: ["limit definition"],
              prerequisiteStageTitles: []
            }
          ]
        })
      };
    });

    const result = await generateRoadmapDraft("domain-1", {
      courseDesign: confirmedCourseDesign
    });

    expect(calls).toBeGreaterThanOrEqual(2);
    expect(result.source).toBe("ai");
    expect(result.draft.stages?.[0].title).toBe("Limits");
  });

  it("uses a domain-specific local fallback when roadmap AI fails", async () => {
    prismaMock.domain.findUnique.mockResolvedValue({
      id: "domain-1",
      name: "TypeScript 编程",
      description: "Need project practice",
      currentLevel: "basic JavaScript",
      goal: "Build a typed web app",
      scope: "TypeScript, React, API calls",
      excludedScope: "backend deployment",
      depth: "project ready",
      outputType: "project",
      outputTarget: "small React app",
      taskBrief: "Build TypeScript project skill."
    });
    providerMock.generateText.mockRejectedValue(new Error("network down"));

    const result = await generateRoadmapDraft("domain-1", {
      courseDesign: confirmedCourseDesign
    });

    expect(result.source).toBe("fallback");
    expect(result.draft.stages?.[0].title).toContain("最小可运行闭环");
    expect(result.draft.stages?.[0].title).toContain("Build a typed web app");
    expect(result.draft.stages?.[2].title).toContain("项目化应用");
    expect(result.draft.stages?.[2].title).toContain("small React app");
    expect(result.draft.stages?.[1].modules?.[0].items?.[0].title).toContain(
      "核心抽象"
    );
    expect(result.draft.stages?.[0].modules?.[0].items?.[0].objective).toContain(
      "small React app"
    );
    expect(result.draft.stages?.[2].modules?.[0].items?.[0].objective).toContain(
      "project"
    );
  });

  it("uses a language-specific fallback scaffold with the learner goal embedded", async () => {
    prismaMock.domain.findUnique.mockResolvedValue({
      id: "domain-1",
      name: "英语口语",
      description: "Need practice for daily speaking",
      currentLevel: "basic conversation",
      goal: "Can hold a 10-minute English conversation",
      scope: "daily topics, self introduction, follow-up questions",
      excludedScope: "business negotiation",
      depth: "daily fluent use",
      outputType: "conversation",
      outputTarget: "10-minute daily dialogue",
      taskBrief: "Build daily speaking ability."
    });
    providerMock.generateText.mockRejectedValue(new Error("network down"));

    const result = await generateRoadmapDraft("domain-1", {
      courseDesign: confirmedCourseDesign
    });

    expect(result.source).toBe("fallback");
    expect(result.draft.stages?.[0].title).toContain("语言使用场景");
    expect(result.draft.stages?.[0].title).toContain("Can hold");
    expect(result.draft.stages?.[0].goal).toContain("daily topics");
    expect(result.draft.stages?.[2].modules?.[0].items?.[0].objective).toContain(
      "10-minute daily dialogue"
    );
    expect(result.draft.stages?.[1].modules?.[1].items?.[0].title).toContain(
      "常见误用"
    );
  });

  it("injects user keywords into the generic fallback instead of returning a blank template", async () => {
    prismaMock.domain.findUnique.mockResolvedValue({
      id: "domain-1",
      name: "设计评审协作",
      description: "Need a reusable team review process",
      currentLevel: "ad hoc",
      goal: "Build a repeatable design review workflow",
      scope: "review agenda, decision criteria, follow-up actions",
      excludedScope: "org-wide governance",
      depth: "team-ready execution",
      outputType: "workflow",
      outputTarget: "a reusable review checklist",
      taskBrief: "Turn reviews into a repeatable workflow."
    });
    providerMock.generateText.mockRejectedValue(new Error("network down"));

    const result = await generateRoadmapDraft("domain-1", {
      courseDesign: confirmedCourseDesign
    });

    expect(result.source).toBe("fallback");
    expect(result.draft.stages?.[0].title).toContain("Build a repeatable");
    expect(result.draft.stages?.[1].title).toContain("review agenda");
    expect(result.draft.stages?.[2].title).toContain("a reusable review");
    expect(result.draft.stages?.[0].goal).toContain("review agenda");
    expect(result.draft.stages?.[2].modules?.[0].items?.[0].objective).toContain(
      "workflow"
    );
  });
});

describe("runSourceRelevanceCheck", () => {
  const reviewDraft = {
    taskBriefSnapshot: "snapshot",
    globalExplanation: {
      theorySkeleton: "x",
      sourceBasis: "y",
      optimizationRationale: "z",
      risksAndValidation: "w"
    },
    sources: [
      {
        url: "https://a.edu",
        title: "A",
        reason: "ra",
        grounding: {
          ok: true,
          status: 200,
          title: "A title",
          excerpt: "A excerpt about TypeScript"
        }
      },
      { url: "https://b.edu", title: "B", reason: "rb" }
    ],
    keyTradeoffs: ["t1"]
  };

  beforeEach(() => {
    vi.clearAllMocks();
    let logIndex = 0;
    prismaMock.domain.findUnique.mockResolvedValue({
      ...courseResearchDomain,
      courseDesignDraft: JSON.stringify(reviewDraft)
    });
    prismaMock.aiCallLog.create.mockImplementation(async () => {
      logIndex += 1;
      return { id: `log-${logIndex}` };
    });
    prismaMock.$transaction.mockImplementation((callback) => callback(prismaMock));
    prismaMock.domain.update.mockImplementation(async ({ data }: any) => data);
  });

  it("merges AI relevance into grounded sources and leaves others untouched", async () => {
    providerMock.generateText.mockResolvedValue({
      raw: {},
      text: JSON.stringify({
        judgments: [
          {
            url: "https://a.edu",
            score: 0.85,
            lowRelevance: false,
            reason: "直接命中目标"
          }
        ]
      })
    });

    const result = await runSourceRelevanceCheck("domain-1");

    expect(result.source).toBe("ai");
    expect(result.aiCallLogId).toBe("log-1");
    const a = result.draft?.sources.find((s) => s.url === "https://a.edu");
    const b = result.draft?.sources.find((s) => s.url === "https://b.edu");
    expect(a?.grounding?.aiRelevance).toEqual({
      score: 0.85,
      lowRelevance: false,
      reason: "直接命中目标"
    });
    expect(b?.grounding?.aiRelevance ?? null).toBeNull();
    expect(providerMock.generateText.mock.calls[0][0]).toMatchObject({
      taskType: "source_relevance_check",
      requiresWebResearch: false
    });
    expect(prismaMock.aiCallLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          taskType: "source_relevance_check",
          domainId: "domain-1"
        })
      })
    );
  });

  it("returns a friendly fallback without calling the model when no grounded content exists", async () => {
    prismaMock.domain.findUnique.mockResolvedValue({
      ...courseResearchDomain,
      courseDesignDraft: JSON.stringify({
        ...reviewDraft,
        sources: [{ url: "https://b.edu", title: "B", reason: "rb" }]
      })
    });

    const result = await runSourceRelevanceCheck("domain-1");

    expect(result.source).toBe("fallback");
    expect(result.warning).toContain("抓取可达");
    expect(providerMock.generateText).not.toHaveBeenCalled();
  });
});
