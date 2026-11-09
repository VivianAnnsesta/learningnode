import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { AiTaskValidationError } from "../../../../../../lib/ai/tasks";
import { AiLogPersistenceError } from "../../../../../../lib/ai/generationEvidence";
import { AiConfigurationError } from "../../../../../../lib/ai/provider";
import { createUncertainPlanningKnowledgeReview } from "../../../../../../lib/ai/planningKnowledgeReview";

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
    reviewServiceMock.recordMapDraftQualityReview.mockImplementation(async (input) => ({
      id: "review-1", report: input.report, aiCallLogIds: input.aiCallLogIds
    }));
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

  it("does not expose an unavailable skeleton as dismissible after persistence retained its known error", async () => {
    const knowledgeReview = { ...createUncertainPlanningKnowledgeReview(validSkeleton, [], "原核对"), verdict: "confirmed_error", summary: "原规则缺少条件", aiCallLogIds: ["original-error-log"] };
    const storedReport = { status: "blocked", summary: "后续复核不可用", blockingIssues: [], warnings: [], knowledgeReview };
    tutorServiceMock.generateRoadmapSkeletonDraft.mockResolvedValue({
      skeleton: validSkeleton, source: "ai", reviewAvailability: "unavailable", aiCallLogIds: ["failed-review-log"],
      qualityReport: { ...storedReport, knowledgeReview: { ...knowledgeReview, verdict: "uncertain" } }
    });
    reviewServiceMock.recordMapDraftQualityReview.mockResolvedValue({ id: "review-new", report: storedReport, aiCallLogIds: ["original-error-log", "failed-review-log"] });
    const response = await POST(new Request("http://localhost/api/domains/d1/map/ai-draft", { method: "POST" }), params);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ reviewState: "blocked", qualityReview: { availability: "unavailable" }, qualityReport: storedReport, aiCallLogIds: ["original-error-log", "failed-review-log"] });
  });

  it("records explicit unknown knowledge and actual material snapshots when Stage review is unavailable", async () => {
    const skeleton = { ...validSkeleton, planningVersion: 3, learningGoals: [{ key: "goal-1", description: "说明核心对象。" }] };
    const draft = { ...skeleton, baseRevision: 4, stages: skeleton.stages.map(stage => ({ ...stage, status: "planned", moduleDirections: stage.coreTopics, modules: [] })) };
    const course = { ...validCourseDesign, sources: [{ url: "https://material.edu/actual", title: "材料", reason: "实际正文", grounding: { bodyRetrieved: true, finalUrl: "https://material.edu/final", fragments: [{ location: "paragraph:5", text: "来源实际正文介绍对象边界。" }], excerpt: "仅摘要不能替代正文" } }] };
    courseDesignServiceMock.getCourseDesignState.mockResolvedValue({ draft: course, status: "confirmed", aiCallLogId: "course-log-1" });
    roadmapServiceMock.getRoadmapByDomain.mockResolvedValue({ mapRevision: 4, draft, draftCourseDesignAiCallLogId: "course-log-1" });
    roadmapServiceMock.roadmapDraftToSkeleton.mockReturnValue(skeleton);
    tutorServiceMock.generateRoadmapStageDraft.mockResolvedValue({ stage: validStage, source: "ai", aiCallLogId: "generation-1" });
    tutorServiceMock.reviewRoadmapDraftQuality.mockRejectedValue(Object.assign(new AiConfigurationError("暂不可用"), { aiCallLogIds: ["failed-review-log"] }));
    const response = await POST(new Request("http://localhost/api/domains/d1/map/ai-draft", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step: "stage", stageKey: "foundation", baseRevision: 4 })
    }), params);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toMatchObject({ reviewState: "unavailable", aiCallLogIds: ["generation-1", "failed-review-log"], qualityReport: { knowledgeReview: { verdict: "uncertain", claims: [], findings: [], materials: [{ url: "https://material.edu/final", location: "paragraph:5", text: "来源实际正文介绍对象边界。" }] } } });
    expect(JSON.stringify(data.qualityReport.knowledgeReview.materials)).not.toContain("仅摘要不能替代正文");
    expect(reviewServiceMock.recordMapDraftQualityReview).toHaveBeenCalledWith(expect.objectContaining({ availability: "unavailable", report: data.qualityReport }));
  });

  it("returns a persisted Stage knowledge block even if its local retry result is unavailable", async () => {
    const skeleton = { ...validSkeleton, planningVersion: 3, learningGoals: [{ key: "goal-1", description: "说明核心对象。" }] };
    const draft = { ...skeleton, baseRevision: 4, stages: skeleton.stages.map(stage => ({ ...stage, status: "planned", moduleDirections: stage.coreTopics, modules: [] })) };
    roadmapServiceMock.getRoadmapByDomain.mockResolvedValue({ mapRevision: 4, draft, draftCourseDesignAiCallLogId: "course-log-1" });
    roadmapServiceMock.roadmapDraftToSkeleton.mockReturnValue(skeleton);
    tutorServiceMock.generateRoadmapStageDraft.mockResolvedValue({ stage: validStage, source: "ai", aiCallLogId: "generation-1" });
    tutorServiceMock.reviewRoadmapDraftQuality.mockRejectedValue(new AiConfigurationError("暂不可用"));
    const knowledgeReview = { ...createUncertainPlanningKnowledgeReview(draft, [], "原核对"), verdict: "confirmed_error", summary: "已有明确错误" };
    const storedReport = { status: "blocked", summary: "服务不可用", blockingIssues: [], warnings: [], knowledgeReview };
    reviewServiceMock.recordMapDraftQualityReview.mockResolvedValue({ id: "review-new", report: storedReport, aiCallLogIds: ["original-error-log", "generation-1"] });
    const response = await POST(new Request("http://localhost/api/domains/d1/map/ai-draft", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step: "stage", stageKey: "foundation", baseRevision: 4 }) }), params);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ reviewState: "blocked", qualityReview: { availability: "unavailable" }, qualityReport: storedReport, aiCallLogIds: ["original-error-log", "generation-1"] });
  });

  // Superseded contract: generates one requested roadmap stage.
// Current equivalents use real SQLite in learningSessionService/roadmapLifecycle tests,
// and current provider contracts in coursePlanningCurrent; original test retained in before/retired.


  // Superseded contract: forces a full semantic review when another edit made the prior receipt stale.
// Current equivalents use real SQLite in learningSessionService/roadmapLifecycle tests,
// and current provider contracts in coursePlanningCurrent; original test retained in before/retired.


  // Superseded contract: uses a full-map review when the generated Stage has semantic risk.
// Current equivalents use real SQLite in learningSessionService/roadmapLifecycle tests,
// and current provider contracts in coursePlanningCurrent; original test retained in before/retired.


  // Superseded contract: forces a full semantic review when the expanded Stage is thin against its blueprint.
// Current equivalents use real SQLite in learningSessionService/roadmapLifecycle tests,
// and current provider contracts in coursePlanningCurrent; original test retained in before/retired.


  // Superseded contract: treats the current confirmed v2 map as the trusted baseline for a low-risk Stage.
// Current equivalents use real SQLite in learningSessionService/roadmapLifecycle tests,
// and current provider contracts in coursePlanningCurrent; original test retained in before/retired.

});
