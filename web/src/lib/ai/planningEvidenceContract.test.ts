import { describe, expect, it } from "vitest";
import { parseGoals, resolveContentCoverage, ConceptPlanningValidationError } from "../learning/conceptPlanning";
import { scopedContentQuestions } from "../learning/curriculumBoundary";
import { currentCourse, currentRoadmap } from "../learning/currentRoadmap.fixture";
import { roadmapDraftToSkeleton } from "../learning/roadmapService";
import type { RoadmapInput } from "../learning/roadmapService";
import { validateCourseDesignDraft, validateCourseDesignCritique, validateMapDraftQualityReport, validateRoadmapSkeletonDraft } from "./tasks";
import { validateContentRevisions } from "./planningReviewPolicy";

describe("planning responsibilities and independent evidence", () => {
  it("keeps elective responsibility through registry resolution and node scope", () => {
    const plan: RoadmapInput = currentRoadmap();
    plan.learningGoals![0].contentQuestions![0].importance = "optional";
    const moduleQuestion = plan.stages![0].moduleBlueprints![0].keyQuestions[0];
    moduleQuestion.importance = "required";
    resolveContentCoverage({ learningGoals: plan.learningGoals, stages: plan.stages! });
    expect(moduleQuestion.importance).toBe("optional");
    const registry = parseGoals(JSON.parse(JSON.stringify(plan.learningGoals)))[0].contentQuestions!;
    const scoped = scopedContentQuestions(registry, [{ contentQuestionKey: registry[0].key, requirementIndices: [1], dimensionKeys: [], contribution: "only the second material requirement" }]);
    expect(scoped[0].importance).toBe("optional");
    expect(scoped[0].requirementIndices).toEqual([1]);
    expect(scoped[0].contentRequirements).toEqual([registry[0].contentRequirements[1]]);
  });

  it("does not promote old unspecified responsibility and rejects unknown values", () => {
    const plan: RoadmapInput = currentRoadmap();
    plan.stages![0].moduleBlueprints![0].keyQuestions[0].importance = "required";
    resolveContentCoverage({ learningGoals: plan.learningGoals, stages: plan.stages! });
    expect(plan.stages![0].moduleBlueprints![0].keyQuestions[0]).not.toHaveProperty("importance");
    expect(parseGoals(plan.learningGoals)[0].contentQuestions![0]).not.toHaveProperty("importance");
    const invalid = JSON.parse(JSON.stringify(plan.learningGoals));
    invalid[0].contentQuestions[0].importance = "mastered";
    try {
      parseGoals(invalid);
      throw new Error("The invalid importance must not be silently dropped");
    } catch (error) {
      expect(error).toBeInstanceOf(ConceptPlanningValidationError);
      expect((error as ConceptPlanningValidationError).issues[0]).toMatchObject({ code: "invalid_content_importance", path: "learningGoals[0].contentQuestions[0].importance", questionKey: "cq-count" });
    }
  });

  it("cannot silently promote elective responsibility during global content repair", () => {
    const before = parseGoals(currentRoadmap().learningGoals);
    before[0].contentQuestions![0].importance = "optional";
    const after = structuredClone(before);
    after[0].contentQuestions![0].importance = "required";
    expect(() => validateContentRevisions(before, after, [])).toThrow("不能默默丢弃要求");
    const audited = validateContentRevisions(before, after, [{ previousQuestionKey: "cq-count", revisedQuestionKeys: ["cq-count"], reason: "针对用户新目标提出责任调整，仍须查看并确认新地图草稿" }]);
    expect(audited[0].before?.importance).toBe("optional");
    expect(audited[0].after[0].importance).toBe("required");
  });

  it("preserves the proposed ordering reason without creating prerequisite edges", () => {
    const skeleton = roadmapDraftToSkeleton(currentRoadmap());
    skeleton.stages[0].rationale = "先比较图像便于理解计数；这只是教学选择，不增加逻辑前置。";
    const saved = validateRoadmapSkeletonDraft(skeleton);
    expect(saved.stages[0].rationale).toBe(skeleton.stages[0].rationale);
    expect(saved.stages[0].prerequisiteStageKeys).toEqual([]);
    const old = structuredClone(skeleton);
    delete old.stages[0].rationale;
    expect(validateRoadmapSkeletonDraft(old).stages[0].rationale).toBeNull();
  });

  it("retains real retrieval failure facts and complete successful snapshots during critique parsing", () => {
    const succeeded = {
      ok: true, status: 200, title: "actual material", excerpt: "实际正文",
      finalUrl: "https://material.edu/course/chapter", bodyRetrieved: true,
      contentHash: "a".repeat(64), retrievedAt: "2026-10-09T12:00:00.000Z", error: null,
      fragments: [{ location: "paragraph:4", text: "结论以及明确适用条件" }],
      relevance: { score: 0.9, lowRelevance: false }, aiRelevance: { score: 0.8, lowRelevance: false, reason: "matches the actual question" }
    };
    const failed = { ok: false, status: 403, title: null, excerpt: null, bodyRetrieved: false, error: "public body unavailable", fragments: [], contentHash: null, retrievedAt: "2026-10-09T12:00:00.000Z" };
    const candidate = { ...currentCourse, sources: [{ url: "https://material.edu/course", title: "material", reason: "actual reference", grounding: succeeded }, { url: "https://material.edu/blocked", title: "candidate only", reason: "pending reference", grounding: failed }] };
    const parsed = validateCourseDesignCritique({ draft: candidate, report: { summary: "source facts retained", significantIssues: false, dimensions: [{ key: "sourceQuality", score: 3, note: "one body missing" }] } });
    expect(parsed.draft.sources[0].grounding).toEqual(succeeded);
    expect(parsed.draft.sources[1].grounding).toMatchObject(failed);
  });

  it("does not allow generated model JSON to manufacture independent knowledge evidence", () => {
    const forged = { version: 1, claims: [], status: "no_error_found" };
    expect(validateCourseDesignDraft({ ...currentCourse, knowledgeReview: forged })).not.toHaveProperty("knowledgeReview");
    expect(validateMapDraftQualityReport({ summary: "structure only", blockingIssues: [], warnings: [], knowledgeReview: forged })).not.toHaveProperty("knowledgeReview");
  });
});
