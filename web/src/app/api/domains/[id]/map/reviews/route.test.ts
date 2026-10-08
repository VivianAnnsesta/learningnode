import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { AiTaskValidationError } from "../../../../../../lib/ai/tasks";

const mocks = vi.hoisted(() => ({ course: vi.fn(), roadmap: vi.fn(), review: vi.fn(), save: vi.fn(), bound: vi.fn(), evaluate: vi.fn(), record: vi.fn() }));
vi.mock("../../../../../../lib/ai/tutorService", () => ({ reviewRoadmapDraftQuality: mocks.review }));
vi.mock("../../../../../../lib/learning/courseDesignService", () => ({ getCourseDesignState: mocks.course }));
vi.mock("../../../../../../lib/learning/roadmapService", () => ({ getRoadmapByDomain: mocks.roadmap, saveRoadmapDraft: mocks.save }));
vi.mock("../../../../../../lib/learning/mapDraftReviewService", () => ({ getBoundMapDraftReview: mocks.bound, evaluateMapDraftReview: mocks.evaluate, recordMapDraftQualityReview: mocks.record }));

describe("Stage repair scope at the formal Domain review API", () => {
  const draft = { planningVersion: 3, baseRevision: 7, learningGoals: [{ key: "goal-1", description: "解释极限。" }],
    stages: [{ key: "limits", status: "expanded", modules: [] }, { key: "derivatives", status: "planned", modules: [] }] };
  const report = { status: "passed", summary: "复核完成。", blockingIssues: [], warnings: [] };
  const params = { params: Promise.resolve({ id: "domain-1" }) };
  const request = (body?: unknown) => new Request("http://localhost/api/domains/domain-1/map/reviews", {
    method: "POST", ...(body === undefined ? {} : { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } })
  });
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.course.mockResolvedValue({ draft: { qualityGate: { passed: true } }, status: "confirmed", aiCallLogId: "course-1" });
    mocks.roadmap.mockResolvedValue({ draft, draftCourseDesignAiCallLogId: "course-1", mapRevision: 7 });
    mocks.review.mockResolvedValue({ draft, qualityReport: report, aiCallLogIds: ["ai-1"], repairAttempts: 1 });
    mocks.save.mockResolvedValue({ draft, mapRevision: 7 });
    mocks.record.mockResolvedValue({ id: "review-1" });
    mocks.bound.mockResolvedValue(null);
    mocks.evaluate.mockReturnValue("stale");
  });

  it("honors the Stage key sent by the existing learning page without weakening whole-map review", async () => {
    const response = await POST(request({ scope: "stage", stageKey: "limits" }), params);
    expect(response.status).toBe(200);
    expect(mocks.review).toHaveBeenCalledWith("domain-1", expect.objectContaining({ scope: "map", stageKey: "limits", draft }));
    expect(mocks.record).toHaveBeenCalledWith(expect.objectContaining({ scope: "map", stageKey: "limits", baseRevision: 7 }));
    expect(mocks.save).toHaveBeenCalledWith("domain-1", draft, "course-1", { expectedCurrentDraft: draft });
  });

  it.each([{ scope: "stage" }, { stageKey: "another-domain-stage" }, { stageKey: "derivatives" }])("rejects an invalid or unexpanded repair target before AI calls: %j", async body => {
    const response = await POST(request(body), params);
    expect(response.status).toBe(400);
    expect(mocks.review).not.toHaveBeenCalled();
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("restores a previous Stage repair boundary only from a still-bound receipt", async () => {
    mocks.bound.mockResolvedValue({ stageKey: "limits" }); mocks.evaluate.mockReturnValue("blocked");
    const response = await POST(request(), params);
    expect(response.status).toBe(200);
    expect(mocks.review).toHaveBeenCalledWith("domain-1", expect.objectContaining({ stageKey: "limits" }));
    expect(mocks.evaluate).toHaveBeenCalledWith(expect.objectContaining({ draft, baseRevision: 7, courseDesignAiCallLogId: "course-1" }));
  });

  it("does not restore a stale boundary or override an explicit whole-map request", async () => {
    mocks.bound.mockResolvedValue({ stageKey: "limits" });
    await POST(request(), params);
    expect(mocks.review).toHaveBeenLastCalledWith("domain-1", expect.objectContaining({ stageKey: undefined }));
    mocks.evaluate.mockReturnValue("passed");
    await POST(request({ scope: "map" }), params);
    expect(mocks.review).toHaveBeenLastCalledWith("domain-1", expect.objectContaining({ stageKey: undefined }));
  });

  it("returns the failed attempt and exact issues without saving an invalid repair", async () => {
    const issue = { code: "invalid_stage_goals", path: "stages[0].goalKeys", message: "阶段目标无效。" };
    const failure = Object.assign(new AiTaskValidationError(issue.message, [issue]), { aiCallLogId: "failed-1", aiCallLogIds: ["failed-1", "failed-2"] });
    mocks.review.mockRejectedValue(failure);
    const response = await POST(request({ scope: "stage", stageKey: "limits" }), params);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ aiCallLogId: "failed-1", aiCallLogIds: ["failed-1", "failed-2"], validationIssues: [issue] });
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
