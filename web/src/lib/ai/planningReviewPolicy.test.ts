import { describe, expect, it } from "vitest";
import { validateCriticalPlanningReport, validateContentRevisions, criticalPlanningTargets } from "./planningReviewPolicy";
import { validateRoadmapSkeletonDraft, validateRoadmapSkeletonCritique, buildRoadmapSkeletonRepairPrompt, buildRoadmapStagePrompt, type CourseDesignDraft } from "./tasks";
import { validateMapDraftQualityRepair } from "./mapDraftRepair";
import { roadmapSkeletonToDraft, validateRoadmapInput } from "../learning/roadmapService";

const goals = [{ key: "goal-1", description: "学习极限计算。", contentQuestions: [{
  key: "content-5", question: "如何选择极限计算方法？", contentRequirements: ["介绍方法选择与适用条件。"],
  dimensionKeys: ["use" as const, "boundaries" as const]
}] }];
const policyPassed = { reviewPolicyVersion: 1, summary: "未发现严重缺陷，保留建议。", blockingIssues: [], warnings: [] };

it("locates invalid warning fields so report repair preserves the advice without rewriting material", () => {
  for (const warning of ["已披露资料缺口", { category: "sourceGap", message: "已披露资料缺口" }]) {
    expect(() => validateCriticalPlanningReport({ ...policyPassed, warnings: [warning] }, skeleton())).toThrow("report.warnings[0] 必须是包含非空 code 和 message");
  }
});
function skeleton() {
  return validateRoadmapSkeletonDraft({ planningVersion: 3, contentCoverageVersion: 1, title: "极限课程", status: "draft", learningGoals: structuredClone(goals), stages: [{
    key: "stage-limit", title: "极限方法", goal: "选择方法。", coreTopics: ["极限计算"], prerequisiteStageKeys: [], prerequisiteStageTitles: [],
    problem: { question: "如何求一个极限？", steps: ["识别形式", "选择方法"] },
    moduleBlueprints: [{ key: "module-limit", title: "方法选择", goal: "介绍方法选择。", keyQuestions: [{ key: "question-5", contentQuestionKey: "content-5" }] }]
  }] });
}

describe("serious planning review contract", () => {
  it("gives Stage generation actual prior teaching and permits co-teaching without conflicting split instructions",()=>{
    const draft=skeleton();
    const prompt=buildRoadmapStagePrompt({domain:{name:"微积分"},skeleton:draft,stage:draft.stages[0],stageIndex:0,knownConcepts:[{key:"prior",title:"极限性质",concept:{scope:"实际只讲四则运算",learningUnit:{teachingTasks:["解释分母极限非零这一条件"]}}}]});
    expect(prompt).toContain("解释分母极限非零这一条件");
    expect(prompt).toContain("Related concepts, principles or methods MAY be taught together");
    expect(prompt).toContain("actual scope and teachingTasks");
    expect(prompt).not.toMatch(/must not combine independent concepts|teaches exactly one concept|Split by independently definable/);
  });
  const serious = { code: "coreKnowledgeError", targetKey: "content-5", message: "核心条件存在明确错误。", suggestion: "修正条件。", evidence: {
    draftExcerpt: "介绍方法选择与适用条件。", requirement: "按任务范围正确说明使用条件。", impact: "错误条件会导致核心计算方法误用。"
  } };
  it("passes with advisory improvements without invoking a stricter syllabus", () => {
    const report = validateCriticalPlanningReport({ ...policyPassed, warnings: [{ code: "moduleBoundary", targetKey: "content-5", message: "可以明确两处的分工。" }] }, skeleton());
    expect(report.status).toBe("passed");
    expect(report.warnings).toHaveLength(1);
  });
  it("retains evidence and blocks a supported serious category", () => {
    const report = validateCriticalPlanningReport({ ...policyPassed, blockingIssues: [serious] }, skeleton());
    expect(report).toMatchObject({ status: "blocked", blockingIssues: [{ evidence: serious.evidence }] });
  });
  it("restores indexed evidence from the correct target and rejects invented or conflicting positions", () => {
    const draft = skeleton();
    const entry = criticalPlanningTargets(draft).find(t=>t.targetKey === "content-5")!.excerpts.find(e=>e.text === serious.evidence.draftExcerpt)!;
    const indexed = { ...serious, evidence: { requirement: serious.evidence.requirement, impact: serious.evidence.impact, draftExcerptIndex: entry.index } };
    expect(validateCriticalPlanningReport({ ...policyPassed, blockingIssues: [indexed] }, draft).blockingIssues[0].evidence?.draftExcerpt).toBe(serious.evidence.draftExcerpt);
    expect(()=>validateCriticalPlanningReport({ ...policyPassed, blockingIssues: [{...indexed, evidence:{...indexed.evidence,draftExcerptIndex:999}}] }, draft)).toThrow("原文编号");
    expect(()=>validateCriticalPlanningReport({ ...policyPassed, blockingIssues: [{...indexed, evidence:{...indexed.evidence,draftExcerpt:"别的原文"}}] }, draft)).toThrow("原文编号");
  });
  it("does not let a later reuse record erase the concept's original evidence", () => {
    const draft = { nodes:[{key:"concept",scope:"实际需要核对的核心说明"}], references:[{key:"concept",problemRole:"后来复用的用途"}] };
    const report = validateCriticalPlanningReport({...policyPassed,blockingIssues:[{...serious,targetKey:"concept",evidence:{...serious.evidence,draftExcerpt:"实际需要核对的核心说明"}}]},draft);
    expect(report.status).toBe("blocked");
    expect(criticalPlanningTargets(draft).find(t=>t.targetKey==="concept")!.excerpts.map(e=>e.text)).toContain("实际需要核对的核心说明");
  });
  it("rejects a minor improvement presented as a blocker rather than silently passing it", () => {
    expect(() => validateCriticalPlanningReport({ ...policyPassed, blockingIssues: [{ ...serious, code: "checkability" }] }, skeleton())).toThrow("一般改进请放入 warnings");
  });
  it.each([
    { ...serious, evidence: undefined },
    { ...serious, targetKey: "not-in-this-draft" },
    { ...serious, evidence: { ...serious.evidence, draftExcerpt: "模型编造的原文" } }
  ])("rejects missing, misplaced or fabricated review evidence", finding => {
    expect(() => validateCriticalPlanningReport({ ...policyPassed, blockingIssues: [finding] }, skeleton())).toThrow();
  });
  it("never treats a missing or legacy AI report as a fresh passing review", () => {
    expect(() => validateCriticalPlanningReport({ summary: "声称通过" }, skeleton())).toThrow();
    expect(() => validateCriticalPlanningReport({ ...policyPassed, reviewPolicyVersion: undefined }, skeleton())).toThrow();
  });
});

describe("content planning revisions preserve course intent", () => {
  it("accepts the actual blocker pattern: adding a division-of-responsibility sentence", () => {
    const original = skeleton(); const revised = structuredClone(original);
    revised.learningGoals![0].contentQuestions![0].contentRequirements.push("洛必达法则的完整条件由专门概念讲解，此处只作方法选择比较。");
    const mapping = [{ previousQuestionKey: "content-5", revisedQuestionKeys: ["content-5"], reason: "保留方法与条件要求，补充分工，避免重复展开。" }];
    const result = validateRoadmapSkeletonCritique({ report: policyPassed, draft: revised, contentRevisions: mapping }, original);
    expect(result.report.status).toBe("passed");
    expect(result.draft.learningGoals![0].contentQuestions![0].contentRequirements).toHaveLength(2);
    expect(result.report.contentRevisions![0]).toMatchObject({ before: goals[0].contentQuestions[0], after: [revised.learningGoals![0].contentQuestions![0]] });
    expect(original.learningGoals![0].contentQuestions![0].contentRequirements).toHaveLength(1);
    expect(result.draft.stages[0].moduleBlueprints![0].keyQuestions[0].contentRequirements).toHaveLength(2);
  });
  it("retains a explained registry change during persisted global repair", () => {
    const original = validateRoadmapInput(roadmapSkeletonToDraft(skeleton(), 0));
    const revised = structuredClone(original);
    revised.learningGoals![0].contentQuestions![0].contentRequirements.push("明确后续专门概念的分工。");
    const result = validateMapDraftQualityRepair({ report: policyPassed, draft: revised, contentRevisions: [{ previousQuestionKey: "content-5", revisedQuestionKeys: ["content-5"], reason: "原内容继续承接，补充分工。" }] }, original, { criticalPolicy: true });
    expect(result.draft.learningGoals).toEqual(revised.learningGoals);
    expect(result.report.contentRevisions).toHaveLength(1);
  });
  it("rejects an unexplained change and any rewrite of the course goal", () => {
    const revised = structuredClone(goals); revised[0].contentQuestions[0].contentRequirements.push("补充内容。");
    expect(() => validateContentRevisions(goals, revised, [])).toThrow("不能默默丢弃要求");
    revised[0].description = "改为学习其他领域。";
    expect(() => validateContentRevisions(goals, revised, [])).toThrow("保留课程总目标");
  });
  it("supports splits while requiring valid replacements and retained teaching dimensions", () => {
    const revised = structuredClone(goals);
    revised[0].contentQuestions = [{ ...goals[0].contentQuestions[0], key: "choice", dimensionKeys: ["use"] }, { ...goals[0].contentQuestions[0], key: "condition", dimensionKeys: ["boundaries"] }];
    const changes = [{ previousQuestionKey: "content-5", revisedQuestionKeys: ["choice", "condition"], reason: "方法与条件分开承接，原内容均保留。" }];
    expect(validateContentRevisions(goals, revised, changes)).toHaveLength(1);
    expect(() => validateContentRevisions(goals, revised, [{ ...changes[0], revisedQuestionKeys: ["choice"] }])).toThrow("保留原内容要求的教学维度");
    expect(() => validateContentRevisions(goals, revised, [{ ...changes[0], revisedQuestionKeys: ["missing"] }])).toThrow("有效且非空的承接问题");
  });
  it("requires an existing-task reason for new independent content", () => {
    const revised = structuredClone(goals); revised[0].contentQuestions.push({ ...goals[0].contentQuestions[0], key: "new-required" });
    expect(() => validateContentRevisions(goals, revised, [])).toThrow("新增内容问题必须解释");
    const audit = validateContentRevisions(goals, revised, [{ previousQuestionKey: null, revisedQuestionKeys: ["new-required"], reason: "补足原任务要求但初稿遗漏的内容。" }]);
    expect(audit[0].before).toBeNull();
  });
  it("tells repair to preserve goals while permitting explained content revisions", () => {
    const direction = { taskBriefSnapshot: "学习极限。", globalExplanation: { theorySkeleton: "极限", sourceBasis: "资料不足已标注。", optimizationRationale: "入门", risksAndValidation: "核对" }, sources: [], keyTradeoffs: [], qualityGate: { passed: true, missing: [] } } as CourseDesignDraft;
    const prompt = buildRoadmapSkeletonRepairPrompt({ domain: { name: "微积分" }, courseDesign: direction, skeleton: skeleton(), previousReport: { ...policyPassed, reviewPolicyVersion: 1, status: "passed" } });
    expect(prompt).toContain("Fix ONLY supported serious blockers");
    expect(prompt).toContain("contentRevisions");
    expect(prompt).not.toContain("Copy the learningGoals/contentQuestions registry verbatim");
  });
});
