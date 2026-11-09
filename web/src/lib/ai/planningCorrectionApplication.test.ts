import { describe, expect, it } from "vitest";
import { resolveContentCoverage } from "../learning/conceptPlanning";
import { AiTaskValidationError } from "./validationEvidence";
import {
  applyValidatedPlanningKnowledgeCorrections,
  assertPlanningKnowledgeErrorsAddressed,
  planningContentProjectionSources,
  planningKnowledgeDigest,
  validatePlanningKnowledgeReview,
  type PlanningKnowledgeFinding
} from "./planningKnowledgeReview";

const oldRule = "旧的条件说明";
const newRule = "修正后的条件说明";
const registry = "learningGoals[0].contentQuestions[0]";
const blueprint = "stages[0].moduleBlueprints[0].keyQuestions[0]";
const localTask = "stages[0].modules[0].items[0].concept.learningUnit.teachingTasks[0]";

function draft() {
  return {
    contentCoverageVersion: 1,
    learningGoals: [{
      key: "goal", description: "理解使用条件",
      contentQuestions: [{ key: "content", question: oldRule, contentRequirements: [oldRule, "比较一个例子"], dimensionKeys: [] }]
    }],
    stages: [{
      key: "stage", goalKeys: ["goal"], goal: "按已有范围学习",
      moduleBlueprints: [{ key: "module", goalKeys: ["goal"], keyQuestions: [{
        key: "question", contentQuestionKey: "content", question: oldRule,
        contentRequirements: [oldRule, "比较一个例子"], checkableOutcome: `${oldRule}；比较一个例子`
      }] }],
      modules: [{ items: [{ key: "node", prerequisiteKeys: ["earlier-node"], concept: { learningUnit: { teachingTasks: [oldRule] } } }] }]
    }]
  };
}

type Draft = ReturnType<typeof draft>;
const finding = (path: string, quote = oldRule, replacement = newRule): PlanningKnowledgeFinding => ({ path, quote, replacement, reason: "更正实际引用的文字。" });

function review(candidate: Draft, findings: PlanningKnowledgeFinding[]) {
  return validatePlanningKnowledgeReview({
    summary: "记录明确错误及其对应位置。", limitations: ["此测试只验证更正保存，不证明文字的教学质量。"], findings,
    claims: findings.map((item, index) => ({
      key: `claim-${index}`, path: item.path, quote: item.quote, conclusion: "待更正的条件表述。",
      premises: [], applicability: [], verdict: "confirmed_error",
      basis: { kind: "derivation", fragmentIds: [], reason: "测试夹具中的明确更正依据。" }, reason: item.reason
    }))
  }, candidate, []);
}

function project(value: unknown): Draft {
  const result = structuredClone(value as Draft);
  resolveContentCoverage(result);
  return result;
}

describe("planning corrections survive the real content projection", () => {
  it("rejects the whole batch when three projected corrections vanish but one local correction survives", () => {
    const original = draft(), before = planningKnowledgeDigest(original);
    const report = review(original, [
      finding(`${blueprint}.question`), finding(`${blueprint}.contentRequirements[0]`),
      finding(`${blueprint}.checkableOutcome`), finding(localTask)
    ]);
    expect(() => applyValidatedPlanningKnowledgeCorrections(report, original, project)).toThrow(AiTaskValidationError);
    expect(planningKnowledgeDigest(original)).toBe(before);
    expect(original.stages[0].modules[0].items[0].concept.learningUnit.teachingTasks[0]).toBe(oldRule);
    expect(report.findings).toHaveLength(4);
    expect(report.verdict).toBe("confirmed_error");
  });

  it("preserves genuine registry corrections and their deterministic projections", () => {
    const original = draft();
    const result = applyValidatedPlanningKnowledgeCorrections(review(original, [
      finding(`${registry}.question`), finding(`${registry}.contentRequirements[0]`), finding(localTask)
    ]), original, project);
    expect(result.learningGoals[0].contentQuestions[0].question).toBe(newRule);
    expect(result.stages[0].moduleBlueprints[0].keyQuestions[0]).toMatchObject({
      question: newRule, contentRequirements: [newRule, "比较一个例子"], checkableOutcome: `${newRule}；比较一个例子`
    });
    expect(result.stages[0].modules[0].items[0].concept.learningUnit.teachingTasks).toEqual([newRule]);
    expect(result.stages[0].modules[0].items[0].prerequisiteKeys).toEqual(["earlier-node"]);
    expect(original.learningGoals[0].contentQuestions[0].question).toBe(oldRule);
  });

  it("accepts separately evidenced owner and projected corrections when they agree", () => {
    const original = draft();
    const result = applyValidatedPlanningKnowledgeCorrections(review(original, [
      finding(`${registry}.contentRequirements[0]`), finding(`${blueprint}.contentRequirements[0]`), finding(`${blueprint}.checkableOutcome`)
    ]), original, project);
    expect(result.stages[0].moduleBlueprints[0].keyQuestions[0].checkableOutcome).toBe(`${newRule}；比较一个例子`);
  });

  it("rejects conflicting corrections at the owner and projected copy without choosing a winner", () => {
    const original = draft();
    const report = review(original, [
      finding(`${registry}.question`), finding(`${blueprint}.question`, oldRule, "另一种有冲突的条件说明")
    ]);
    expect(() => applyValidatedPlanningKnowledgeCorrections(report, original, project)).toThrow(AiTaskValidationError);
    expect(original.learningGoals[0].contentQuestions[0].question).toBe(oldRule);
  });

  it("does not treat identical local node text as an instruction to change its registry owner", () => {
    const original = draft();
    const result = applyValidatedPlanningKnowledgeCorrections(review(original, [finding(localTask)]), original, project);
    expect(result.stages[0].modules[0].items[0].concept.learningUnit.teachingTasks[0]).toBe(newRule);
    expect(result.learningGoals[0].contentQuestions[0].contentRequirements[0]).toBe(oldRule);
    expect(result.stages[0].moduleBlueprints[0].keyQuestions[0].contentRequirements[0]).toBe(oldRule);
  });

  it("retains an independent expected copy when the structural validator mutates its argument", () => {
    const original = draft();
    const report = review(original, [finding(`${blueprint}.question`)]);
    expect(() => applyValidatedPlanningKnowledgeCorrections(report, original, value => {
      resolveContentCoverage(value as Draft);
      return value as Draft;
    })).toThrow(AiTaskValidationError);
    expect(original.stages[0].moduleBlueprints[0].keyQuestions[0].question).toBe(oldRule);
  });

  it("compares the complete final field after multiple disjoint edits", () => {
    const original = draft();
    original.stages[0].goal = "先用旧条件，再看旧结论。";
    const report = review(original, [
      finding("stages[0].goal", "旧条件", "新的适用条件"),
      finding("stages[0].goal", "旧结论", "修正结论")
    ]);
    expect(applyValidatedPlanningKnowledgeCorrections(report, original, project).stages[0].goal).toBe("先用新的适用条件，再看修正结论。");
    expect(() => applyValidatedPlanningKnowledgeCorrections(report, original, value => {
      const result = project(value);
      result.stages[0].goal = "先用新的适用条件，再看旧结论。附注：修正结论";
      return result;
    })).toThrow(AiTaskValidationError);
  });

  it("allows the existing structural trim without allowing altered wording", () => {
    const original = draft();
    const report = review(original, [finding("stages[0].goal", original.stages[0].goal, "  更正后的阶段目标  ")]);
    const result = applyValidatedPlanningKnowledgeCorrections(report, original, value => {
      const normalized = project(value);
      normalized.stages[0].goal = normalized.stages[0].goal.trim();
      return normalized;
    });
    expect(result.stages[0].goal).toBe("更正后的阶段目标");
  });

  it("rejects a corrected field removed during validation", () => {
    const original = draft();
    expect(() => applyValidatedPlanningKnowledgeCorrections(review(original, [finding(localTask)]), original, value => {
      const normalized = project(value);
      normalized.stages[0].modules[0].items[0].concept.learningUnit.teachingTasks = [];
      return normalized;
    })).toThrow(AiTaskValidationError);
    expect(original.stages[0].modules[0].items[0].concept.learningUnit.teachingTasks).toEqual([oldRule]);
  });

  it("keeps stale-digest and structural failure boundaries", () => {
    const original = draft(), report = review(original, [finding(localTask)]);
    const changed = draft(); changed.stages[0].goal = "用户已经修改目标";
    expect(() => applyValidatedPlanningKnowledgeCorrections(report, changed, project)).toThrow("另一版本");
    const structureError = new Error("invalid existing structure");
    expect(() => applyValidatedPlanningKnowledgeCorrections(report, original, () => { throw structureError; })).toThrow(structureError);
    expect(original.stages[0].modules[0].items[0].concept.learningUnit.teachingTasks).toEqual([oldRule]);
  });
});

describe("planning projection source diagnostics", () => {
  it("identifies question, each requirement and joined outcome through real registry references", () => {
    const sources = planningContentProjectionSources(draft());
    expect(sources).toEqual(expect.arrayContaining([
      { path: `${blueprint}.question`, sourcePaths: [`${registry}.question`] },
      { path: `${blueprint}.contentRequirements[0]`, sourcePaths: [`${registry}.contentRequirements[0]`] },
      { path: `${blueprint}.contentRequirements[1]`, sourcePaths: [`${registry}.contentRequirements[1]`] },
      { path: `${blueprint}.checkableOutcome`, sourcePaths: [`${registry}.contentRequirements[0]`, `${registry}.contentRequirements[1]`] }
    ]));
    expect(sources.some(item => item.path === localTask)).toBe(false);
  });

  it("uses the referenced identity even when another registry entry has identical text", () => {
    const candidate = draft();
    candidate.learningGoals[0].contentQuestions.unshift({ ...candidate.learningGoals[0].contentQuestions[0], key: "unrelated" });
    expect(planningContentProjectionSources(candidate)).toContainEqual({
      path: `${blueprint}.question`, sourcePaths: ["learningGoals[0].contentQuestions[1].question"]
    });
  });

  it("does not guess an owner from matching text when the reference is missing", () => {
    const candidate = draft();
    candidate.stages[0].moduleBlueprints[0].keyQuestions[0].contentQuestionKey = "missing-content";
    expect(planningContentProjectionSources(candidate)).toEqual([]);
    expect(planningContentProjectionSources(candidate.stages[0])).toEqual([]);
    expect(planningContentProjectionSources({ stages: candidate.stages })).toEqual([]);
  });

  it("does not advertise an ambiguous registry identity as a unique source", () => {
    const candidate = draft();
    candidate.learningGoals[0].contentQuestions.push({ ...candidate.learningGoals[0].contentQuestions[0] });
    expect(planningContentProjectionSources(candidate)).toEqual([]);
  });
});

describe("previous planning errors require final correction evidence", () => {
  it("accepts owner-only findings after their final projections fully resolve earlier copy findings", () => {
    const original = draft();
    const previous = review(original, [
      finding(`${blueprint}.question`), finding(`${blueprint}.contentRequirements[0]`), finding(`${blueprint}.checkableOutcome`)
    ]);
    const next = review(original, [finding(`${registry}.question`), finding(`${registry}.contentRequirements[0]`)]);
    const after = applyValidatedPlanningKnowledgeCorrections(next, original, project);
    expect(() => assertPlanningKnowledgeErrorsAddressed(previous, next, { before: original, after })).not.toThrow();
    expect(previous.findings).toHaveLength(3);
    expect(next.findings).toHaveLength(2);
  });

  it("does not accept a source relationship or an unapplied owner correction as resolution", () => {
    const original = draft();
    const previous = review(original, [finding(`${blueprint}.question`)]);
    const next = review(original, [finding(`${registry}.question`)]);
    expect(() => assertPlanningKnowledgeErrorsAddressed(previous, next)).toThrow(AiTaskValidationError);
    expect(() => assertPlanningKnowledgeErrorsAddressed(previous, next, { before: original, after: original })).toThrow(AiTaskValidationError);
  });

  it("rejects a surviving owner change that yields a different result at the previously reported copy", () => {
    const original = draft();
    const previous = review(original, [finding(`${blueprint}.question`)]);
    const next = review(original, [finding(`${registry}.question`, oldRule, "与原更正要求不同的条件说明")]);
    const after = applyValidatedPlanningKnowledgeCorrections(next, original, project);
    expect(after.stages[0].moduleBlueprints[0].keyQuestions[0].question).not.toBe(oldRule);
    expect(() => assertPlanningKnowledgeErrorsAddressed(previous, next, { before: original, after })).toThrow(AiTaskValidationError);
  });

  it("cannot replace a known error with a no-error opinion while the original candidate is unchanged", () => {
    const original = draft();
    const previous = review(original, [finding(`${blueprint}.question`)]);
    const next = validatePlanningKnowledgeReview({
      summary: "本轮意见变为无错，但候选未变。", limitations: ["没有执行更正。"], findings: [],
      claims: previous.claims.map(claim => ({ ...claim, verdict: "no_error_found" }))
    }, original, []);
    expect(next.verdict).toBe("no_error_found");
    expect(() => assertPlanningKnowledgeErrorsAddressed(previous, next)).toThrow(AiTaskValidationError);
    expect(() => assertPlanningKnowledgeErrorsAddressed(previous, next, { before: original, after: original })).toThrow(AiTaskValidationError);
  });
});
