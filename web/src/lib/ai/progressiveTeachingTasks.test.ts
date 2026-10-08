import { beforeEach, describe, expect, it, vi } from "vitest";
import { prepareProgressiveTeaching } from "./progressiveTeachingTasks";
import { runJsonTask } from "./tutorService";
import { AiTaskValidationError } from "./validationEvidence";
import { validateTeachingContentReview, teachingReviewRules } from "./teachingReviewPolicy";
import { dimensions, segmentKeys, validateFramework, validateMaterial, NodeTeachingError, type TeachingContextV2 } from "../learning/teachingContracts";
import { FrameworkKnowledgeError, materialKnowledgeTargets } from "./teachingKnowledgeReview";
import { badKnowledgeFramework, correctedKnowledgeFramework, correctKnowledgeMaterial, correctFunctionGoal, knowledgeContextFixture, knowledgeResult } from "./teachingKnowledge.fixture";
import { teachingReviewTargets } from "./teachingReviewPolicy";

vi.mock("./tutorService", () => ({ runJsonTask: vi.fn() }));
const dimensionKeys = Object.keys(dimensions);
const framework = validateFramework({
  concept: "函数", scope: "一元实值函数", definition: "每个输入唯一对应一个输出。",
  runningCase: "在 x 不等于 2 和 -2 时可以约分。", prerequisitePlan: [], prerequisites: ["高中代数"], limitations: [],
  dimensions: dimensionKeys.map(key => ({ key, points: ["计划讲解"], segmentKeys: key === "definition" ? segmentKeys : ["concept"] })),
  segments: segmentKeys.map(key => ({ key, goal: "安排本段", dimensionKeys: key === "concept" ? dimensionKeys : ["definition"], steps: [{ key: `${key}-step`, goal: "讲解并示范" }] }))
});

const context: TeachingContextV2 = {
  domain: { goal: "理解函数" }, node: { title: "函数", objective: "认识研究对象", keyQuestion: "函数是什么", scope: "一元", aliases: [], problemRole: "对象", commonMistake: "只比较表达式" },
  stage: { title: "预备", goal: "固定对象", moduleTitle: "函数", outcomes: [], problem: "比较两个函数", process: [] },
  prerequisites: [], sources: [], warnings: ["来源待核对"]
};
const passing = (warnings: unknown[] = []) => ({ reviewPolicyVersion: 1, summary: "可以继续", blockingIssues: [], warnings, limitation: "来源待核对，不是权威验证。" });
const blocked = () => ({ ...passing(), blockingIssues: [{ code: "criticalCoverageGap", targetKey: "definition", message: "缺少当前核心内容", suggestion: "补齐当前定义内容", evidence: { draftExcerpt: framework.definition, requirement: "本课需要解释输入唯一对应输出", impact: "当前概念的核心内容无法学习" } }] });
const ordinaryCalls = () => vi.mocked(runJsonTask).mock.calls.filter(([input]) => input.taskType !== "node_knowledge_check");

function defaultKnowledge(prompt: string) {
  const targets = JSON.parse(prompt.split("Knowledge targets data:")[1]) as { key: string; content: unknown }[];
  const firstText = (v: unknown): string => typeof v === "string" ? v : Array.isArray(v) ? firstText(v[0]) : firstText(Object.values(v as object)[0]);
  return { knowledgeVersion: 1, summary: "未发现明确错误", limitation: "仅为测试核对结果", checks: targets.map(t => ({ targetKey: t.key, claimExcerpt: firstText(t.content), reasoning: "按本测试提供的概念条件核对。", verdict: "supported", basis: "derivation", correction: "", impact: "", sourceEvidence: [] })) };
}

function responses(values: unknown[]) {
  vi.mocked(runJsonTask).mockImplementation(async input => {
    const value = input.taskType === "node_knowledge_check" ? defaultKnowledge(input.userPrompt) : values.shift();
    if (value instanceof Error) throw value;
    const data = input.validate(value);
    const id = `${input.taskType}-${vi.mocked(runJsonTask).mock.calls.length}`;
    return { data, log: { id }, aiCallLogIds: [id], aiRunId: id, researchSources: [] } as never;
  });
}
describe("serious teaching review", () => {
  beforeEach(() => vi.resetAllMocks());

  it("allows more than eight advisories without consuming material repairs", async () => {
    const warnings = Array.from({ length: 12 }, (_, i) => ({ code: "wording", targetKey: "framework", message: `建议${i}`, suggestion: "可选改善" }));
    responses([framework, passing(warnings)]);
    const result = await prepareProgressiveTeaching({ domainId: "d", nodeId: "n", context });
    expect(result.review.status).toBe("passed");
    expect(result.review.warnings).toHaveLength(12);
    expect(result.callIds).toHaveLength(3);
    expect(vi.mocked(runJsonTask).mock.calls.map(([input]) => input.taskType)).toEqual(["node_lesson_preparation", "node_knowledge_check", "node_lesson_review"]);
    expect(ordinaryCalls()[1][0].userPrompt).toContain("NOT the full lesson");
  });

  it("rejects a falsely quoted blocker and a legacy fresh report", () => {
    const report = blocked();
    report.blockingIssues[0].evidence.draftExcerpt = "每个输入对应两个输出";
    expect(() => validateTeachingContentReview(report, framework)).toThrow("原文证据");
    expect(() => validateTeachingContentReview({ findings: [], limitation: "" }, framework)).toThrow("reviewPolicyVersion");
  });

  it("does not regenerate valid material when the report remains malformed", async () => {
    const failure = Object.assign(new AiTaskValidationError("报告字段缺失"), { aiCallLogIds: ["review-invalid", "review-retry-invalid"] });
    responses([framework, failure]);
    const checkpoint = vi.fn();
    await expect(prepareProgressiveTeaching({ domainId: "d", nodeId: "n", context, checkpoint })).rejects.toThrow("报告字段缺失");
    expect(ordinaryCalls()).toHaveLength(2);
    expect(checkpoint.mock.lastCall?.[0]).toEqual(["node_lesson_preparation-1", "node_knowledge_check-2", "review-invalid", "review-retry-invalid"]);
    expect(checkpoint.mock.lastCall?.[1]).toEqual(framework);
  });

  it("stops an ineffective serious-defect repair and retains both reviews", async () => {
    responses([framework, blocked(), framework, blocked()]);
    const checkpoint = vi.fn();
    await expect(prepareProgressiveTeaching({ domainId: "d", nodeId: "n", context, checkpoint })).rejects.toThrow("没有解决原重大缺陷");
    expect(ordinaryCalls()).toHaveLength(4);
    expect(checkpoint.mock.lastCall?.[0]).toHaveLength(6);
    expect(ordinaryCalls()[2][0].userPrompt).toContain('"draftExcerpt"');
  });

  it("repairs an actual blocker before making the candidate available", async () => {
    const revised = { ...framework, definition: "修正后的稳定定义" };
    responses([framework, blocked(), revised, passing()]);
    const result = await prepareProgressiveTeaching({ domainId: "d", nodeId: "n", context });
    expect(result.data).toMatchObject({ definition: revised.definition });
    expect(result.review.blockingIssues).toEqual([]);
    expect(result.callIds).toHaveLength(6);
  });

  it("does not claim completion after two materially different unresolved repairs", async () => {
    responses([framework, blocked(), { ...framework, scope: "范围2" }, blocked(), { ...framework, scope: "范围3" }, blocked()]);
    await expect(prepareProgressiveTeaching({ domainId: "d", nodeId: "n", context })).rejects.toThrow("修复两次后仍未完成");
    expect(ordinaryCalls()).toHaveLength(6);
  });

  it("keeps review instructions within the fixed teaching scope", () => {
    expect(teachingReviewRules).toContain("excluded points are not in a set difference");
    expect(teachingReviewRules).toContain("later concepts as newly compulsory prerequisites");
    expect(teachingReviewRules).toContain("Never promote previous warnings to blockers");
  });

  it("limits segment generation to the exact current steps and sends precise repair diagnostics", async () => {
    const failure = Object.assign(new NodeTeachingError("只允许 encounter-step"), { issues: [{ code: "segment_step_mismatch", path: "steps", message: "只允许 encounter-step", actualReferenceKeys: ["encounter-step", "use-step"], allowedReferenceKeys: ["encounter-step"] }], aiCallLogIds: ["invalid-segment"] });
    responses([failure, failure]);
    await expect(prepareProgressiveTeaching({ domainId: "d", nodeId: "n", context, framework, segmentKey: "encounter" })).rejects.toThrow("未改变原结构错误");
    const prompt = ordinaryCalls()[0][0].userPrompt;
    expect(prompt).toContain('steps must contain exactly these keys in this order: ["encounter-step"]');
    expect(prompt).not.toContain('"key":"use-step"');
    expect(ordinaryCalls()[1][0].userPrompt).toContain('"allowedReferenceKeys":["encounter-step"]');
    expect(ordinaryCalls()).toHaveLength(2);
  });
});

function sequence(values: { task: string; value: unknown }[]) {
  vi.mocked(runJsonTask).mockImplementation(async input => {
    const next = values.shift();
    expect(input.taskType).toBe(next?.task);
    if (next!.value instanceof Error) throw next!.value;
    return { data: input.validate(next!.value), aiCallLogIds: [`log-${vi.mocked(runJsonTask).mock.calls.length}`] } as never;
  });
}

describe("framework knowledge correction", () => {
  beforeEach(() => vi.resetAllMocks());
  const scope = { domainId: "d", nodeId: "n", context: knowledgeContextFixture };

  it("checks a concrete material concern before general review and repairs the confirmed fact error", async () => {
    const wrong = structuredClone(correctKnowledgeMaterial);
    wrong.steps[0].explanation = "这两个函数不同。";
    const targets = (material: typeof wrong) => materialKnowledgeTargets(material);
    sequence([
      {task:"node_knowledge_check",value:knowledgeResult(correctedKnowledgeFramework,knowledgeContextFixture,["material:encounter-step"],targets(wrong))},
      {task:"node_lesson_repair",value:correctKnowledgeMaterial},
      {task:"node_knowledge_check",value:knowledgeResult(correctedKnowledgeFramework,knowledgeContextFixture,[],targets(correctKnowledgeMaterial))},
      {task:"node_lesson_review",value:passing()}
    ]);
    const result = await prepareProgressiveTeaching({...scope,framework:correctedKnowledgeFramework,frameworkKnowledge:knowledgeResult(correctedKnowledgeFramework),segmentKey:"encounter",resumeMaterial:wrong,concern:"原式在所有允许输入上是否相等？"});
    expect(result.data).toEqual(validateMaterial(correctKnowledgeMaterial,correctedKnowledgeFramework,"encounter",[]));
    expect(result.review.reusedMaterial).toBeUndefined();
    expect(vi.mocked(runJsonTask).mock.calls[0][0].userPrompt).toContain("原式在所有允许输入上是否相等");
    expect(vi.mocked(runJsonTask).mock.calls[1][0].userPrompt).toContain("material");
  });

  it("checks embedded false conclusions before arrangement review and repairs them", async () => {
    const freshBad={...badKnowledgeFramework,prerequisitePlan:[]}; const freshCorrect={...correctedKnowledgeFramework,prerequisitePlan:[]};
    sequence([{ task: "node_lesson_preparation", value: freshBad },
      { task: "node_knowledge_check", value: knowledgeResult(badKnowledgeFramework, knowledgeContextFixture, ["plan_discriminate"]) },
      { task: "node_lesson_repair", value: freshCorrect },
      { task: "node_knowledge_check", value: knowledgeResult(correctedKnowledgeFramework) },
      { task: "node_lesson_review", value: passing() }]);
    const checkpoint = vi.fn();
    const result = await prepareProgressiveTeaching({ ...scope, checkpoint });
    expect(result.data).toEqual(freshCorrect);
    expect(result.review.blockingIssues).toEqual([]);
    expect(checkpoint.mock.calls.some(c => c[2]?.knowledgeReview?.checks.some((f: { verdict: string }) => f.verdict === "error"))).toBe(true);
  });

  it("pauses an old erroneous framework before generating a segment", async () => {
    sequence([{ task: "node_knowledge_check", value: knowledgeResult(badKnowledgeFramework, knowledgeContextFixture, ["plan_discriminate"]) }]);
    await expect(prepareProgressiveTeaching({ ...scope, framework: badKnowledgeFramework, segmentKey: "encounter" })).rejects.toBeInstanceOf(FrameworkKnowledgeError);
    expect(runJsonTask).toHaveBeenCalledTimes(1);
  });

  it("returns a false upstream conclusion for framework correction while preserving the correct answer", async () => {
    const falseGoal = badKnowledgeFramework.segments[3].steps[0].goal;
    sequence([{ task: "node_segment_preparation", value: correctKnowledgeMaterial },
      { task: "node_lesson_review", value: { ...passing(), blockingIssues: [{ code: "coreKnowledgeError", targetKey: "framework:plan_discriminate", message: "框架结论与本段冲突", suggestion: "重新核对", evidence: { draftExcerpt: falseGoal, requirement: "判断函数相等", impact: "影响核心结论" } }] } },
      { task: "node_knowledge_check", value: knowledgeResult(badKnowledgeFramework, knowledgeContextFixture, ["plan_discriminate"]) }]);
    const operation = prepareProgressiveTeaching({ ...scope, framework: badKnowledgeFramework, frameworkKnowledge: knowledgeResult(badKnowledgeFramework), segmentKey: "encounter" });
    await expect(operation).rejects.toMatchObject({ candidate: validateMaterial(correctKnowledgeMaterial, badKnowledgeFramework, "encounter", []), knowledge: { checks: expect.arrayContaining([expect.objectContaining({ targetKey: "plan_discriminate", verdict: "error" })]) } });
    expect(runJsonTask).toHaveBeenCalledTimes(3);
  });

  it("retracts an unsupported factual blocker without rewriting a correct answer", async () => {
    const target = teachingReviewTargets(correctKnowledgeMaterial).find(t => t.key === "compare-functions")!;
    sequence([{ task: "node_segment_preparation", value: correctKnowledgeMaterial },
      { task: "node_lesson_review", value: { ...passing(), blockingIssues: [{ code: "coreKnowledgeError", targetKey: target.key, message: "误判为不同函数", suggestion: "改为不同函数", evidence: { draftExcerpt: correctFunctionGoal, requirement: "核对函数", impact: "核心判定错误" } }] } },
      { task: "node_knowledge_check", value: knowledgeResult(correctedKnowledgeFramework, knowledgeContextFixture, [], materialKnowledgeTargets(correctKnowledgeMaterial,[target.key])) }]);
    const result = await prepareProgressiveTeaching({ ...scope, framework: correctedKnowledgeFramework, frameworkKnowledge: knowledgeResult(correctedKnowledgeFramework), segmentKey: "encounter" });
    expect(result.data).toEqual(validateMaterial(correctKnowledgeMaterial, correctedKnowledgeFramework, "encounter", []));
    expect(result.review.retractedFindings).toHaveLength(1);
    expect(result.review.blockingIssues).toEqual([]);
  });

  it("patches only the factual goal and rechecks it, then reuses correct material", async () => {
    const value = { goal: badKnowledgeFramework.segments[3].goal, steps: [{ key: "discriminate-step", goal: correctFunctionGoal }] };
    sequence([{ task: "node_framework_correction", value: { patches: [{ targetKey: "plan_discriminate", value, findingKeys: ["plan_discriminate"], reason: "按原式判断定义域与取值。" }] } },
      { task: "node_knowledge_check", value: knowledgeResult(correctedKnowledgeFramework) },
      { task: "node_lesson_review", value: passing() }]);
    const result = await prepareProgressiveTeaching({ ...scope, frameworkCorrection: { baseline: badKnowledgeFramework, knowledge: knowledgeResult(badKnowledgeFramework, knowledgeContextFixture, ["plan_discriminate"]) } });
    expect(result.data).toEqual(correctedKnowledgeFramework);
    expect(result.review.frameworkPatches).toHaveLength(1);
    sequence([{ task: "node_lesson_review", value: passing() }]);
    const reused = await prepareProgressiveTeaching({ ...scope, framework: correctedKnowledgeFramework, frameworkKnowledge: knowledgeResult(correctedKnowledgeFramework), segmentKey: "encounter", resumeMaterial: correctKnowledgeMaterial, resumeCallIds: ["original-material-call"] });
    expect(reused.review.reusedMaterial).toBe(true);
    expect(reused.callIds).toContain("original-material-call");
  });

  it("retains material when knowledge-report formatting fails instead of rewriting it", async () => {
    const error = Object.assign(new AiTaskValidationError("知识核对缺目标"), { aiCallLogIds: ["invalid-knowledge-call"] });
    const freshBad={...badKnowledgeFramework,prerequisitePlan:[]};
    sequence([{ task: "node_lesson_preparation", value: freshBad }, { task: "node_knowledge_check", value: error }]);
    const checkpoint = vi.fn();
    await expect(prepareProgressiveTeaching({ ...scope, checkpoint })).rejects.toThrow("知识核对缺目标");
    expect(checkpoint.mock.lastCall?.[1]).toEqual(freshBad);
    expect(checkpoint.mock.lastCall?.[0]).toContain("invalid-knowledge-call");
    expect(runJsonTask).toHaveBeenCalledTimes(2);
  });
});
