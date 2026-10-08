import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { AiTaskValidationError } from "../../../../../../lib/ai/tasks";
import { AiLogPersistenceError } from "../../../../../../lib/ai/generationEvidence";

const tutorServiceMock = vi.hoisted(() => ({
  generateRoadmapSkeletonDraft: vi.fn(),
  generateRoadmapStageDraft: vi.fn(),
  reviewRoadmapDraftQuality: vi.fn()
}));

const courseDesignServiceMock = vi.hoisted(() => ({
  getConfirmedCourseDesign: vi.fn(),
  getCourseDesignState: vi.fn()
}));

const roadmapServiceMock = vi.hoisted(() => ({
  getRoadmapByDomain: vi.fn(),
  saveRoadmapDraft: vi.fn(),
  roadmapDraftToSkeleton: vi.fn(),
  mergeRoadmapStageDraft: vi.fn()
}));

const reviewServiceMock = vi.hoisted(() => ({
  evaluateMapDraftReview: vi.fn(),
  getBoundMapDraftReview: vi.fn(),
  recordMapDraftQualityReview: vi.fn()
}));

vi.mock("../../../../../../lib/ai/tutorService", () => ({
  generateRoadmapSkeletonDraft: tutorServiceMock.generateRoadmapSkeletonDraft,
  generateRoadmapStageDraft: tutorServiceMock.generateRoadmapStageDraft,
  reviewRoadmapDraftQuality: tutorServiceMock.reviewRoadmapDraftQuality
}));

vi.mock("../../../../../../lib/learning/courseDesignService", () => ({
  getConfirmedCourseDesign: courseDesignServiceMock.getConfirmedCourseDesign,
  getCourseDesignState: courseDesignServiceMock.getCourseDesignState
}));

vi.mock("../../../../../../lib/learning/roadmapService", () => ({
  getRoadmapByDomain: roadmapServiceMock.getRoadmapByDomain,
  saveRoadmapDraft: roadmapServiceMock.saveRoadmapDraft,
  roadmapDraftToSkeleton: roadmapServiceMock.roadmapDraftToSkeleton,
  mergeRoadmapStageDraft: roadmapServiceMock.mergeRoadmapStageDraft,
  roadmapSkeletonToDraft: (skeleton: any, baseRevision: number) => ({
    planningVersion: 2,
    title: skeleton.title,
    status: "draft",
    baseRevision,
    stages: skeleton.stages.map((stage: any) => ({
      ...stage,
      status: "planned",
      moduleDirections: stage.coreTopics,
      modules: []
    }))
  })
}));

vi.mock("../../../../../../lib/learning/mapDraftReviewService", () => ({
  evaluateMapDraftReview: reviewServiceMock.evaluateMapDraftReview,
  getBoundMapDraftReview: reviewServiceMock.getBoundMapDraftReview,
  recordMapDraftQualityReview: reviewServiceMock.recordMapDraftQualityReview
}));

const params = { params: Promise.resolve({ id: "d1" }) };

const validCourseDesign = {
  taskBriefSnapshot: "学习目标：完成一个可运行项目。",
  globalExplanation: {
    theorySkeleton: "先建立基本对象、核心问题和最小先修链。",
    sourceBasis: "优先参考大学课程，再用官方文档补充。",
    optimizationRationale: "先修关系优先，其次匹配项目产出。",
    risksAndValidation: "仍需诊断当前基础和误区。"
  },
  sources: [
    {
      url: "https://ocw.mit.edu/courses/18-01sc-single-variable-calculus-fall-2010/",
      title: "MIT OpenCourseWare Calculus",
      reason: "课程结构清晰，适合作为主骨架。"
    }
  ],
  keyTradeoffs: ["降低理论密度，保留必要先修。"],
  qualityGate: { passed: true, missing: [] }
};

const validSkeleton = {
  planningVersion: 2 as const,
  title: "领域地图骨架",
  status: "draft",
  stages: [
    {
      key: "foundation",
      title: "基础阶段",
      goal: "建立最小可用理解。",
      coreTopics: ["对象", "关系"],
      prerequisiteStageTitles: [],
      prerequisiteStageKeys: [],
      moduleBlueprints: [
        {
          key: "objects",
          title: "核心对象",
          goal: "识别对象和边界。",
          keyQuestions: [
            {
              key: "object-meaning",
              question: "这个领域的最小对象是什么？",
              checkableOutcome: "能定义对象并给出一个反例。"
            },
            {
              key: "object-boundary",
              question: "这个对象的边界在哪里？",
              checkableOutcome: "能说出对象不适用的一个场景。"
            }
          ]
        }
      ]
    }
  ]
};

const validStage = {
  key: "foundation",
  title: "基础阶段",
  goal: "建立最小可用理解。",
  status: "expanded",
  prerequisiteStageKeys: [],
  modules: [
    {
      title: "核心对象",
      goal: "识别对象和边界。",
      items: [
        {
          key: "foundation-object",
          title: "对象识别",
          keyQuestion: "这个领域最小对象是什么？",
          objective: "能说清对象定义。",
          prerequisite: "无",
          commonMistake: "把工具当成对象。",
          transferPrompt: "用另一个领域类比这个对象。",
          prerequisiteKeys: [],
          planningQuestionKey: "object-meaning",
          status: "not_started"
        },
        {
          key: "foundation-object-example",
          title: "对象实例",
          keyQuestion: "这个对象的一个实例是什么？",
          objective: "能举出一个实例。",
          prerequisite: "对象识别",
          commonMistake: "把反例当成实例。",
          transferPrompt: "换一个场景再举一个实例。",
          prerequisiteKeys: ["foundation-object"],
          planningQuestionKey: "object-meaning",
          status: "not_started"
        },
        {
          key: "foundation-boundary",
          title: "对象边界",
          keyQuestion: "这个对象的边界在哪里？",
          objective: "能说出适用边界。",
          prerequisite: "对象实例",
          commonMistake: "把边界当成对象属性。",
          transferPrompt: "在另一个领域找类似边界。",
          prerequisiteKeys: ["foundation-object-example"],
          planningQuestionKey: "object-boundary",
          status: "not_started"
        },
        {
          key: "foundation-boundary-counterexample",
          title: "边界反例",
          keyQuestion: "什么不属于这个对象？",
          objective: "能给出一个反例。",
          prerequisite: "对象边界",
          commonMistake: "把边界情况当成反例。",
          transferPrompt: "用反例检验另一个定义。",
          prerequisiteKeys: ["foundation-boundary"],
          planningQuestionKey: "object-boundary",
          status: "not_started"
        }
      ]
    }
  ]
};

describe("domain map ai draft API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    courseDesignServiceMock.getCourseDesignState.mockResolvedValue({
      draft: validCourseDesign,
      status: "confirmed",
      aiCallLogId: "course-log-1"
    });
    roadmapServiceMock.getRoadmapByDomain.mockResolvedValue({ mapRevision: 4 });
    reviewServiceMock.getBoundMapDraftReview.mockResolvedValue({ status: "passed" });
    reviewServiceMock.recordMapDraftQualityReview.mockResolvedValue({
      id: "review-1"
    });
    reviewServiceMock.evaluateMapDraftReview.mockReturnValue("passed");
    roadmapServiceMock.roadmapDraftToSkeleton.mockReturnValue(validSkeleton);
    roadmapServiceMock.mergeRoadmapStageDraft.mockImplementation(
      (draft: any, stageKey: string, stage: any) => ({
        ...draft,
        stages: draft.stages.map((candidate: any) =>
          candidate.key === stageKey ? { ...candidate, ...stage, key: stageKey } : candidate
        )
      })
    );
    roadmapServiceMock.saveRoadmapDraft.mockImplementation(
      async (_domainId: string, draft: unknown) => ({
        domainId: "d1",
        mapRevision: 4,
        draft
      })
    );
  });

  it("keeps the requested Stage repair scope while reviewing a v3 expansion as a whole map", async () => {
    const skeleton = { ...validSkeleton, planningVersion: 3, learningGoals: [{ key: "goal-1", description: "说明核心对象。" }] };
    const draft = { ...skeleton, baseRevision: 4, stages: skeleton.stages.map(stage => ({
      ...stage, status: "planned", moduleDirections: stage.coreTopics, modules: []
    })) };
    roadmapServiceMock.getRoadmapByDomain.mockResolvedValue({ mapRevision: 4, draft, draftCourseDesignAiCallLogId: "course-log-1" });
    roadmapServiceMock.roadmapDraftToSkeleton.mockReturnValue(skeleton);
    tutorServiceMock.generateRoadmapStageDraft.mockResolvedValue({ stage: validStage, source: "ai", aiCallLogId: "generation-1" });
    tutorServiceMock.reviewRoadmapDraftQuality.mockImplementation(async (_domainId: string, input: { draft: unknown }) => ({
      draft: input.draft, qualityReport: { status: "passed", summary: "结构与复核完成。", blockingIssues: [], warnings: [] }, aiCallLogIds: ["review-1"], repairAttempts: 0
    }));
    const response = await POST(new Request("http://localhost/api/domains/d1/map/ai-draft", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step: "stage", stageKey: "foundation", baseRevision: 4 })
    }), params);
    expect(response.status).toBe(200);
    expect(tutorServiceMock.reviewRoadmapDraftQuality).toHaveBeenCalledWith("d1", expect.objectContaining({ scope: "map", stageKey: "foundation" }));
    expect(reviewServiceMock.recordMapDraftQualityReview).toHaveBeenCalledWith(expect.objectContaining({ scope: "map", stageKey: "foundation" }));
  });

  it("rejects when the course design direction is not confirmed server-side", async () => {
    courseDesignServiceMock.getCourseDesignState.mockResolvedValue({
      draft: validCourseDesign,
      status: "draft",
      aiCallLogId: "course-log-1"
    });

    const response = await POST(
      new Request("http://localhost/api/domains/d1/map/ai-draft", {
        method: "POST"
      }),
      params
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("请先确认课程设计方向");
    expect(tutorServiceMock.generateRoadmapSkeletonDraft).not.toHaveBeenCalled();
    expect(tutorServiceMock.generateRoadmapStageDraft).not.toHaveBeenCalled();
  });

  it("returns failure evidence references and specific issues without persisting an invalid map", async () => {
    const issue = { code: "invalid_module_goals", path: "stages[0].moduleBlueprints[0].goalKeys", message: "模块需要关联所属阶段的目标。", actualGoalKeys: ["bad-goal"], allowedGoalKeys: ["limit-goal"] };
    const failure = Object.assign(new AiTaskValidationError(issue.message, [issue]), { aiRunId: "run-1", aiCallLogId: "failed-log-2", aiCallLogIds: ["failed-log-1", "failed-log-2"], rawOutput: "only the log detail may contain this" });
    tutorServiceMock.generateRoadmapSkeletonDraft.mockRejectedValue(failure);
    const response = await POST(new Request("http://localhost/api/domains/d1/map/ai-draft", { method: "POST" }), params);
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data).toMatchObject({ aiRunId: "run-1", aiCallLogId: "failed-log-2", aiCallLogIds: ["failed-log-1", "failed-log-2"], validationIssues: [issue] });
    expect(data.rawOutput).toBeUndefined();
    expect(roadmapServiceMock.saveRoadmapDraft).not.toHaveBeenCalled();
  });

  it("stops map generation when the audit record cannot be saved", async () => {
    tutorServiceMock.generateRoadmapSkeletonDraft.mockRejectedValue(new AiLogPersistenceError());
    const response = await POST(new Request("http://localhost/api/domains/d1/map/ai-draft", { method: "POST" }), params);
    expect(response.status).toBe(500);
    expect(roadmapServiceMock.saveRoadmapDraft).not.toHaveBeenCalled();
  });

  it("generates only the roadmap skeleton by default", async () => {
    tutorServiceMock.generateRoadmapSkeletonDraft.mockResolvedValue({
      skeleton: validSkeleton,
      source: "ai",
      aiCallLogIds: ["generation-log", "critique-log"],
      qualityReport: {
        status: "passed",
        summary: "通过",
        blockingIssues: [],
        warnings: []
      }
    });

    const response = await POST(
      new Request("http://localhost/api/domains/d1/map/ai-draft", {
        method: "POST"
      }),
      params
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.skeleton).toEqual(validSkeleton);
    expect(data.draft).toEqual(
      expect.objectContaining({ planningVersion: 2, baseRevision: 4 })
    );
    expect(data.courseDesignAiCallLogId).toBe("course-log-1");
    expect(tutorServiceMock.generateRoadmapSkeletonDraft).toHaveBeenCalledWith(
      "d1",
      { courseDesign: validCourseDesign }
    );
    expect(tutorServiceMock.generateRoadmapStageDraft).not.toHaveBeenCalled();
    expect(roadmapServiceMock.saveRoadmapDraft).toHaveBeenCalledWith(
      "d1",
      expect.objectContaining({ planningVersion: 2, baseRevision: 4 }),
      "course-log-1",
      { expectedCurrentDraft: null }
    );
    expect(reviewServiceMock.recordMapDraftQualityReview).toHaveBeenCalledWith(
      expect.objectContaining({
        domainId: "d1",
        scope: "skeleton",
        baseRevision: 4,
        courseDesignAiCallLogId: "course-log-1",
        aiCallLogIds: ["generation-log", "critique-log"]
      })
    );
  });

  it("can generate the skeleton for a combined course-design and map review", async () => {
    courseDesignServiceMock.getCourseDesignState.mockResolvedValue({
      draft: validCourseDesign,
      status: "draft",
      aiCallLogId: "course-log-1"
    });
    tutorServiceMock.generateRoadmapSkeletonDraft.mockResolvedValue({
      skeleton: validSkeleton,
      source: "ai",
      aiCallLogIds: ["generation-log", "critique-log"],
      qualityReport: {
        status: "passed",
        summary: "通过",
        blockingIssues: [],
        warnings: []
      }
    });

    const response = await POST(
      new Request("http://localhost/api/domains/d1/map/ai-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "skeleton",
          courseDesign: validCourseDesign
        })
      }),
      params
    );

    expect(response.status).toBe(200);
    expect(courseDesignServiceMock.getConfirmedCourseDesign).not.toHaveBeenCalled();
    expect(courseDesignServiceMock.getCourseDesignState).toHaveBeenCalledWith(
      "d1"
    );
    expect(tutorServiceMock.generateRoadmapSkeletonDraft).toHaveBeenCalledWith(
      "d1",
      { courseDesign: validCourseDesign }
    );
  });

  it("persists and exposes blocking skeleton findings without making them confirmable", async () => {
    tutorServiceMock.generateRoadmapSkeletonDraft.mockResolvedValue({
      skeleton: validSkeleton,
      source: "ai",
      aiCallLogIds: ["generation-log", "critique-log", "repair-1", "repair-2"],
      repairAttempts: 2,
      qualityReport: {
        status: "blocked",
        summary: "积分问题仍混合多个能力。",
        blockingIssues: [
          {
            code: "questionAtomicity",
            targetKey: "integral-methods",
            message: "问题仍过载。",
            suggestion: "拆分。"
          }
        ],
        warnings: []
      }
    });

    const response = await POST(
      new Request("http://localhost/api/domains/d1/map/ai-draft", {
        method: "POST"
      }),
      params
    );

    expect(response.status).toBe(422);
    expect(reviewServiceMock.recordMapDraftQualityReview).toHaveBeenCalledWith(
      expect.objectContaining({
        report: expect.objectContaining({ status: "blocked" })
      })
    );
    await expect(response.json()).resolves.toMatchObject({
      reviewState: "blocked",
      qualityReport: {
        status: "blocked",
        blockingIssues: [
          expect.objectContaining({ targetKey: "integral-methods" })
        ]
      }
    });
  });

  it("rejects a stale persisted course design even when the client submits a passing draft", async () => {
    courseDesignServiceMock.getCourseDesignState.mockResolvedValue({
      draft: validCourseDesign,
      status: "needs_review",
      aiCallLogId: "course-log-1"
    });

    const response = await POST(
      new Request("http://localhost/api/domains/d1/map/ai-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "skeleton",
          courseDesign: validCourseDesign
        })
      }),
      params
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("课程设计方向已失效")
    });
    expect(tutorServiceMock.generateRoadmapSkeletonDraft).not.toHaveBeenCalled();
  });

  it("generates one requested roadmap stage", async () => {
    tutorServiceMock.generateRoadmapStageDraft.mockResolvedValue({
      stage: validStage,
      stageIndex: 0,
      source: "ai",
      aiCallLogId: "stage-log-1",
      aiCallLogIds: ["stage-log-1"]
    });
    const serverDraft = {
      planningVersion: 2,
      title: validSkeleton.title,
      status: "draft",
      baseRevision: 4,
      stages: validSkeleton.stages.map((stage) => ({
        ...stage,
        status: "planned",
        moduleDirections: stage.coreTopics,
        modules: []
      }))
    };
    roadmapServiceMock.getRoadmapByDomain.mockResolvedValue({
      mapRevision: 4,
      draft: serverDraft,
      draftCourseDesignAiCallLogId: "course-log-1"
    });
    roadmapServiceMock.saveRoadmapDraft.mockImplementation(
      async (_domainId: string, stageDraft: any) => ({
        domainId: "d1",
        mapRevision: 4,
        courseDesignAiCallLogId: "course-log-1",
        draft: stageDraft
      })
    );

    const response = await POST(
      new Request("http://localhost/api/domains/d1/map/ai-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "stage",
          stageKey: "foundation",
          baseRevision: 4,
          skeleton: { title: "malicious client skeleton", stages: [] }
        })
      }),
      params
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.stage).toEqual(expect.objectContaining(validStage));
    expect(tutorServiceMock.generateRoadmapStageDraft).toHaveBeenCalledWith(
      "d1",
      {
        courseDesign: validCourseDesign,
        skeleton: validSkeleton,
        stageIndex: 0
      }
    );
    expect(tutorServiceMock.generateRoadmapSkeletonDraft).not.toHaveBeenCalled();
    expect(roadmapServiceMock.roadmapDraftToSkeleton).toHaveBeenCalledWith(
      serverDraft
    );
    expect(roadmapServiceMock.saveRoadmapDraft).toHaveBeenCalledWith(
      "d1",
      expect.objectContaining({ planningVersion: 2, baseRevision: 4 }),
      "course-log-1",
      { expectedCurrentDraft: serverDraft }
    );
    expect(reviewServiceMock.recordMapDraftQualityReview).toHaveBeenCalledWith(
      expect.objectContaining({
        scope: "stage",
        stageKey: "foundation",
        baseRevision: 4,
        aiCallLogIds: ["stage-log-1"]
      })
    );
  });

  it("forces a full semantic review when another edit made the prior receipt stale", async () => {
    tutorServiceMock.generateRoadmapStageDraft.mockResolvedValue({
      stage: validStage,
      stageIndex: 0,
      source: "ai",
      aiCallLogId: "stage-log-1",
      aiCallLogIds: ["stage-log-1"]
    });
    const serverDraft = {
      planningVersion: 2 as const,
      title: validSkeleton.title,
      status: "draft",
      baseRevision: 4,
      stages: validSkeleton.stages.map((stage) => ({
        ...stage,
        status: "planned" as const,
        moduleDirections: stage.coreTopics,
        modules: []
      }))
    };
    const reviewedDraft = {
      ...serverDraft,
      stages: [{ ...serverDraft.stages[0], ...validStage }]
    };
    roadmapServiceMock.getRoadmapByDomain.mockResolvedValue({
      mapRevision: 4,
      draft: serverDraft,
      draftCourseDesignAiCallLogId: "course-log-1"
    });
    reviewServiceMock.evaluateMapDraftReview.mockReturnValue("stale");
    tutorServiceMock.reviewRoadmapDraftQuality.mockResolvedValue({
      draft: reviewedDraft,
      qualityReport: {
        status: "passed",
        summary: "整图复审通过",
        blockingIssues: [],
        warnings: []
      },
      aiCallLogIds: ["map-review-log-1"],
      repairAttempts: 0
    });

    const response = await POST(
      new Request("http://localhost/api/domains/d1/map/ai-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "stage",
          stageKey: "foundation",
          baseRevision: 4
        })
      }),
      params
    );

    expect(response.status).toBe(200);
    expect(tutorServiceMock.reviewRoadmapDraftQuality).toHaveBeenCalledWith(
      "d1",
      {
        courseDesign: validCourseDesign,
        draft: expect.objectContaining({ planningVersion: 2 }),
        scope: "map"
      }
    );
    expect(reviewServiceMock.recordMapDraftQualityReview).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "map", stageKey: null })
    );
  });

  it("uses a full-map review when the generated Stage has semantic risk", async () => {
    const riskyStage = {
      ...validStage,
      modules: [
        {
          ...validStage.modules[0],
          items: [
            {
              ...validStage.modules[0].items[0],
              keyQuestion: "这个对象是什么？它的边界又是什么？"
            }
          ]
        }
      ]
    };
    tutorServiceMock.generateRoadmapStageDraft.mockResolvedValue({
      stage: riskyStage,
      stageIndex: 0,
      source: "ai",
      aiCallLogId: "stage-log-1",
      aiCallLogIds: ["stage-log-1"]
    });
    const serverDraft = {
      planningVersion: 2 as const,
      title: validSkeleton.title,
      status: "draft",
      baseRevision: 4,
      stages: validSkeleton.stages.map((stage) => ({
        ...stage,
        status: "planned" as const,
        moduleDirections: stage.coreTopics,
        modules: []
      }))
    };
    roadmapServiceMock.getRoadmapByDomain.mockResolvedValue({
      mapRevision: 4,
      draft: serverDraft,
      draftCourseDesignAiCallLogId: "course-log-1"
    });
    tutorServiceMock.reviewRoadmapDraftQuality.mockResolvedValue({
      draft: { ...serverDraft, stages: [{ ...serverDraft.stages[0], ...riskyStage }] },
      qualityReport: {
        status: "passed",
        summary: "整图复审通过",
        blockingIssues: [],
        warnings: []
      },
      aiCallLogIds: ["map-review-log-1"],
      repairAttempts: 0
    });

    const response = await POST(
      new Request("http://localhost/api/domains/d1/map/ai-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "stage",
          stageKey: "foundation",
          baseRevision: 4
        })
      }),
      params
    );

    expect(response.status).toBe(200);
    expect(tutorServiceMock.reviewRoadmapDraftQuality).toHaveBeenCalledWith(
      "d1",
      expect.objectContaining({ scope: "map" })
    );
    expect(reviewServiceMock.recordMapDraftQualityReview).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "map", stageKey: null })
    );
  });

  it("forces a full semantic review when the expanded Stage is thin against its blueprint", async () => {
    const thinStage = {
      ...validStage,
      modules: [
        {
          ...validStage.modules[0],
          items: [validStage.modules[0].items[0]]
        }
      ]
    };
    tutorServiceMock.generateRoadmapStageDraft.mockResolvedValue({
      stage: thinStage,
      stageIndex: 0,
      source: "ai",
      aiCallLogId: "stage-log-1",
      aiCallLogIds: ["stage-log-1"]
    });
    const serverDraft = {
      planningVersion: 2 as const,
      title: validSkeleton.title,
      status: "draft",
      baseRevision: 4,
      stages: validSkeleton.stages.map((stage) => ({
        ...stage,
        status: "planned" as const,
        moduleDirections: stage.coreTopics,
        modules: []
      }))
    };
    roadmapServiceMock.getRoadmapByDomain.mockResolvedValue({
      mapRevision: 4,
      draft: serverDraft,
      draftCourseDesignAiCallLogId: "course-log-1"
    });
    tutorServiceMock.reviewRoadmapDraftQuality.mockResolvedValue({
      draft: {
        ...serverDraft,
        stages: [{ ...serverDraft.stages[0], ...thinStage }]
      },
      qualityReport: {
        status: "passed",
        summary: "整图复审通过，密度建议仅作为警告。",
        blockingIssues: [],
        warnings: [
          {
            code: "densityBalance",
            targetKey: "foundation",
            message: "展开节点相对规划问题偏少。",
            suggestion: "可选补充节点。"
          }
        ]
      },
      aiCallLogIds: ["map-review-log-1"],
      repairAttempts: 0
    });

    const response = await POST(
      new Request("http://localhost/api/domains/d1/map/ai-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "stage",
          stageKey: "foundation",
          baseRevision: 4
        })
      }),
      params
    );

    expect(response.status).toBe(200);
    expect(tutorServiceMock.reviewRoadmapDraftQuality).toHaveBeenCalledWith(
      "d1",
      expect.objectContaining({ scope: "map" })
    );
    expect(reviewServiceMock.recordMapDraftQualityReview).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "map", stageKey: null })
    );
    const data = await response.json();
    expect(data.reviewState).toBe("passed");
    expect(data.qualityReport.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "densityBalance" })
      ])
    );
  });

  it("treats the current confirmed v2 map as the trusted baseline for a low-risk Stage", async () => {
    tutorServiceMock.generateRoadmapStageDraft.mockResolvedValue({
      stage: validStage,
      stageIndex: 0,
      source: "ai",
      aiCallLogId: "stage-log-1",
      aiCallLogIds: ["stage-log-1"]
    });
    roadmapServiceMock.getRoadmapByDomain.mockResolvedValue({
      mapRevision: 5,
      planningVersion: 2,
      status: "confirmed",
      draft: null,
      draftCourseDesignAiCallLogId: null,
      title: validSkeleton.title,
      stages: validSkeleton.stages.map((stage) => ({
        ...stage,
        status: "planned",
        moduleDirections: stage.coreTopics,
        modules: []
      }))
    });
    reviewServiceMock.evaluateMapDraftReview.mockReturnValue("stale");

    const response = await POST(
      new Request("http://localhost/api/domains/d1/map/ai-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "stage",
          stageKey: "foundation",
          baseRevision: 5
        })
      }),
      params
    );

    expect(response.status).toBe(200);
    expect(tutorServiceMock.reviewRoadmapDraftQuality).not.toHaveBeenCalled();
    expect(reviewServiceMock.recordMapDraftQualityReview).toHaveBeenCalledWith(
      expect.objectContaining({ scope: "stage", stageKey: "foundation" })
    );
  });
});
