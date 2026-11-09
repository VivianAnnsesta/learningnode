import { beforeEach, describe, expect, it, vi } from "vitest";
import { validateRoadmapInput, type RoadmapInput } from "../learning/roadmapService";
import { validateMapDraftQualityRepair } from "./mapDraftRepair";
import { AiTaskValidationError, type CourseDesignDraft, type MapDraftQualityReport } from "./tasks";
import { reviewRoadmapDraftQuality, runJsonTask } from "./tutorService";
import { aiFailureReference } from "./validationEvidence";

const mocks = vi.hoisted(() => ({ generateText: vi.fn(), create: vi.fn(), update: vi.fn(), domain: vi.fn() }));
vi.mock("../prisma", () => ({ prisma: {
  domain: { findUnique: mocks.domain }, aiCallLog: { create: mocks.create, update: mocks.update }
} }));
vi.mock("./openaiCompatibleProvider", () => ({
  readOpenAiCompatibleConfig: () => ({ provider: "deepseek", model: "fixture", apiKey: "fixture-secret" }),
  createOpenAiCompatibleProvider: (config: unknown) => ({ config, generateText: mocks.generateText })
}));

const passed: MapDraftQualityReport = { status: "passed", summary: "本阶段修订完成。", blockingIssues: [], warnings: [] };
const policyPassed = { ...passed, reviewPolicyVersion: 1 as const };
const uncertainKnowledge = { text: JSON.stringify({ verdict: "uncertain", summary: "本结构测试没有逐项知识核对证据。", limitations: ["缺少实际资料和独立推导；不能把结构复审通过当作知识正确。"], claims: [], findings: [] }), raw: {} };
function queuePlanningResponses(...responses: Array<{ text: string; raw: Record<string, unknown> }>) {
  let next = 0;
  mocks.generateText.mockImplementation(async (input: { taskType: string }) => {
    if (input.taskType === "planning_knowledge_check") return uncertainKnowledge;
    const response = responses[next++];
    if (!response) throw new Error(`Unexpected structural task: ${input.taskType}`);
    return response;
  });
}
const courseDesign: CourseDesignDraft = {
  taskBriefSnapshot: "学习定义域与极限。",
  globalExplanation: { theorySkeleton: "先理解函数取值范围，再理解趋近。", sourceBasis: "已提供的课程资料。", optimizationRationale: "保留真实前置。", risksAndValidation: "核对边界。" },
  sources: [], keyTradeoffs: [], qualityGate: { passed: true, missing: [] }
};
function baseline() {
  const stages = ["domain", "limit"].map((key, index) => ({
    key, title: index ? "函数极限" : "函数定义域", goal: index ? "解释趋近过程。" : "说明输入限制。",
    goalKeys: [`goal-${key}`], status: "expanded", rationale: "课程方向不变。",
    problem: { question: index ? "函数在某点附近如何变化？" : "函数在哪些输入上有定义？", steps: ["明确条件", "解释结果"] },
    moduleDirections: [index ? "极限概念" : "定义域概念"],
    prerequisiteStageKeys: index ? ["domain"] : [],
    moduleBlueprints: [{ key: `module-${key}`, title: `${key} 模块`, goal: "解释本概念。", goalKeys: [`goal-${key}`],
      keyQuestions: [{ key: `q-${key}`, question: "这个概念表达什么？", checkableOutcome: "用一个例子说明概念与边界。", goalKeys: [`goal-${key}`] }]
    }],
    modules: [{ title: `${key} 模块`, goal: "解释本概念。", conceptReferences: [], items: [{
      key: `node-${key}`, title: index ? "函数极限" : "函数定义域", keyQuestion: "这个概念表达什么？", objective: "用一个例子说明概念与边界。",
      concept: { name: index ? "函数极限" : "函数定义域", aliases: [], scope: "只解释本概念的含义。", problemRole: "说明问题中的约束。" },
      planningQuestionKeys: [`q-${key}`], prerequisiteKeys: index ? ["node-domain"] : [],
      status: index ? "in_progress" : "not_started"
    }] }]
  }));
  return validateRoadmapInput({ planningVersion: 3, title: "已确认的课程", status: "draft", baseRevision: 7,
    learningGoals: [{ key: "goal-domain", description: "能解释定义域。" }, { key: "goal-limit", description: "能解释极限。" }], stages });
}

describe("Stage repair and course-goal ownership", () => {
  function withPlannedContainer() {
    const original = baseline();
    const container = structuredClone(original.stages[0]);
    container.key = "entry-clarification";
    container.status = "planned";
    container.modules = [];
    container.moduleBlueprints![0].key = "entry-module";
    container.moduleBlueprints![0].keyQuestions[0].key = "entry-question";
    return validateRoadmapInput({ ...original, stages: [container, ...original.stages] });
  }

  it("allows removing an unexpanded redundant container while preserving goals, work and revision", () => {
    const original = withPlannedContainer();
    const snapshot = structuredClone(original);
    const draft = { ...original, stages: original.stages.filter(stage => stage.key !== "entry-clarification") };
    const result = validateMapDraftQualityRepair({ report: passed, draft }, original);
    expect(result.draft.stages.map(stage => stage.key)).toEqual(["domain", "limit"]);
    expect(result.draft.learningGoals).toEqual(original.learningGoals);
    expect(result.draft.baseRevision).toBe(7);
    expect(result.draft.stages[1].modules[0].items[0].status).toBe("in_progress");
    expect(original).toEqual(snapshot);
  });

  it("rejects deleting an expanded Stage even when remaining blueprints cover the course goals", () => {
    const original = withPlannedContainer();
    const draft = structuredClone(original);
    draft.stages = draft.stages.filter(stage => stage.key !== "domain");
    draft.stages.find(stage => stage.key === "limit")!.prerequisiteStageKeys = [];
    draft.stages.find(stage => stage.key === "limit")!.modules[0].items[0].prerequisiteKeys = [];
    expect(() => validateMapDraftQualityRepair({ report: passed, draft }, original)).toThrow("已有展开内容不能整体丢弃");
  });

  it("does not let container removal bypass required goal coverage or dangling prerequisite checks", () => {
    const original = withPlannedContainer();
    const draft = structuredClone(original);
    draft.stages = draft.stages.filter(stage => stage.key !== "entry-clarification");
    draft.stages[0].prerequisiteStageKeys = ["entry-clarification"];
    expect(() => validateMapDraftQualityRepair({ report: passed, draft }, original)).toThrow(/前置/);
    const missing = structuredClone(original);
    missing.stages = missing.stages.filter(stage => stage.key === "limit");
    missing.stages[0].prerequisiteStageKeys = [];
    missing.stages[0].modules[0].items[0].prerequisiteKeys = [];
    expect(() => validateMapDraftQualityRepair({ report: passed, draft: missing }, original)).toThrow(/目标|覆盖/);
  });

  it("allows only planned new containers and never expands them during global repair", () => {
    const original = baseline();
    const draft = withPlannedContainer();
    expect(validateMapDraftQualityRepair({ report: passed, draft }, original).draft.stages[0].status).toBe("planned");
    draft.stages[0].status = "expanded";
    draft.stages[0].modules = structuredClone(original.stages[0].modules);
    draft.stages[0].modules[0].items[0].key = "new-entry-node";
    draft.stages[0].modules[0].items[0].title = "新增入口说明";
    draft.stages[0].modules[0].items[0].concept!.name = "新增入口说明";
    draft.stages[0].modules[0].items[0].planningQuestionKeys = ["entry-question"];
    expect(() => validateMapDraftQualityRepair({ report: passed, draft }, original)).toThrow(/new Stages remain planned/);
  });

  it("does not downgrade explicit contribution contracts during a local repair", () => {
    const original = baseline();
    const node = original.stages[0].modules[0].items[0];
    node.concept!.learningUnit = { version: 2, newKnowledge: "定义域约束", assumedKnowledge: [], teachingTasks: ["解释输入条件"], example: "分母不为零", references: [], contentContributions: [] };
    const stage = structuredClone(original.stages[0]);
    stage.modules[0].items[0].concept!.learningUnit!.version = 1;
    expect(() => validateMapDraftQualityRepair({ report: passed, stage }, original, { stageKey: "domain" })).toThrow("降级");
    stage.modules[0].items[0].concept!.learningUnit!.version = 2;
    expect(validateMapDraftQualityRepair({ report: passed, stage }, original, { stageKey: "domain" }).draft.stages[0].modules[0].items[0].concept?.learningUnit?.version).toBe(2);
  });
  it("retains new learning units through local repair and rejects silently dropping them", () => {
    const original = baseline();
    const node = original.stages[0].modules[0].items[0];
    node.concept!.learningUnit = { version: 1, newKnowledge: "本课新增含义", assumedKnowledge: ["已确认基础"], teachingTasks: ["解释新增含义"], example: "一个具体例子", references: [{ key: "node-limit", purpose: "比较" }] };
    const stage = structuredClone(original.stages[0]);
    const result = validateMapDraftQualityRepair({ report: passed, stage }, original, { stageKey: "domain" });
    expect(result.draft.stages[0].modules[0].items[0].concept?.learningUnit).toEqual(node.concept!.learningUnit);
    delete stage.modules[0].items[0].concept!.learningUnit;
    expect(() => validateMapDraftQualityRepair({ report: passed, stage }, original, { stageKey: "domain" })).toThrow("不能丢弃");
  });
  let records: Record<string, Record<string, unknown>>;
  beforeEach(() => {
    vi.resetAllMocks(); records = {};
    mocks.domain.mockResolvedValue({ id: "domain-1", name: "微积分" });
    mocks.create.mockImplementation(async ({ data }) => {
      const id = `log-${Object.keys(records).length + 1}`;
      records[id] = { id, ...data }; return records[id];
    });
    mocks.update.mockImplementation(async ({ where, data }) => {
      Object.assign(records[where.id], data); return { ...records[where.id] };
    });
  });

  it("changes only the selected Stage while preserving goals, other work and revision", () => {
    const original = baseline(); const snapshot = structuredClone(original);
    const stage = structuredClone(original.stages[0]);
    stage.rationale = "补充定义域边界。";
    stage.modules[0].items[0].objective = "给出定义域并用边界点核对。";
    const result = validateMapDraftQualityRepair({ report: passed, stage }, original, { stageKey: "domain" });
    expect(result.draft.learningGoals).toBe(original.learningGoals);
    expect(result.draft.stages[1]).toEqual(original.stages[1]);
    expect(result.draft.stages[1].modules[0].items[0].status).toBe("in_progress");
    expect(result.draft).toMatchObject({ title: original.title, baseRevision: 7, planningVersion: 3 });
    expect(result.draft.stages[0].rationale).toBe(stage.rationale);
    expect(original).toEqual(snapshot);
  });

  it("preserves the registered content requirements during local repair and rejects whole-map rewrites", () => {
    const legacy=baseline();
    const learningGoals=legacy.learningGoals!.map(goal=>({...goal,contentQuestions:[{key:`cq-${goal.key}`,question:"本概念表达什么？",contentRequirements:["提供具体含义与边界例子。"],dimensionKeys:["definition" as const,"boundaries" as const]}]}));
    const original=validateRoadmapInput({...legacy,contentCoverageVersion:1,learningGoals,stages:legacy.stages.map(stage=>({...stage,moduleBlueprints:stage.moduleBlueprints!.map(module=>({...module,keyQuestions:module.keyQuestions.map(q=>({...q,contentQuestionKey:`cq-${stage.goalKeys![0]}`}))}))}))});
    const stage=structuredClone(original.stages[0]);
    delete stage.goalKeys;
    const result=validateMapDraftQualityRepair({report:passed,stage},original,{stageKey:"domain"});
    expect(result.draft.learningGoals).toBe(original.learningGoals);
    expect(result.draft.stages[0].goalKeys).toEqual(["goal-domain"]);
    const rewritten=structuredClone(original);
    rewritten.learningGoals![0].contentQuestions![0].contentRequirements=["改成其他要求。"];
    expect(()=>validateMapDraftQualityRepair({report:passed,draft:rewritten},original)).toThrow("不能默默丢弃要求");
  });

  it.each([
    { field: "key", value: "limit" }, { field: "status", value: "planned" },
    { field: "learningGoals", value: [] }, { field: "baseRevision", value: 999 }
  ])("rejects a Stage response changing $field outside its contract", ({ field, value }) => {
    const original = baseline();
    expect(() => validateMapDraftQualityRepair({ report: passed, stage: { ...original.stages[0], [field]: value } }, original, { stageKey: "domain" }))
      .toThrow(AiTaskValidationError);
  });

  it("rejects an entire-map reply during a Stage repair instead of silently accepting it", () => {
    const original = baseline();
    expect(() => validateMapDraftQualityRepair({ report: passed, draft: original }, original, { stageKey: "domain" }))
      .toThrow("阶段修复只能返回 report 和 stage");
  });

  it("still checks cross-Stage references after the local merge", () => {
    const original = baseline(); const stage = structuredClone(original.stages[0]);
    stage.modules[0].items[0].key = "replacement-domain";
    expect(() => validateMapDraftQualityRepair({ report: passed, stage }, original, { stageKey: "domain" }))
      .toThrow("不存在的前置节点 node-domain");
  });

  it("rejects a cycle spanning the repaired and unchanged Stages", () => {
    const original = baseline(); const stage = structuredClone(original.stages[0]);
    stage.modules[0].items[0].prerequisiteKeys = ["node-limit"];
    expect(() => validateMapDraftQualityRepair({ report: passed, stage }, original, { stageKey: "domain" }))
      .toThrow(/环/);
  });

  it("keeps precise goal issues eligible for the unified structural repair", () => {
    const original = baseline(); const stage = { ...original.stages[0], goalKeys: ["unknown-goal"] };
    let failure: unknown;
    try { validateMapDraftQualityRepair({ report: passed, stage }, original, { stageKey: "domain" }); } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(AiTaskValidationError);
    expect((failure as AiTaskValidationError).issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "invalid_stage_goals", stageKey: "domain", path: "stages[0].goalKeys", actualGoalKeys: ["unknown-goal"] })
    ]));
  });

  it("cannot remove findings explicitly targeting an unchanged Stage", () => {
    const original = baseline();
    const otherFinding = { code: "checkability", targetKey: "q-limit", message: "极限阶段还需要明确检查方式。", suggestion: "单独修订该阶段。" };
    const result = validateMapDraftQualityRepair({ report: passed, stage: original.stages[0] }, original, {
      stageKey: "domain", previousReport: { ...passed, status: "blocked", blockingIssues: [otherFinding] }
    });
    expect(result.report).toMatchObject({ status: "blocked", blockingIssues: [otherFinding] });
  });

  it("keeps an unchanged Stage's original finding once instead of accumulating paraphrases", () => {
    const original = baseline();
    const finding = { code: "checkability", targetKey: "q-limit", message: "极限阶段还需要明确检查方式。", suggestion: "单独修订该阶段。" };
    const result = validateMapDraftQualityRepair({ report: { ...passed, blockingIssues: [{ ...finding, message: "另一种措辞的相同问题。" }] }, stage: original.stages[0] }, original, {
      stageKey: "domain", previousReport: { ...passed, status: "blocked", blockingIssues: [finding] }
    });
    expect(result.report.blockingIssues).toEqual([finding]);
  });

  it("rejects missing or rewritten goals even in a full-map repair", () => {
    const original = baseline(); const missing: RoadmapInput = { ...original, learningGoals: undefined };
    expect(() => validateMapDraftQualityRepair({ report: passed, draft: missing }, original)).toThrow(AiTaskValidationError);
    const changed = { ...original, learningGoals: original.learningGoals!.map(goal => ({ ...goal, description: "换成别的教学目标。" })) };
    expect(() => validateMapDraftQualityRepair({ report: passed, draft: changed }, original)).toThrow("完整保留课程总目标");
  });

  it("does not accept a newer map revision invented by a repair", () => {
    const original = baseline();
    expect(() => validateMapDraftQualityRepair({ report: passed, draft: { ...original, baseRevision: 8 } }, original))
      .toThrow("preserve baseRevision");
  });

  it("repairs a domain-validation failure with the original raw candidate and retains both attempts", async () => {
    const original = baseline();
    const invalid = JSON.stringify({ report: passed, draft: { ...original, learningGoals: undefined } });
    mocks.generateText.mockResolvedValueOnce({ text: invalid, raw: {} })
      .mockResolvedValueOnce({ text: JSON.stringify({ report: passed, draft: original }), raw: {} });
    const result = await runJsonTask({ domainId: "domain-1", taskType: "roadmap_stage_repair", inputSummary: "Repair goals", userPrompt: "Preserve course goals.",
      validate: value => validateMapDraftQualityRepair(value, original) });
    expect(result.aiCallLogIds).toEqual(["log-1", "log-2"]);
    expect(records["log-1"]).toMatchObject({ status: "failed", failureStage: "validation", rawOutput: invalid });
    expect(records["log-2"]).toMatchObject({ status: "success", retryReason: "validation", retryOfLogId: "log-1" });
    expect(mocks.generateText.mock.calls[1][0].messages[1].content).toContain("invalid_learning_goals");
    expect(mocks.generateText.mock.calls[1][0].messages[1].content).toContain(invalid);
  });

  it("bounds failed structural repairs without replacing the course or losing evidence", async () => {
    const original = baseline(); const raw = JSON.stringify({ report: passed, draft: { ...original, learningGoals: undefined } });
    mocks.generateText.mockResolvedValue({ text: raw, raw: {} });
    const failure = await runJsonTask({ domainId: "domain-1", taskType: "roadmap_stage_repair", inputSummary: "Repair goals", userPrompt: "Preserve course goals.",
      validate: value => validateMapDraftQualityRepair(value, original) }).catch(error => error);
    expect(mocks.generateText).toHaveBeenCalledTimes(2);
    expect(aiFailureReference(failure).aiCallLogIds).toEqual(["log-1", "log-2"]);
    expect(Object.values(records).every(record => record.status === "failed" && record.rawOutput === raw)).toBe(true);
    expect(original.learningGoals).toHaveLength(2);
  });

  it("runs whole-map critique with a Stage-only repair and includes failed repair attempts in the receipt", async () => {
    const original = baseline();
    const report = { ...policyPassed, blockingIssues: [{ code: "coreKnowledgeError", targetKey: "node-domain", message: "核心定义需要修正。", suggestion: "修正定义。", evidence: { draftExcerpt: "函数定义域", requirement: "正确解释输入范围。", impact: "核心定义错误会使后续函数与极限学习建立在错误基础上。" } }] };
    const stage = { ...original.stages[0], rationale: "修正核心定义。" };
    queuePlanningResponses({ text: JSON.stringify({ report }), raw: {} },
      { text: JSON.stringify({ report: policyPassed, draft: original }), raw: {} },
      { text: JSON.stringify({ report: policyPassed, stage }), raw: {} });
    const result = await reviewRoadmapDraftQuality("domain-1", { courseDesign, draft: original, scope: "map", stageKey: "domain" });
    expect(result.draft.learningGoals).toEqual(original.learningGoals);
    expect(result.draft.stages[1]).toEqual(original.stages[1]);
    expect(result.qualityReport.status).toBe("passed");
    expect(result.aiCallLogIds).toEqual(["log-1", "log-2", "log-3", "log-4"]);
    expect(result.qualityReport.knowledgeReview).toMatchObject({ verdict: "uncertain", claims: [], aiCallLogIds: ["log-4"] });
    expect(records["log-4"]).toMatchObject({ taskType: "planning_knowledge_check", status: "success" });
    expect(records["log-2"]).toMatchObject({ status: "failed", promptVersion: "stage-scoped-repair-v3-critical-1-contributions-2-continuity-1" });
    expect(records["log-3"]).toMatchObject({ status: "success", retryReason: "validation" });
    const prompt = mocks.generateText.mock.calls[1][0].messages[1].content;
    expect(prompt).toContain('Repair ONLY the expanded Stage with key "domain"');
    expect(prompt).toContain("Read-only course goals");
    expect(prompt).toContain("Never return draft, stages, learningGoals");
  });

  it("keeps the current concern and target Stage in actual review, repair retry and knowledge calls", async () => {
    const original = baseline();
    const feedback = "CONCERN_731：请核对当前阶段是否把选学比较变成必需前置；这是质疑而非已确认错误。";
    const report = { ...policyPassed, blockingIssues: [{ code: "coreKnowledgeError", targetKey: "node-domain", message: "核心定义需要修正。", suggestion: "修正定义。", evidence: { draftExcerpt: "函数定义域", requirement: "正确解释输入范围。", impact: "核心定义错误会使后续学习建立在错误基础上。" } }] };
    const stage = { ...original.stages[0], rationale: "按当前证据修正核心定义。" };
    queuePlanningResponses({ text: JSON.stringify({ report }), raw: {} },
      { text: JSON.stringify({ report: policyPassed, draft: original }), raw: {} },
      { text: JSON.stringify({ report: policyPassed, stage }), raw: {} });
    const result = await reviewRoadmapDraftQuality("domain-1", { courseDesign, draft: original, scope: "map", stageKey: "domain", feedback });
    const requests = mocks.generateText.mock.calls.map(([input]) => input);
    expect(requests.map(input => input.taskType)).toEqual(["roadmap_stage_critique", "roadmap_stage_repair", "roadmap_stage_repair", "planning_knowledge_check"]);
    for (const input of requests) expect(input.messages[1].content).toContain(feedback);
    expect(requests[0].messages[1].content).toContain('"stageKey":"domain"');
    expect(requests[0].messages[1].content).toContain(original.stages[1].key);
    expect(requests[0].messages[1].content).toContain("not as an established defect");
    expect(requests[1].messages[1].content).toContain('Repair ONLY the expanded Stage with key "domain"');
    expect(result.draft.stages[1]).toEqual(original.stages[1]);
    expect(result.draft.learningGoals).toEqual(original.learningGoals);
    expect(records["log-2"].status).toBe("failed");
  });

  it("passes a whole-map concern without inventing a target Stage or repair permission", async () => {
    const original = baseline(), feedback = "GLOBAL_CONCERN_913：比较整个课程的实际范围。";
    queuePlanningResponses({ text: JSON.stringify({ report: policyPassed }), raw: {} });
    const result = await reviewRoadmapDraftQuality("domain-1", { courseDesign, draft: original, scope: "map", feedback });
    const firstPrompt = mocks.generateText.mock.calls[0][0].messages[1].content;
    expect(firstPrompt).toContain(feedback);
    expect(firstPrompt).toContain('"stageKey":null');
    expect(result.draft).toEqual(original);
    expect(result.repairAttempts).toBe(0);
  });

  it("rejects an unknown target Stage before any review call even with a user concern", async () => {
    await expect(reviewRoadmapDraftQuality("domain-1", { courseDesign, draft: baseline(), scope: "map", stageKey: "invented-stage", feedback: "请修改不存在的阶段" })).rejects.toThrow("已展开的目标阶段");
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("stops local repair when only other Stages' findings remain, without clearing their blocker", async () => {
    const original = baseline();
    const outside = { code: "criticalCoverageGap", targetKey: "q-limit", message: "后续阶段遗漏核心必学内容。", suggestion: "单独处理。", evidence: { draftExcerpt: "这个概念表达什么？", requirement: "正确解释极限。", impact: "缺少核心内容会使极限课程无法学习。" } };
    const local = { code: "coreKnowledgeError", targetKey: "node-domain", message: "当前核心定义错误。", suggestion: "修正定义。", evidence: { draftExcerpt: "函数定义域", requirement: "正确解释输入范围。", impact: "会使后续函数学习建立在错误基础上。" } };
    queuePlanningResponses({ text: JSON.stringify({ report: { ...policyPassed, blockingIssues: [local, outside] } }), raw: {} },
      { text: JSON.stringify({ report: policyPassed, stage: original.stages[0] }), raw: {} });
    const result = await reviewRoadmapDraftQuality("domain-1", { courseDesign, draft: original, scope: "map", stageKey: "domain" });
    expect(mocks.generateText).toHaveBeenCalledTimes(3);
    expect(result.repairAttempts).toBe(1);
    expect(result.qualityReport).toMatchObject({ status: "blocked", blockingIssues: [outside] });
    expect(result.draft.learningGoals).toEqual(original.learningGoals);
    expect(result.qualityReport.knowledgeReview?.verdict).toBe("uncertain");
    expect(records["log-3"].taskType).toBe("planning_knowledge_check");
  });

  it("passes with warnings and does not spend repair calls on optional enrichment", async () => {
    const original = baseline();
    queuePlanningResponses({ text: JSON.stringify({ report: { ...policyPassed, warnings: [{ code: "optionalEnrichment", targetKey: "domain", message: "可增加一个示范。" }] } }), raw: {} });
    const result = await reviewRoadmapDraftQuality("domain-1", { courseDesign, draft: original, scope: "map" });
    expect(result.qualityReport.status).toBe("passed");
    expect(result.qualityReport.warnings).toHaveLength(1);
    expect(result.repairAttempts).toBe(0);
    expect(mocks.generateText).toHaveBeenCalledTimes(2);
    expect(mocks.generateText.mock.calls.map(([input]) => input.taskType)).toEqual(["roadmap_stage_critique", "planning_knowledge_check"]);
    expect(result.qualityReport.knowledgeReview).toMatchObject({ verdict: "uncertain", claims: [], aiCallLogIds: ["log-2"] });
  });

  it("stops after an ineffective repair and retains the serious defect", async () => {
    const original = baseline();
    const report = { ...policyPassed, blockingIssues: [{ code: "coreKnowledgeError", targetKey: "node-domain", message: "核心定义错误。", evidence: { draftExcerpt: "函数定义域", requirement: "解释输入范围。", impact: "错误定义会使函数学习失去正确基础。" } }] };
    queuePlanningResponses({ text: JSON.stringify({ report }), raw: {} },
      { text: JSON.stringify({ report, stage: original.stages[0] }), raw: {} });
    const result = await reviewRoadmapDraftQuality("domain-1", { courseDesign, draft: original, scope: "map", stageKey: "domain" });
    expect(result.repairAttempts).toBe(1);
    expect(mocks.generateText).toHaveBeenCalledTimes(3);
    expect(result.qualityReport.status).toBe("blocked");
    expect(result.qualityReport.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "repairNoProgress" })]));
  });

  it("retains the last valid draft and all evidence when structural repair is exhausted", async () => {
    const original = baseline();
    const report = { ...policyPassed, blockingIssues: [{ code: "coreKnowledgeError", targetKey: "node-domain", message: "核心定义错误。", evidence: { draftExcerpt: "函数定义域", requirement: "解释输入范围。", impact: "错误定义会使函数学习失去正确基础。" } }] };
    queuePlanningResponses({ text: JSON.stringify({ report }), raw: {} },
      { text: JSON.stringify({ report: policyPassed, draft: original }), raw: {} },
      { text: JSON.stringify({ report: policyPassed, draft: original }), raw: {} });
    const result = await reviewRoadmapDraftQuality("domain-1", { courseDesign, draft: original, scope: "map", stageKey: "domain" });
    expect(result.draft).toEqual(original);
    expect(result.qualityReport.status).toBe("blocked");
    expect(result.aiCallLogIds).toEqual(["log-1", "log-2", "log-3", "log-4"]);
    expect(records["log-2"].status).toBe("failed");
    expect(records["log-3"].status).toBe("failed");
    expect(records["log-4"]).toMatchObject({ taskType: "planning_knowledge_check", status: "success" });
    expect(result.qualityReport.knowledgeReview).toMatchObject({ verdict: "uncertain", claims: [] });
    expect(result.qualityReport.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: "repairFailed" })]));
  });

  it("never reports success simply because two repair rounds were used", async () => {
    const original = baseline();
    const report = { ...policyPassed, blockingIssues: [{ code: "coreKnowledgeError", targetKey: "node-domain", message: "核心定义错误。", evidence: { draftExcerpt: "函数定义域", requirement: "解释输入范围。", impact: "错误定义会使函数学习失去正确基础。" } }] };
    queuePlanningResponses({ text: JSON.stringify({ report }), raw: {} },
      { text: JSON.stringify({ report, stage: { ...original.stages[0], rationale: "第一轮调整。" } }), raw: {} },
      { text: JSON.stringify({ report, stage: { ...original.stages[0], rationale: "第二轮调整。" } }), raw: {} });
    const result = await reviewRoadmapDraftQuality("domain-1", { courseDesign, draft: original, scope: "map", stageKey: "domain" });
    expect(result.repairAttempts).toBe(2);
    expect(mocks.generateText).toHaveBeenCalledTimes(4);
    expect(result.qualityReport.status).toBe("blocked");
    expect(result.qualityReport.knowledgeReview?.verdict).toBe("uncertain");
  });
});
