import { describe, expect, it } from "vitest";
import { parseConcept, parseConceptReferences } from "./conceptPlanning";
import { parseKnowledgeBoundary, parseLearningUnit, parseContentContributions, scopedContentQuestions, validateLearningUnitOwnership } from "./curriculumBoundary";
import { validateCourseDesignDraft, validateRoadmapStageDraft } from "../ai/tasks";
import { validateRoadmapInput, type RoadmapInput } from "./roadmapService";
import type { ContentContribution, CourseContentQuestion } from "./roadmapPlanningTypes";

const boundary = { version: 1, assumedKnowledge: ["高中函数与代数"], newKnowledge: ["极限与导数"] };
const unit = { version: 1, newKnowledge: "用极限描述趋近", assumedKnowledge: ["高中函数与代数"], teachingTasks: ["解释趋近与取到的区别"], example: "x趋近0时x²的变化", references: [] };
const course = { taskBriefSnapshot: "高中基础学习微积分", globalExplanation: { theorySkeleton: "极限到导数", sourceBasis: "指定资料", optimizationRationale: "先建立趋近概念", risksAndValidation: "资料待核对" }, sources: [] };
const concept = (increment: string, references: { key: string; purpose: string }[] = []) => parseConcept({ name: increment, aliases: [], scope: increment, problemRole: "解释变化", learningUnit: { ...unit, newKnowledge: increment, references } });

describe("course foundations and unique learning ownership", () => {
  it("persists fresh boundary requirements without silently upgrading legacy courses", () => {
    const draft = validateCourseDesignDraft({ ...course, knowledgeBoundary: boundary }, true);
    expect(validateCourseDesignDraft(JSON.parse(JSON.stringify(draft))).knowledgeBoundary).toEqual(boundary);
    const missing = validateCourseDesignDraft(course, true);
    expect(missing.courseDesignVersion).toBe(3);
    expect(validateCourseDesignDraft(JSON.parse(JSON.stringify(missing))).qualityGate.missing.join(" ")).toContain("knowledgeBoundary");
    expect(validateCourseDesignDraft(course).courseDesignVersion).toBeUndefined();
    expect(validateCourseDesignDraft(course).qualityGate.missing.join(" ")).not.toContain("knowledgeBoundary");
  });
  it("retains complete teaching units through concept serialization", () => {
    const original = concept("用极限描述趋近");
    expect(parseConcept(JSON.parse(JSON.stringify(original)))).toEqual(original);
  });
  it("rejects malformed contracts while allowing genuinely empty entry assumptions", () => {
    expect(parseKnowledgeBoundary({ ...boundary, assumedKnowledge: [] })?.assumedKnowledge).toEqual([]);
    expect(() => parseKnowledgeBoundary({ ...boundary, version: 2 })).toThrow();
    expect(() => parseLearningUnit({ ...unit, teachingTasks: [] })).toThrow();
    expect(() => parseLearningUnit({ ...unit, references: [{ key: "fake key", purpose: "比较" }] })).toThrow();
  });
  it("allows shared foundations and mutual comparisons without creating prerequisite edges", () => {
    const stages = [{ modules: [{ items: [
      { key: "limit", concept: concept("用极限描述趋近", [{ key: "continuity", purpose: "比较条件" }]) },
      { key: "continuity", concept: concept("用极限定义连续", [{ key: "limit", purpose: "回顾定义" }]) }
    ] }] }];
    const snapshot = structuredClone(stages);
    expect(() => validateLearningUnitOwnership(stages)).not.toThrow();
    expect(stages).toEqual(snapshot);
    stages[0].modules[0].items[1].concept.learningUnit!.newKnowledge = "用极限描述趋近";
    expect(() => validateLearningUnitOwnership(stages)).toThrow("重复承担");
  });
  it("rejects nonexistent and self references without interpreting title overlap", () => {
    for (const key of ["missing", "limit"]) expect(() => validateLearningUnitOwnership([{ modules: [{ items: [{ key: "limit", concept: concept("极限", [{ key, purpose: "回顾" }]) }] }] }])).toThrow("不存在或指向自身");
  });
});

const sharedQuestion: CourseContentQuestion = { key: "cq-limit-methods", question: "极限是什么，如何选择计算方法？", contentRequirements: ["解释趋近与取到的区别", "比较计算方法的条件", "提供一个复杂迁移例子"], dimensionKeys: ["definition", "selection", "use"] };
const contribution = (requirementIndex: number, dimensionKey: "definition" | "selection"): ContentContribution => ({ contentQuestionKey: sharedQuestion.key, requirementIndices: [requirementIndex], dimensionKeys: [dimensionKey], contribution: requirementIndex ? "比较计算方法的适用条件" : "解释极限的趋近含义" });
function sharedMap(): RoadmapInput {
  return { planningVersion: 3, contentCoverageVersion: 1, title: "极限课程", status: "draft", learningGoals: [{ key: "limit-methods", description: "理解极限并合理选择计算方法", contentQuestions: [structuredClone(sharedQuestion)] }], stages: [{
    key: "limits", title: "极限", goal: "解释极限与计算方法选择", status: "expanded", problem: { question: "如何计算一个函数极限？", steps: ["说明趋近含义", "选择合适方法"] },
    moduleBlueprints: [{ key: "limit-module", title: "极限与方法", goal: "理解极限并选择方法", keyQuestions: [{ key: "q-shared", contentQuestionKey: sharedQuestion.key, question: sharedQuestion.question, checkableOutcome: "说明概念与方法" }] }],
    modules: [{ title: "极限与方法", items: ["meaning", "choice"].map((key, index) => ({ key, title: index ? "夹逼准则" : "函数极限", keyQuestion: index ? "何时使用夹逼？" : "极限表达什么？", objective: index ? "说明夹逼的条件" : "解释趋近", planningQuestionKeys: ["q-shared"], prerequisiteKeys: [], concept: { name: index ? "夹逼准则" : "函数极限", aliases: [], scope: index ? "夹逼准则及选择" : "函数极限含义", problemRole: index ? "计算方法" : "理解趋近", learningUnit: { ...unit, version: 2, newKnowledge: index ? "夹逼准则的选择" : "函数极限的含义", contentContributions: [contribution(index, index ? "selection" : "definition")] } } })) }]
  }] };
}

describe("explicit portions of shared content questions", () => {
  it("validates two complementary nodes without requiring either to cover all dimensions or unexpanded future content", () => {
    const result = validateRoadmapInput(sharedMap());
    expect(result.stages[0].modules[0].items.map(node => node.concept?.learningUnit?.contentContributions)).toEqual([[contribution(0, "definition")], [contribution(1, "selection")]]);
    expect(result.stages[0].modules[0].items.every(node => node.prerequisiteKeys.length === 0)).toBe(true);
    expect(validateRoadmapInput(JSON.parse(JSON.stringify(result)))).toEqual(result);
  });
  it("localizes and merges confirmed portions using original requirement order and indices", () => {
    const scoped = scopedContentQuestions([sharedQuestion], [contribution(1, "selection"), contribution(0, "definition"), contribution(1, "selection")]);
    expect(scoped).toEqual([{ ...sharedQuestion, contentRequirements: sharedQuestion.contentRequirements.slice(0, 2), dimensionKeys: ["definition", "selection"], requirementIndices: [0, 1], contribution: "比较计算方法的适用条件；解释极限的趋近含义" }]);
    expect(scopedContentQuestions([sharedQuestion], [])).toEqual([]);
    expect(sharedQuestion.contentRequirements).toHaveLength(3);
  });
  it.each([
    { requirementIndices: [] }, { requirementIndices: [-1] }, { requirementIndices: [0, 0] }, { requirementIndices: [0.5] },
    { dimensionKeys: [] }, { dimensionKeys: ["constructor"] }, { dimensionKeys: ["definition", "definition"] },
    { contentQuestionKey: "not a stable key" }, { contribution: "" }
  ])("rejects malformed contribution $requirementIndices $dimensionKeys $contentQuestionKey", (override) => {
    expect(() => parseContentContributions([{ ...contribution(0, "definition"), ...override }])).toThrow();
  });
  it("rejects duplicate question entries and missing v2 contributions, while preserving readable v1", () => {
    expect(() => parseContentContributions([contribution(0, "definition"), contribution(1, "selection")])).toThrow("重复登记");
    expect(() => parseLearningUnit({ ...unit, version: 2 })).toThrow("contentContributions");
    expect(parseLearningUnit(unit)).toEqual(unit);
    expect(parseLearningUnit({ ...unit, version: 2, contentContributions: [] })?.contentContributions).toEqual([]);
  });
  it.each([
    { contentQuestionKey: "unknown-content" }, { requirementIndices: [3] }, { dimensionKeys: ["boundaries"] },
  ])("rejects a contribution outside the confirmed registry $contentQuestionKey $requirementIndices $dimensionKeys", override => {
    const candidate = sharedMap();
    Object.assign(candidate.stages![0].modules![0].items![0].concept!.learningUnit!.contentContributions![0], override);
    expect(() => validateRoadmapInput(candidate)).toThrow(/分工/);
  });
  it("requires every linked question of a v2 node to have its own portion", () => {
    const candidate = sharedMap();
    candidate.stages![0].modules![0].items![0].concept!.learningUnit!.contentContributions = [];
    expect(() => validateRoadmapInput(candidate)).toThrow("具体分工");
  });
  it("preserves explicit reuse responsibilities and rejects references to an unassigned course question", () => {
    const candidate = sharedMap();
    const stage = candidate.stages![0];
    const reference = { key: "meaning", planningQuestionKeys: ["q-shared"], problemRole: "复用极限定义", contentContributions: [contribution(0, "definition")] };
    stage.modules![0].conceptReferences = parseConceptReferences([reference]);
    expect(validateRoadmapInput(candidate).stages[0].modules[0].conceptReferences).toEqual([reference]);
    reference.planningQuestionKeys = [];
    stage.modules![0].conceptReferences = parseConceptReferences([reference]);
    expect(() => validateRoadmapInput(candidate)).toThrow("已分配");
  });
  it("requires fresh stage nodes and reuse references to carry the new contract, while reading legacy stages", () => {
    const stage = sharedMap().stages![0];
    expect(() => validateRoadmapStageDraft(stage, true)).not.toThrow();
    stage.modules![0].items![0].concept!.learningUnit = parseLearningUnit(unit);
    expect(() => validateRoadmapStageDraft(stage, true)).toThrow("version=2");
    expect(() => validateRoadmapStageDraft(stage)).not.toThrow();
    const referenced = sharedMap().stages![0];
    referenced.modules![0].conceptReferences = [{ key: "meaning", planningQuestionKeys: ["q-shared"], problemRole: "回顾" }];
    expect(() => validateRoadmapStageDraft(referenced, true)).toThrow("显式 contentContributions");
  });
});
