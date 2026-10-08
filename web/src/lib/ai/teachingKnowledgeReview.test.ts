import { describe, expect, it } from "vitest";
import { validateKnowledgeReview, validateFrameworkPatches, frameworkKnowledgeHash, reusableKnowledgeReview, materialKnowledgeTargets } from "./teachingKnowledgeReview";
import { badKnowledgeFramework, correctedKnowledgeFramework, correctKnowledgeMaterial, falseFunctionGoal, correctFunctionGoal, knowledgeContextFixture, knowledgeResult } from "./teachingKnowledge.fixture";

describe("independent teaching knowledge evidence", () => {
  it("checks each segment fact at its owning target without repeating nested activities", () => {
    const targets = materialKnowledgeTargets(correctKnowledgeMaterial);
    const step = targets.find(t=>t.key==="material:encounter-step")!.content;
    const activity = targets.find(t=>t.key==="material:compare-functions")!.content;
    expect(step).toEqual({summary:correctKnowledgeMaterial.steps[0].summary,explanation:correctKnowledgeMaterial.steps[0].explanation,example:correctKnowledgeMaterial.steps[0].example});
    expect(activity).toMatchObject({answer:correctKnowledgeMaterial.steps[0].activities[0].answer,criteria:correctKnowledgeMaterial.steps[0].activities[0].criteria,hints:correctKnowledgeMaterial.steps[0].activities[0].hints});
    expect(JSON.stringify(step)).not.toContain("activities");
    expect(JSON.stringify(targets[0].content)).not.toContain("steps");
    expect(materialKnowledgeTargets(correctKnowledgeMaterial,["encounter"])).toEqual(targets);
    expect(materialKnowledgeTargets(correctKnowledgeMaterial,["compare-functions"])).toEqual([targets.find(t=>t.key==="material:compare-functions")]);
    const stepTargets=targets.filter(t=>["material:encounter-step","material:compare-functions"].includes(t.key));
    expect(materialKnowledgeTargets(correctKnowledgeMaterial,["encounter-step"])).toEqual(stepTargets);
    expect(materialKnowledgeTargets(correctKnowledgeMaterial,["encounter-step","compare-functions"])).toEqual(stepTargets);
    const withAnotherStep=structuredClone(correctKnowledgeMaterial);
    withAnotherStep.steps.push({...structuredClone(correctKnowledgeMaterial.steps[0]),key:"other-step",activities:[{...structuredClone(correctKnowledgeMaterial.steps[0].activities[0]),key:"other-activity"}]});
    expect(materialKnowledgeTargets(withAnotherStep,["encounter-step"])).toEqual(stepTargets);
    expect(materialKnowledgeTargets(withAnotherStep,["other-activity"]).map(t=>t.key)).toEqual(["material:other-activity"]);
  });

  it("records the actual false goal and a checkable correction rather than obeying it", () => {
    const report = knowledgeResult(badKnowledgeFramework, knowledgeContextFixture, ["plan_discriminate"]);
    expect(report.checks.find(c => c.targetKey === "plan_discriminate")).toMatchObject({ verdict: "error", claimExcerpt: falseFunctionGoal, correction: correctFunctionGoal });
    expect(reusableKnowledgeReview(report, badKnowledgeFramework, knowledgeContextFixture)).toBeUndefined();
  });
  it("requires every fixed target but does not demand an error quota", () => {
    const report = knowledgeResult(correctedKnowledgeFramework);
    expect(reusableKnowledgeReview(report, correctedKnowledgeFramework, knowledgeContextFixture)).toBeDefined();
    expect(() => validateKnowledgeReview({ ...report, checks: report.checks.slice(1) }, correctedKnowledgeFramework, knowledgeContextFixture)).toThrow("不得遗漏");
    expect(() => validateKnowledgeReview({ ...report, checks: report.checks.map((c, i) => i === 1 ? report.checks[0] : c) }, correctedKnowledgeFramework, knowledgeContextFixture)).toThrow("重复");
  });
  it("restores exact original claims from bounded indices without asking the AI to concatenate quotations", () => {
    const report = knowledgeResult(badKnowledgeFramework, knowledgeContextFixture, ["plan_discriminate"]);
    const indexed = { ...report, checks: report.checks.map(c => c.targetKey === "plan_discriminate" ? { ...c, claimExcerpt: undefined, claimIndex: 2 } : c) };
    expect(validateKnowledgeReview(indexed, badKnowledgeFramework, knowledgeContextFixture).checks.find(c => c.targetKey === "plan_discriminate")?.claimExcerpt).toBe(falseFunctionGoal);
    for (const claimIndex of [-1, 3, 0.5]) expect(() => validateKnowledgeReview({ ...indexed, checks: indexed.checks.map(c => c.targetKey === "plan_discriminate" ? { ...c, claimIndex } : c) }, badKnowledgeFramework, knowledgeContextFixture)).toThrow("主张编号");
    expect(() => validateKnowledgeReview({ ...indexed, checks: indexed.checks.map(c => c.targetKey === "plan_discriminate" ? { ...c, claimExcerpt: "伪造原文" } : c) }, badKnowledgeFramework, knowledgeContextFixture)).toThrow("不匹配");
  });
  it("accepts the exact AI transport envelope without hiding invalid evidence", () => {
    const report = knowledgeResult(badKnowledgeFramework, knowledgeContextFixture, ["plan_discriminate"]);
    expect(validateKnowledgeReview({ type: "json_object", content: report }, badKnowledgeFramework, knowledgeContextFixture)).toEqual(report);
    const forged = { ...report, checks: report.checks.map(c => ({ ...c, sourceEvidence: [{ sourceId: "unknown-source", excerpt: "不存在的来源" }] })) };
    expect(() => validateKnowledgeReview({ type: "json_object", content: forged }, badKnowledgeFramework, knowledgeContextFixture)).toThrow("禁止编造");
  });
  it("accepts multiple distinct original claims in one group but still rejects omitted groups and repeated positions", () => {
    const report = knowledgeResult(correctedKnowledgeFramework);
    const extra = { ...report.checks.find(c => c.targetKey === "plan_discriminate")!, claimIndex: 0, claimExcerpt: correctedKnowledgeFramework.segments[3].goal, verdict: "arrangement", basis: "arrangement" };
    const expanded = { ...report, checks: [...report.checks, extra] };
    expect(validateKnowledgeReview(expanded, correctedKnowledgeFramework, knowledgeContextFixture).checks).toHaveLength(17);
    expect(() => validateKnowledgeReview({ ...expanded, checks: expanded.checks.filter(c => c.targetKey !== "definition") }, correctedKnowledgeFramework, knowledgeContextFixture)).toThrow("不得遗漏目标");
    expect(() => validateKnowledgeReview({ ...expanded, checks: [...expanded.checks, extra] }, correctedKnowledgeFramework, knowledgeContextFixture)).toThrow("重复核对");
  });
  it("refuses wrong evidence, ungrounded error verdicts and fabricated source quotations", () => {
    const report = knowledgeResult(badKnowledgeFramework, knowledgeContextFixture, ["plan_discriminate"]);
    const change = (patch: object) => ({ ...report, checks: report.checks.map(c => c.targetKey === "plan_discriminate" ? { ...c, ...patch } : c) });
    expect(() => validateKnowledgeReview(change({ claimExcerpt: "不存在的原文" }), badKnowledgeFramework, knowledgeContextFixture)).toThrow("实际目标");
    expect(() => validateKnowledgeReview(change({ basis: "uncertain" }), badKnowledgeFramework, knowledgeContextFixture)).toThrow("推导或实际资料");
    expect(() => validateKnowledgeReview(change({ basis: "source", sourceEvidence: [] }), badKnowledgeFramework, knowledgeContextFixture)).toThrow("目标 plan_discriminate 的 basis=source 缺少实际资料片段");
    expect(() => validateKnowledgeReview(change({ basis: "source", sourceEvidence: [{ sourceId: "fake", excerpt: "所谓教材" }] }), badKnowledgeFramework, knowledgeContextFixture)).toThrow("禁止编造");
    expect(() => validateKnowledgeReview(change({ correction: falseFunctionGoal }), badKnowledgeFramework, knowledgeContextFixture)).toThrow("正确结论");
  });
  it("labels source uncertainty without a false error claim and binds cache to current data", () => {
    const report = knowledgeResult(correctedKnowledgeFramework);
    const uncertain = { ...report, checks: report.checks.map(c => c.targetKey === "definition" ? { ...c, verdict: "uncertain", basis: "uncertain", reasoning: "当前依据不足，待核对。" } : c) };
    expect(validateKnowledgeReview(uncertain, correctedKnowledgeFramework, knowledgeContextFixture).checks[0].verdict).toBe("uncertain");
    const changed = { ...knowledgeContextFixture, node: { ...knowledgeContextFixture.node, scope: "不同范围" } };
    expect(frameworkKnowledgeHash(correctedKnowledgeFramework, changed)).not.toBe(report.frameworkHash);
    expect(reusableKnowledgeReview(report, correctedKnowledgeFramework, changed)).toBeUndefined();
  });
});

describe("targeted framework factual patches", () => {
  const review = knowledgeResult(badKnowledgeFramework, knowledgeContextFixture, ["plan_discriminate"]);
  const patch = { patches: [{ targetKey: "plan_discriminate", value: { goal: badKnowledgeFramework.segments[3].goal, steps: [{ key: "discriminate-step", goal: correctFunctionGoal }] }, findingKeys: ["plan_discriminate"], reason: "修正同一函数被当成不同函数的错误，不改变安排。" }] };
  it("fixes the originating goal while preserving all other data and original version", () => {
    const result = validateFrameworkPatches(patch, badKnowledgeFramework, review);
    expect(result.framework).toEqual(correctedKnowledgeFramework);
    expect(result.patches[0]).toMatchObject({ targetKey: "plan_discriminate", findingKeys: ["plan_discriminate"] });
    expect(badKnowledgeFramework.segments[3].steps[0].goal).toBe(falseFunctionGoal);
  });
  it("preserves confirmed content assignments when correcting a factual step goal", () => {
    const baseline = structuredClone(badKnowledgeFramework);
    baseline.contentQuestions = [{ key: "shared", question: "共同问题", contentRequirements: ["辨别边界"], requirementIndices: [1], dimensionKeys: ["definition"], contribution: "本课负责边界" }];
    baseline.segments.forEach(segment => segment.steps.forEach(step => { step.contentAssignments = []; }));
    baseline.segments[3].steps[0].contentAssignments = [{ contentQuestionKey: "shared", dimensionKeys: ["definition"] }];
    const result = validateFrameworkPatches(patch, baseline, review);
    expect(result.framework.segments[3].steps[0].contentAssignments).toEqual(baseline.segments[3].steps[0].contentAssignments);
  });
  it("cannot change node scope, step IDs, unrelated targets, or silently skip the error", () => {
    const edit = (p: object) => ({ patches: [{ ...patch.patches[0], ...p }] });
    expect(() => validateFrameworkPatches(edit({ targetKey: "scope", value: "扩充课程" }), badKnowledgeFramework, review)).toThrow("有效目标");
    expect(() => validateFrameworkPatches(edit({ value: { ...patch.patches[0].value, steps: [{ key: "new-step", goal: correctFunctionGoal }] } }), badKnowledgeFramework, review)).toThrow("身份与顺序");
    expect(() => validateFrameworkPatches(edit({ findingKeys: ["made-up"] }), badKnowledgeFramework, review)).toThrow("实际错误");
    expect(() => validateFrameworkPatches(edit({ value: { goal: badKnowledgeFramework.segments[3].goal, steps: badKnowledgeFramework.segments[3].steps } }), badKnowledgeFramework, review)).toThrow("没有改变");
  });
});
