import { describe, expect, it } from "vitest";
import { currentCourse, currentRoadmap } from "../learning/currentRoadmap.fixture";
import { roadmapDraftToSkeleton } from "../learning/roadmapService";
import { buildRoadmapSkeletonPrompt, buildRoadmapStagePrompt, buildRoadmapSkeletonCritiquePrompt, buildMapDraftQualityReviewPrompt, validateRoadmapSkeletonDraft, validateRoadmapStageDraft, validateRoadmapSkeletonCritique, validateRoadmapSkeletonReview } from "./tasks";
const skeleton = () => roadmapDraftToSkeleton(currentRoadmap());
describe("当前 AI 路线协议", () => {
  it("只生成阶段蓝图，保留总目标和内容登记而不生成早期教材", () => {
    const prompt = buildRoadmapSkeletonPrompt({ name: "图像", goal: "判断根数" }, currentCourse);
    expect(prompt).toContain("planningVersion=3"); expect(prompt).toContain("contentQuestionKey"); expect(prompt).toContain("moduleBlueprints");
    const saved = validateRoadmapSkeletonDraft(skeleton());
    expect(saved.planningVersion).toBe(3); expect(saved.learningGoals?.[0].contentQuestions?.[0].key).toBe("cq-count");
    expect(saved.stages[0].moduleBlueprints?.[0].keyQuestions[0].contentQuestionKey).toBe("cq-count");
  });
  it("未知登记引用和缺少实际模块的问题不能伪装为通过", () => {
    const a = skeleton(); a.stages[0].moduleBlueprints![0].keyQuestions[0].contentQuestionKey = "fake";
    expect(() => validateRoadmapSkeletonDraft(a)).toThrow();
    const b = skeleton(); b.stages[0].moduleBlueprints = [];
    expect(() => validateRoadmapSkeletonDraft(b)).toThrow();
  });
  it("阶段规划保存多问题承接和教学范围，不提前写正文或强制单概念", () => {
    const s = skeleton(); const prompt = buildRoadmapStagePrompt({ domain: { name: "图像", goal: "判断根数" }, courseDesign: currentCourse, skeleton: s, stage: s.stages[0], stageIndex: 0 });
    expect(prompt).toContain("planningQuestionKeys"); expect(prompt).toContain("CURRICULUM PLANNING, not a lesson body");
    const stage = validateRoadmapStageDraft(currentRoadmap(true).stages[0], true);
    expect(stage.modules![0].items![0].planningQuestionKeys).toEqual(["q-count"]);
    const missing = structuredClone(stage); missing.modules![0].items![0].concept = undefined;
    expect(() => validateRoadmapStageDraft(missing, true)).toThrow();
  });
  it("重大缺陷必须引用实际原文、既定要求和影响，资料缺口可保留为建议", () => {
    const draft = skeleton();
    const report = validateRoadmapSkeletonReview({ report: { reviewPolicyVersion: 1, summary: "具体教学缺口", blockingIssues: [{ code: "missingEssentialPrerequisite", targetKey: "graph", message: "必要基础缺失", evidence: { draftExcerpt: "图像计数", requirement: "解释图像", impact: "无法理解当前任务" } }], warnings: [{ code: "sourceGap", targetKey: null, message: "资料不足，待核对" }] } }, draft);
    expect(report.status).toBe("blocked"); expect(report.warnings[0].code).toBe("sourceGap");
    expect(() => validateRoadmapSkeletonReview({ report: { reviewPolicyVersion: 1, summary: "模糊", blockingIssues: [{ code: "fabricatedSource", targetKey: null, message: "来源不足" }], warnings: [] } }, draft)).toThrow();
  });
  it("核对实际覆盖与前置，允许合理合讲和普通建议", () => {
    const draft = skeleton(); const prompt = buildRoadmapSkeletonCritiquePrompt({ domain: { name: "图像" }, courseDesign: currentCourse, skeleton: draft });
    expect(prompt).toContain("no supported serious defect"); expect(prompt).toContain("MAY be taught together"); expect(prompt).toContain("NOT fabricatedSource");
    const mapPrompt = buildMapDraftQualityReviewPrompt({ domain: { name: "图像" }, courseDesign: currentCourse, draft: currentRoadmap(true), scope: "stage" });
    expect(mapPrompt).not.toContain("nine-dimension"); expect(mapPrompt).toContain("contentQuestionKey");
  });
  it("修订不能丢失规划版本或总目标身份", () => {
    const original = skeleton();
    expect(() => validateRoadmapSkeletonCritique({ draft: { ...original, planningVersion: 2 }, report: { reviewPolicyVersion: 1, summary: "模拟", blockingIssues: [], warnings: [] } }, original)).toThrow();
    const changed = structuredClone(original); changed.learningGoals![0].description = "新目标";
    expect(() => validateRoadmapSkeletonCritique({ draft: changed, report: { reviewPolicyVersion: 1, summary: "模拟", blockingIssues: [], warnings: [] } }, original)).toThrow();
  });
});
