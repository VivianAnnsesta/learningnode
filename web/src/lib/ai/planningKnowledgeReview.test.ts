import { describe, expect, it } from "vitest";
import {
  applyPlanningKnowledgeCorrections,
  buildPlanningKnowledgePrompt,
  buildPlanningKnowledgeRepairPrompt,
  createUncertainPlanningKnowledgeReview,
  GENERATED_PLANNING_MAX_CLAIMS,
  planningKnowledgeDigest,
  validateGeneratedPlanningKnowledgeReview,
  validatePlanningKnowledgeReview,
  type PlanningKnowledgeClaim,
  type PlanningKnowledgeFinding
} from "./planningKnowledgeReview";

const originalRule = "内层极限存在、外层在对应点连续或极限存在即可使用复合极限法则。";
const correctedRule = "内层极限存在且外层在对应点连续时可使用；只用外层去心极限时还需内层在充分小的去心邻域不取该极限值，并满足定义域和趋近方式条件。";
const upstreamPath = "learningGoals[0].contentQuestions[0].contentRequirements[0]";
const taskPath = "stages[0].modules[0].items[0].concept.learningUnit.teachingTasks[0]";
const source = { id: "fragment-real", text: "连续时有复合函数极限代入规则；仅有外层去心极限时，应确保内层在逼近过程中避开该点。", title: "实际资料片段" };
function draft() {
  return {
    goal: "用户希望学习一元微积分。",
    baseRevision: 3,
    learningGoals: [{ key: "goal-limit", description: "学习极限方法。", contentQuestions: [{ key: "cq-composition", question: "复合极限在什么条件下成立？", contentRequirements: [originalRule] }] }],
    stages: [{ key: "stage-limit", goal: "解释极限法则。", rationale: "按当前入门目标选择顺序。", prerequisiteStageKeys: [], problem: { question: "如何选择计算方法？", steps: ["检查条件"] },
      moduleBlueprints: [{ key: "module-rules", goal: "理解计算法则。", keyQuestions: [{ key: "question-rule", contentQuestionKey: "cq-composition", question: "复合极限在什么条件下成立？", contentRequirements: [originalRule] }] }],
      modules: [{ goal: "说明复合极限条件。", items: [{ key: "node-rule", prerequisiteKeys: ["node-definition"], objective: "正确使用法则。", concept: { scope: "复合极限条件", learningUnit: { newKnowledge: originalRule, teachingTasks: [originalRule], example: "检验一个复合极限", references: [] } } }] }]
    }]
  };
}
function claim(path = upstreamPath, overrides: Partial<PlanningKnowledgeClaim> = {}): PlanningKnowledgeClaim {
  return {
    key: "claim-rule", path, quote: originalRule, conclusion: "只要内层及外层极限存在就能计算复合极限。", premises: ["内层极限存在", "外层极限存在"], applicability: ["需要检查趋近方式及定义域"],
    verdict: "confirmed_error", basis: { kind: "derivation", fragmentIds: [], reason: "取内层恒为0，外层去心值为1但点值为2，复合值恒为2，外层去心极限为1，因此原条件不充分。" },
    reason: "原主张把外层去心极限存在与该点连续混为充分条件。", counterexample: "g(x)=0；F(t)=1(t≠0)，F(0)=2。两个极限存在，但复合函数极限为2。", ...overrides
  };
}
function finding(path = upstreamPath, overrides: Partial<PlanningKnowledgeFinding> = {}): PlanningKnowledgeFinding {
  return { path, quote: originalRule, replacement: correctedRule, reason: "补齐实际必要的趋近条件，不增加课程深度。", ...overrides };
}
function report(claims = [claim()], findings = [finding()]) {
  return { summary: "发现实际必要条件遗漏，给出反例和局部更正。", limitations: ["模型核对不表示权威证明。"], claims, findings };
}

describe("independent planning knowledge evidence", () => {
  it("binds the actual condition error and independently checkable counterexample", () => {
    const review = validatePlanningKnowledgeReview(report(), draft(), []);
    expect(review.verdict).toBe("confirmed_error");
    expect(review.claims[0].counterexample).toContain("F(0)=2");
    expect(review.claims[0].premises).toEqual(["内层极限存在", "外层极限存在"]);
    expect(review.draftDigest).toBe(planningKnowledgeDigest(draft()));
  });

  it("corrects every explicitly located upstream occurrence without changing identity or DAG", () => {
    const candidate = draft();
    const review = validatePlanningKnowledgeReview(report([claim(), claim(taskPath, { key: "claim-task" })], [finding(), finding(taskPath)]), candidate, []);
    const corrected = applyPlanningKnowledgeCorrections(review, candidate);
    expect(corrected.learningGoals[0].contentQuestions[0].contentRequirements[0]).toBe(correctedRule);
    expect(corrected.stages[0].modules[0].items[0].concept.learningUnit.teachingTasks[0]).toBe(correctedRule);
    expect(corrected.goal).toBe(candidate.goal);
    expect(corrected.learningGoals[0].description).toBe(candidate.learningGoals[0].description);
    expect(corrected.stages[0].modules[0].items[0].prerequisiteKeys).toEqual(["node-definition"]);
    expect(corrected.baseRevision).toBe(3);
    expect(candidate.learningGoals[0].contentQuestions[0].contentRequirements[0]).toBe(originalRule);
  });

  it("rejects a real quote attached to the wrong or missing path", () => {
    expect(() => validatePlanningKnowledgeReview(report([claim("stages[0].rationale")]), draft(), [])).toThrow("精确引用");
    expect(() => validatePlanningKnowledgeReview(report([claim("stages[99].goal")]), draft(), [])).toThrow("不属于当前草稿");
    expect(() => validatePlanningKnowledgeReview(report([claim(upstreamPath, { quote: "把模型编造的条件作为原文" })]), draft(), [])).toThrow("精确引用");
  });

  it("accepts only actual nonempty material IDs and records their snapshot digest", () => {
    const sourceClaim = claim(upstreamPath, { basis: { kind: "source", fragmentIds: [source.id], reason: "取得的正文明确区分连续与去心极限，并说明避开该点。" } });
    expect(validatePlanningKnowledgeReview(report([sourceClaim]), draft(), [source]).materialsDigest).toBe(planningKnowledgeDigest([source]));
    expect(() => validatePlanningKnowledgeReview(report([sourceClaim]), draft(), [])).toThrow("实际取得");
    expect(() => validatePlanningKnowledgeReview(report([sourceClaim]), draft(), [{ ...source, text: "" }])).toThrow("实际取得");
    expect(() => validatePlanningKnowledgeReview(report([sourceClaim]), draft(), [{ ...source, id: "different" }])).toThrow("实际取得");
    expect(() => validatePlanningKnowledgeReview(report([claim(upstreamPath, { basis: { kind: "source", fragmentIds: [], reason: "只有标题，没有正文" } })]), draft(), [])).toThrow("实际正文");
  });

  it.each([
    ["stages[0].key", "stage-limit"],
    ["stages[0].modules[0].items[0].key", "node-rule"],
    ["stages[0].modules[0].items[0].prerequisiteKeys[0]", "node-definition"],
    ["goal", "用户希望学习一元微积分。"],
    ["learningGoals[0].description", "学习极限方法。"],
    ["learningGoals[0].contentQuestions[0].key", "cq-composition"],
    ["__proto__.polluted", "anything"]
  ])("protects identity, dependencies, learner intent and prototype at %s", (path, quote) => {
    expect(() => validatePlanningKnowledgeReview(report([claim(path, { quote })], [finding(path, { quote, replacement: "另一个内容" })]), draft(), [])).toThrow();
  });

  it("normalizes optional JSON-root prefixes without weakening exact references", () => {
    const review = validatePlanningKnowledgeReview(report([claim(`$.${upstreamPath}`)], [finding(`$.${upstreamPath}`)]), draft(), []);
    expect(review.claims[0].path).toBe(upstreamPath);
    expect(applyPlanningKnowledgeCorrections(review, draft()).learningGoals[0].contentQuestions[0].contentRequirements[0]).toBe(correctedRule);
  });

  it("rejects unchanged, ambiguous, overlapping or unsupported replacements", () => {
    for (const replacement of [originalRule, ` ${originalRule} `]) {
      expect(() => validatePlanningKnowledgeReview(report([claim()], [finding(upstreamPath, { replacement })]), draft(), [])).toThrow("没有实际变化");
    }
    const repeated = draft(); repeated.stages[0].rationale = "理由。理由。";
    expect(() => validatePlanningKnowledgeReview(report([claim("stages[0].rationale", { quote: "理由。" })], [finding("stages[0].rationale", { quote: "理由。", replacement: "更正。" })]), repeated, [])).toThrow("唯一更正位置");
    expect(() => validatePlanningKnowledgeReview(report([claim()], [finding(), finding()]), draft(), [])).toThrow("重复或重叠");
    expect(() => validatePlanningKnowledgeReview(report([claim()], [finding(taskPath)]), draft(), [])).toThrow("同一路径");
    expect(() => validatePlanningKnowledgeReview(report([claim()], []), draft(), [])).toThrow("必须给出");
    const cancel = draft(); cancel.stages[0].rationale = "abcd";
    expect(() => validatePlanningKnowledgeReview(report([
      claim("stages[0].rationale", { key: "left", quote: "ab" }), claim("stages[0].rationale", { key: "right", quote: "cd" })
    ], [finding("stages[0].rationale", { quote: "ab", replacement: "a" }), finding("stages[0].rationale", { quote: "cd", replacement: "bcd" })]), cancel, [])).toThrow("合并后没有实际变化");
  });

  it("uses uncertainty for missing evidence and cannot fabricate passed from an empty review", () => {
    const unverified = claim(upstreamPath, { verdict: "uncertain", basis: { kind: "unverified", fragmentIds: [], reason: "来源正文未取得，尚无独立推导。" } });
    expect(validatePlanningKnowledgeReview(report([unverified], []), draft(), []).verdict).toBe("uncertain");
    expect(validatePlanningKnowledgeReview({ ...report([], []), verdict: "passed" }, draft(), []).verdict).toBe("uncertain");
    expect(() => validatePlanningKnowledgeReview({ summary: "passed" }, draft(), [])).toThrow("不能只返回 passed");
    expect(() => validatePlanningKnowledgeReview(report([{ ...unverified, verdict: "no_error_found" }], []), draft(), [])).toThrow("只能记录 uncertain");
  });

  it("derives the overall verdict from all claim checks and never from generated status", () => {
    const checked = claim(upstreamPath, { verdict: "no_error_found", basis: { kind: "source", fragmentIds: [source.id], reason: "这份实际片段提供此处条件。" } });
    const uncertain = { ...checked, key: "uncertain-one", verdict: "uncertain" as const, reason: "片段未覆盖所有趋近方式。" };
    expect(validatePlanningKnowledgeReview({ ...report([checked], []), verdict: "confirmed_error" }, draft(), [source]).verdict).toBe("no_error_found");
    expect(validatePlanningKnowledgeReview(report([checked, uncertain], []), draft(), [source]).verdict).toBe("uncertain");
    expect(validatePlanningKnowledgeReview(report([checked, claim(upstreamPath, { key: "error" })]), draft(), [source]).verdict).toBe("confirmed_error");
  });

  it("refuses stale corrections and preserves stable canonical digests", () => {
    const candidate = draft(), review = validatePlanningKnowledgeReview(report(), candidate, []);
    candidate.stages[0].goal = "另一次规划。";
    expect(() => applyPlanningKnowledgeCorrections(review, candidate)).toThrow("另一版本");
    expect(planningKnowledgeDigest({ a: 1, b: { x: 2, y: 3 } })).toBe(planningKnowledgeDigest({ b: { y: 3, x: 2 }, a: 1 }));
    expect(planningKnowledgeDigest({ a: [1, 2] })).not.toBe(planningKnowledgeDigest({ a: [2, 1] }));
  });

  it("builds an audit prompt from actual text without requiring a generated claims registry", () => {
    const prompt = buildPlanningKnowledgePrompt({ draft: draft(), materials: [source], learner: { statedFoundation: "高中函数与代数", provenance: "用户原文" }, scope: "stage", stageKey: "stage-limit" });
    expect(prompt).toContain(upstreamPath);
    expect(prompt).toContain(taskPath);
    expect(prompt).toContain(source.text);
    expect(prompt).toContain("必要条件应主动尝试反例或推导");
    expect(prompt).toContain("同时纠正所有受影响上游文字");
    expect(prompt).toContain("结构校验、取得来源正文与知识正确性是三种证据");
    expect(prompt).not.toContain('"path":"goal"');
  });

  it("bounds oversized requests instead of silently cutting away candidate evidence", () => {
    expect(() => buildPlanningKnowledgePrompt({ draft: { globalExplanation: { sourceBasis: "a".repeat(180001) } }, materials: [], learner: {}, scope: "course" })).toThrow("有界知识核对输入");
  });

  it("states implication direction and tests counterexamples against the actual quantified claim", () => {
    const candidate = { learningGoals: [{ key: "goal-recovery", contentQuestions: [{ key: "question-rollback", question: "何时允许回滚？", contentRequirements: ["回滚资格的必要条件包括已有可恢复备份。"] }] }] };
    const prompt = buildPlanningKnowledgePrompt({ draft: candidate, materials: [], learner: {}, scope: "course" });
    expect(prompt).toContain(candidate.learningGoals[0].contentQuestions[0].contentRequirements[0]);
    expect(prompt).toContain("B是A的必要条件");
    expect(prompt).toContain("即A⇒B，不是无条件B");
    expect(prompt).toContain("原文没有另写“如果”不构成条件遗漏");
    expect(prompt).toContain("量词、操作对象与范围");
    expect(prompt).toContain("若仅否定逆命题、更强命题或另一个操作方向，不能据此报confirmed_error");
  });

  it("preserves parent and registered optional scope for complete tasks at each real text location", () => {
    const task = "完整执行恢复演练并记录结果。";
    const candidate = {
      learningGoals: [{ key: "goal-recovery", contentQuestions: [{ key: "question-optional", importance: "optional", question: "是否尝试恢复演练？", contentRequirements: [task] }] }],
      stages: [{ key: "stage-optional", goal: "选学恢复演练", goalKeys: ["goal-recovery"], prerequisiteStageKeys: [], problem: { question: task, steps: ["按演练要求执行并记录"] }, moduleBlueprints: [{ key: "module-optional", importance: "optional", goal: "完成选学演练", keyQuestions: [{ key: "question-local", contentQuestionKey: "question-optional", question: task }] }] }]
    };
    const before = JSON.stringify(candidate);
    const prompt = buildPlanningKnowledgePrompt({ draft: candidate, materials: [], learner: {}, scope: "skeleton" });
    expect(prompt.split(task)).toHaveLength(2);
    expect(prompt).toContain('"path":"learningGoals[0].contentQuestions[0].importance","value":"optional"');
    expect(prompt).toContain('"path":"stages[0].moduleBlueprints[0].keyQuestions[0].contentQuestionKey","value":"question-optional"');
    expect(prompt).toContain("stages[0].problem.question");
    expect(prompt).toContain("用户选择选学后可以要求完整活动，单句没有重复“选学”不构成必修矛盾");
    expect(prompt).toContain("只有实际主线任务、依赖或完成要求强制了原选学内容");
    expect(prompt).toContain("不能仅凭选学标签免除这种真实冲突");
    expect(prompt).toContain("不表示各位置继承相同范围或前提");
    expect(JSON.stringify(candidate)).toBe(before);
  });

  it("separates material support from independent reasoning without promoting user text to authority", () => {
    const material = { id: "user-note", text: "我希望先体验一次演练。", location: "user_text:0" };
    const candidate = { globalExplanation: { sourceBasis: "从实际备份和恢复步骤分析演练结果。" } };
    const prompt = buildPlanningKnowledgePrompt({ draft: candidate, materials: [material], learner: { goal: "学习恢复" }, scope: "course" });
    expect(prompt).toContain(material.text);
    expect(prompt).toContain("source必须指出片段中对应当前命题、前提和适用条件的文字及支持范围");
    expect(prompt).toContain("主题相近就认为它支持另一条结论");
    expect(prompt).toContain("不使其成为公开权威核验");
    expect(prompt).toContain("独立计算、证明或比对的内容用derivation");
    expect(prompt).toContain("不能引用不相干材料装饰证明");
    expect(prompt).toContain("片段未支持的部分不能冒称来源已经核实");
  });

  it("corrects generated course boundary text without touching the learner's original brief", () => {
    const candidate = { knowledgeBoundary: { version: 1, newKnowledge: [originalRule], assumedKnowledge: ["基础尚待核对"] }, taskBriefSnapshot: "学习者原话" };
    const path = "knowledgeBoundary.newKnowledge[0]";
    const review = validatePlanningKnowledgeReview(report([claim(path)], [{ path, quote: originalRule, replacement: correctedRule, reason: "遗漏必要条件" }]), candidate, []);
    const corrected = applyPlanningKnowledgeCorrections(review, candidate);
    expect(corrected.knowledgeBoundary.newKnowledge).toEqual([correctedRule]);
    expect(corrected.taskBriefSnapshot).toBe(candidate.taskBriefSnapshot);
  });

  it("keeps failed-check evidence explicitly uncertain and excludes self-rating metadata from the check", () => {
    const candidate = { globalExplanation: { sourceBasis: "没有取得公开正文" }, qualityGate: { passed: true }, qualityReport: { summary: "SELF_RATING_IS_NOT_KNOWLEDGE" } };
    const missing = createUncertainPlanningKnowledgeReview(candidate, [source], "核对没有完成", ["failed-log"]);
    expect(missing.verdict).toBe("uncertain");
    expect(missing.claims).toEqual([]);
    expect(missing.aiCallLogIds).toEqual(["failed-log"]);
    const prompt = buildPlanningKnowledgePrompt({ draft: candidate, materials: [source], learner: {}, scope: "course" });
    expect(prompt).not.toContain("SELF_RATING_IS_NOT_KNOWLEDGE");
    expect(prompt).toContain("没有更正也必须显式返回findings:[]");
  });

  it("treats an empty optional counterexample as absent without inferring evidence or success", () => {
    const item = claim(upstreamPath, { verdict: "uncertain", basis: { kind: "unverified", fragmentIds: [], reason: "没有核对依据" }, counterexample: "" });
    const result = validatePlanningKnowledgeReview(report([item], []), draft(), []);
    expect(result.verdict).toBe("uncertain");
    expect(result.claims[0].counterexample).toBeUndefined();
    expect(() => validatePlanningKnowledgeReview(report([item], [{ path: upstreamPath, quote: originalRule, replacement: correctedRule, reason: "没有确定错误" }]), draft(), [])).toThrow();
  });
});

describe("planning knowledge scope priorities", () => {
  const sharedCondition = "恢复前必须确认备份覆盖实际记录。";
  const registryPath = "learningGoals[0].contentQuestions[0].contentRequirements[0]";
  const targetNodePath = "stages[1].modules[0].items[0].concept.learningUnit.newKnowledge";
  const candidate = () => ({
    learningGoals: [{ key: "goal-recovery", contentQuestions: [{ key: "cq-recovery", question: "如何核对恢复条件？", contentRequirements: [sharedCondition] }] }],
    stages: [
      { key: "stage-other", goal: "此前已展开的任务", modules: [{ items: [{ concept: { learningUnit: { newKnowledge: sharedCondition, example: "此前的例子。" } } }] }] },
      { key: "stage-current", goal: "本次展开的恢复任务", moduleBlueprints: [{ goal: "原规划职责" }], modules: [{ items: [{
        objective: "核对实际恢复结果。", prerequisite: "已经取得待恢复的记录。",
        concept: { learningUnit: { newKnowledge: sharedCondition, example: "本次实际例子：备份中有三条记录，恢复后逐条比对。", teachingTasks: [sharedCondition, "说明当前恢复条件不满足时的结果。"] } }
      }] }] }
    ]
  });
  function catalog(prompt: string): { path: string; text: string; alsoAt?: string[] }[] {
    const section = prompt.slice(prompt.indexOf("实际候选可核对的教学文本（"), prompt.indexOf("\n候选身份、任务责任及依赖信息"));
    return JSON.parse(section.slice(section.indexOf("）：") + 2));
  }

  it("puts the actual selected stage's new facts and examples before other nodes and old registry", () => {
    const prompt = buildPlanningKnowledgePrompt({ draft: candidate(), materials: [], learner: {}, scope: "map", stageKey: "stage-current" });
    const entries = catalog(prompt);
    expect(entries[0].path).toBe(targetNodePath);
    expect(entries[1].path).toBe("stages[1].modules[0].items[0].concept.learningUnit.example");
    expect(entries.findIndex(entry => entry.path.startsWith("stages[0]."))).toBeGreaterThan(entries.findIndex(entry => entry.path === "stages[1].modules[0].items[0].concept.learningUnit.teachingTasks[1]"));
    expect(prompt).toContain("本次指定阶段的真实教学路径为 stages[1].");
    expect(prompt).toContain("不能只重查全局登记或骨架蓝图就声称新节点已经核对");
    expect(prompt).toContain("limitations须明确尚未覆盖的当前新节点、例子及条件的真实路径或范围");
    expect(prompt).toContain("不能仅列远期选学内容来代替本次缺口");
    expect(prompt).toContain("claims 严格最多 12 项");
  });

  it("deduplicates after scope ranking so matching registry text cannot swallow the target path", () => {
    const prompt = buildPlanningKnowledgePrompt({ draft: candidate(), materials: [], learner: {}, scope: "stage", stageKey: "stage-current" });
    const matching = catalog(prompt).filter(entry => entry.text === sharedCondition);
    expect(matching).toHaveLength(1);
    expect(matching[0].path).toBe(targetNodePath);
    expect(matching[0].alsoAt).toEqual(expect.arrayContaining([
      "stages[1].modules[0].items[0].concept.learningUnit.teachingTasks[0]",
      "stages[0].modules[0].items[0].concept.learningUnit.newKnowledge", registryPath
    ]));
    expect(prompt.split(sharedCondition)).toHaveLength(2);
    expect(prompt).toContain("确实发现错误传播到登记时仍须按原引用规则说明双方路径并局部更正");
  });

  it("uses real unchanged paths and keeps the actual candidate digest while changing prompt order only", () => {
    const actual = candidate(), before = JSON.stringify(actual), digest = planningKnowledgeDigest(actual);
    const entries = catalog(buildPlanningKnowledgePrompt({ draft: actual, materials: [], learner: {}, scope: "stage", stageKey: "stage-current" }));
    for (const entry of entries) {
      for (const location of [entry.path, ...(entry.alsoAt || [])]) {
        const parts = [...location.matchAll(/([A-Za-z_][A-Za-z0-9_]*)|\[([0-9]+)\]/g)].map(match => match[1] ?? Number(match[2]));
        const value = parts.reduce<unknown>((current, part) => (current as Record<string | number, unknown>)[part], actual);
        expect(value).toBe(entry.text);
      }
    }
    expect(JSON.stringify(actual)).toBe(before);
    expect(planningKnowledgeDigest(actual)).toBe(digest);
    const checked = validatePlanningKnowledgeReview(report([claim(targetNodePath, {
      quote: sharedCondition, conclusion: "恢复前需确认实际覆盖。", verdict: "uncertain",
      basis: { kind: "unverified", fragmentIds: [], reason: "尚未取得该恢复例子的独立核对依据。" }
    })], []), actual, []);
    expect(checked.claims[0].path).toBe(targetNodePath);
    expect(checked.draftDigest).toBe(digest);
  });

  it("prioritizes representative actual nodes for a whole-map review without inventing a target stage", () => {
    const prompt = buildPlanningKnowledgePrompt({ draft: candidate(), materials: [], learner: {}, scope: "map" });
    expect(catalog(prompt)[0].path).toBe("stages[0].modules[0].items[0].concept.learningUnit.newKnowledge");
    expect(prompt).toContain("已有展开节点时优先其结论、条件、例子与任务");
    expect(prompt).not.toContain("本次指定阶段的真实教学路径为");
    expect(prompt).toContain("目录排序是选择提示，不是逐字段核对清单");
  });

  it("retains root stage paths when checking an actual stage object", () => {
    const stage = candidate().stages[1];
    const prompt = buildPlanningKnowledgePrompt({ draft: stage, materials: [], learner: {}, scope: "stage", stageKey: stage.key });
    expect(catalog(prompt)[0].path).toBe("modules[0].items[0].concept.learningUnit.newKnowledge");
    expect(prompt).toContain("本次指定阶段的真实教学路径为 根阶段对象");
    expect(prompt).not.toContain('"path":"stages[1].modules');
  });
});

describe("bounded new planning knowledge reports", () => {
  const unchecked = (index = 0, path = upstreamPath) => claim(path, {
    key: `unchecked-${index}`, conclusion: `尚待核对的独立责任 ${index}`,
    verdict: "uncertain", basis: { kind: "unverified", fragmentIds: [], reason: "没有完成这项独立知识核对。" }
  });

  it("enforces twelve for new model output while retaining the historical fifteen-claim contract", () => {
    const candidate = draft(), before = planningKnowledgeDigest(candidate);
    const historic = report(Array.from({ length: 15 }, (_, index) => unchecked(index)), []);
    const original = JSON.stringify(historic);
    const read = validatePlanningKnowledgeReview(historic, candidate, []);
    expect(read.claims).toHaveLength(15);
    expect(read.draftDigest).toBe(before);
    expect(JSON.stringify(historic)).toBe(original);
    expect(() => validateGeneratedPlanningKnowledgeReview(historic, candidate, [])).toThrow("最多 12 条");
    expect(validateGeneratedPlanningKnowledgeReview(report(historic.claims.slice(0, GENERATED_PLANNING_MAX_CLAIMS), []), candidate, []).claims).toHaveLength(12);
    expect(planningKnowledgeDigest(candidate)).toBe(before);
  });

  it("rejects repeating harmless responsibilities across paths without changing legacy reading", () => {
    const duplicate = [unchecked(), { ...unchecked(1, taskPath), conclusion: unchecked().conclusion }];
    expect(validatePlanningKnowledgeReview(report(duplicate, []), draft(), []).claims).toHaveLength(2);
    expect(() => validateGeneratedPlanningKnowledgeReview(report(duplicate, []), draft(), [])).toThrow("重复规划责任只核对一次");
  });

  it("keeps each error propagation location explicit and preserves the same-path correction guard", () => {
    const located = report([claim(), claim(taskPath, { key: "claim-task" })], [finding(), finding(taskPath)]);
    const review = validateGeneratedPlanningKnowledgeReview(located, draft(), []);
    expect(review.claims).toHaveLength(2);
    expect(applyPlanningKnowledgeCorrections(review, draft()).stages[0].modules[0].items[0].concept.learningUnit.teachingTasks[0]).toBe(correctedRule);
    expect(() => validateGeneratedPlanningKnowledgeReview(report([claim()], [finding(), finding(taskPath)]), draft(), [])).toThrow("同一路径");
  });

  it("bounds quotes and the entire response and requires an explicit uncovered-scope limitation", () => {
    const candidate = draft(); candidate.stages[0].rationale = "a".repeat(321);
    expect(() => validateGeneratedPlanningKnowledgeReview(report([{ ...unchecked(0, "stages[0].rationale"), quote: candidate.stages[0].rationale }], []), candidate, [])).toThrow("最多 320 字符");
    expect(() => validateGeneratedPlanningKnowledgeReview({ ...report([unchecked()], []), padding: "a".repeat(18000) }, draft(), [])).toThrow("最多 18000 字符");
    expect(() => validateGeneratedPlanningKnowledgeReview({ ...report([unchecked()], []), limitations: [] }, draft(), [])).toThrow("未覆盖范围");
  });

  it("deduplicates actual text catalogs and requires concrete reasoning rather than checking every duty", () => {
    const prompt = buildPlanningKnowledgePrompt({ draft: draft(), materials: [], learner: {}, scope: "skeleton" });
    expect(prompt.split(originalRule)).toHaveLength(2);
    expect(prompt).toContain('"alsoAt":[');
    expect(prompt).toContain(taskPath);
    expect(prompt).toContain("claims 严格最多 12 项");
    expect(prompt).not.toContain("claims 最多 64");
    expect(prompt).toContain("不能只声称“独立推导支持”");
    expect(prompt).toContain("反例必须满足被反驳命题的全部前提");
    expect(prompt).toContain("待教计划未展开全部细节本身不是知识错误");
  });

  it("restarts a truncated report from bounded complete objections and never copies its partial tail", () => {
    const first = { ...claim(), reason: '引号中的 } 和 \\" 不是对象结尾。' };
    const raw = `{"summary":"范围尚待核对","claims":[${JSON.stringify(first)},{"key":"partial","reason":"INCOMPLETE_TAIL_DO_NOT_COPY`;
    const prompt = buildPlanningKnowledgeRepairPrompt({ originalPrompt: "ACTUAL_TASK", rawOutput: raw, parsedCandidate: undefined, aiCallLogId: "actual-failed-call", issues: [{ code: "output_truncated", path: "$", message: "finish_reason=length" }] });
    expect(prompt).toContain("finish_reason=length/max_output_tokens");
    expect(prompt).toContain("禁止续写、修补截断尾巴");
    expect(prompt).toContain('"completeClaimObjects":1');
    expect(prompt).toContain('"unvalidatedObjectionCount":1');
    expect(prompt).toContain(first.counterexample);
    expect(prompt).toContain("actual-failed-call");
    expect(prompt).not.toContain("INCOMPLETE_TAIL_DO_NOT_COPY");
    expect(prompt).not.toContain(JSON.stringify(raw));
    expect(prompt).toContain("尚未通过合同的旧confirmed_error或findings只是待核对的指控");
  });

  it("uses the exact saved small response for syntax or missing-field repair", () => {
    const { findings: _findings, ...incomplete } = report([unchecked()], []);
    const raw = JSON.stringify({ ...incomplete, savedMarker: "actual-saved-response" });
    const parsed = JSON.parse(raw);
    const prompt = buildPlanningKnowledgeRepairPrompt({ originalPrompt: "ACTUAL_TASK", rawOutput: raw, parsedCandidate: parsed, issues: [{ code: "invalid_planning_knowledge_review", path: "findings", message: "findings is required" }] });
    expect(prompt).toContain(`Previous original response data:\n${JSON.stringify(raw)}`);
    expect(prompt).toContain(`Previous parsed candidate data:\n${JSON.stringify(parsed)}`);
    expect(prompt).toContain("每条finding必须有claims中的同path confirmed_error");
    expect(prompt).toContain("不能用另一个副本路径的claim当本路径证据");
  });

  it("retains serious failed proposals while dropping an oversized list of harmless repeated duties", () => {
    const excessive = report([...Array.from({ length: 25 }, (_, index) => ({ ...unchecked(index), conclusion: `HARMLESS_REPEATED_DUTY_${index}` })), claim()], [finding(), finding(taskPath)]);
    const raw = JSON.stringify(excessive);
    const prompt = buildPlanningKnowledgeRepairPrompt({ originalPrompt: "ACTUAL_TASK", rawOutput: raw, parsedCandidate: excessive, issues: [{ code: "invalid_planning_knowledge_review", path: taskPath, message: "wrong-path finding" }] });
    expect(prompt).toContain('"completeClaimObjects":26');
    expect(prompt).toContain(claim().counterexample);
    expect(prompt).toContain(finding(taskPath).path);
    expect(prompt).not.toContain("HARMLESS_REPEATED_DUTY_0");
    expect(prompt).toContain("具体推导若否定旧指控，可将该项改为no_error_found或uncertain");
    expect(prompt).toContain("原始失败记录永久保留");
  });

  it("keeps a verified same-candidate error report unchanged alongside unvalidated objections", () => {
    const known = { ...validatePlanningKnowledgeReview(report(), draft(), []), materials: [source], aiCallLogIds: ["original-error-log"] };
    const snapshot = JSON.stringify(known);
    const prompt = buildPlanningKnowledgeRepairPrompt({ originalPrompt: "ACTUAL_TASK", rawOutput: "{", parsedCandidate: undefined, knownErrorReport: known, issues: [{ code: "output_truncated", path: "$", message: "length" }] });
    expect(prompt).toContain(snapshot);
    expect(JSON.stringify(known)).toBe(snapshot);
    expect(prompt).toContain("已有合同有效且仍绑定当前候选的错误报告必须保留");
    expect(prompt).toContain("模型核对，不是权威证明");
  });

  it("prioritizes the missing propagation claim instead of repeating twelve harmless duties", () => {
    const failed = report([claim(), ...Array.from({ length: 11 }, (_, index) => unchecked(index))], [finding(), finding(taskPath)]);
    const raw = JSON.stringify(failed), before = JSON.stringify(failed);
    const prompt = buildPlanningKnowledgeRepairPrompt({ originalPrompt: "ACTUAL_TASK", rawOutput: raw, parsedCandidate: failed, issues: [{ code: "invalid_planning_knowledge_review", path: taskPath, message: "每条更正必须对应同一路径中已确认错误的真实主张" }] });
    expect(prompt).toContain(`更正位置（诊断线索，不代表指控成立）：${JSON.stringify([{ path: taskPath, quote: originalRule }])}`);
    expect(prompt).toContain("不能为凑满十二项而再次挤掉更正位置");
    expect(prompt).toContain("父级范围、前提与条件");
    expect(JSON.stringify(failed)).toBe(before);
    expect(() => validateGeneratedPlanningKnowledgeReview(failed, draft(), [])).toThrow("同一路径");
  });

  it("does not diagnose a supported finding as missing or manufacture a cross-path claim", () => {
    const valid = report([claim(), claim(taskPath, { key: "claim-task" })], [finding(), finding(taskPath)]);
    const before = JSON.stringify(valid);
    const prompt = buildPlanningKnowledgeRepairPrompt({ originalPrompt: "ACTUAL_TASK", rawOutput: before, parsedCandidate: valid, issues: [] });
    expect(prompt).toContain("更正位置（诊断线索，不代表指控成立）：[]");
    expect(prompt).toContain("不能自动复制其它路径的claim");
    expect(prompt).toContain("如指控不成立，依据实际推导撤回该finding");
    expect(JSON.stringify(valid)).toBe(before);
    expect(validateGeneratedPlanningKnowledgeReview(valid, draft(), []).claims).toHaveLength(2);
  });

  it("lists a same-path mismatched quote as a diagnostic while retaining the quote guard", () => {
    const missingQuote = "外层在对应点连续或极限存在";
    const failed = report([claim(upstreamPath, { quote: "内层极限存在" })], [finding(upstreamPath, { quote: missingQuote })]);
    const prompt = buildPlanningKnowledgeRepairPrompt({ originalPrompt: "ACTUAL_TASK", rawOutput: JSON.stringify(failed), parsedCandidate: failed, issues: [] });
    expect(prompt).toContain(`更正位置（诊断线索，不代表指控成立）：${JSON.stringify([{ path: upstreamPath, quote: missingQuote }])}`);
    expect(() => validateGeneratedPlanningKnowledgeReview(failed, draft(), [])).toThrow("同一路径");
  });

  it("bounds large failed objection summaries and reports omissions instead of pretending they were checked", () => {
    const excessive = report(Array.from({ length: 64 }, (_, index) => ({ ...claim(), key: `error-${index}`, reason: "r".repeat(6000), counterexample: "c".repeat(6000) })), []);
    const prompt = buildPlanningKnowledgeRepairPrompt({ originalPrompt: "ACTUAL_TASK", rawOutput: JSON.stringify(excessive), parsedCandidate: excessive, issues: [{ code: "output_truncated", path: "$", message: "length" }] });
    expect(prompt.length).toBeLessThan(19000);
    expect(prompt).toContain('"unvalidatedObjectionCount":64');
    expect(prompt).toMatch(/"omittedObjections":[1-9][0-9]*/);
    expect(prompt).toContain("摘要截短和未展示条数不能解释为已经核对");
  });
});
