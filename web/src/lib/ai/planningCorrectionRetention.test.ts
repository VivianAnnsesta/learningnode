import { beforeEach, describe, expect, it, vi } from "vitest";
import { reviewRoadmapDraftQuality } from "./tutorService";
import { validateRoadmapInput, type RoadmapInput } from "../learning/roadmapService";
import { planningKnowledgeDigest, type PlanningKnowledgeClaim } from "./planningKnowledgeReview";
import { AiProviderError } from "./provider";
import type { CourseDesignDraft } from "./tasks";

type ProviderInput = { taskType: string; messages: Array<{ content: string }> };
const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  domain: vi.fn(),
  createLog: vi.fn(),
  updateLog: vi.fn(),
  findLog: vi.fn(),
  logs: new Map<string, Record<string, unknown>>()
}));

vi.mock("../prisma", () => ({ prisma: {
  domain: { findUnique: mocks.domain },
  aiCallLog: { create: mocks.createLog, update: mocks.updateLog, findUnique: mocks.findLog }
} }));
vi.mock("./openaiCompatibleProvider", () => ({
  readOpenAiCompatibleConfig: () => ({
    provider: "deepseek", model: "fixture", apiKey: "fixture-secret", baseUrl: "https://example.com/v1",
    temperature: 0.25, timeoutMs: 300000, maxTokens: 130000
  }),
  createOpenAiCompatibleProvider: (config: unknown) => ({ config, generateText: mocks.generateText })
}));

const originalRule = "内层及外层去心极限存在即可使用复合极限法则。";
const correctedRule = "内层极限存在且外层在对应点连续时可使用复合极限法则。";
const originalGoal = "只检查两个极限存在即可。";
const correctedGoal = "检查内层极限和外层连续条件。";
const registryPath = "learningGoals[0].contentQuestions[0].contentRequirements[0]";
const projectionPath = "stages[0].moduleBlueprints[0].keyQuestions[0].contentRequirements[0]";
const directPath = "stages[0].goal";
const courseDesign: CourseDesignDraft = {
  taskBriefSnapshot: "学习复合极限的适用条件。",
  globalExplanation: {
    theorySkeleton: "先理解趋近，再检查条件。", sourceBasis: "测试夹具。",
    optimizationRationale: "先修在前。", risksAndValidation: "核对条件。"
  },
  sources: [], keyTradeoffs: [], qualityGate: { passed: true, missing: [] }
};

function baseline() {
  const input: RoadmapInput = {
    planningVersion: 3, contentCoverageVersion: 1, baseRevision: 4, title: "极限课程", status: "draft",
    learningGoals: [{ key: "goal-limits", description: "解释复合极限的适用条件。", contentQuestions: [{
      key: "content-composition", question: "何时可以使用复合极限法则？",
      contentRequirements: [originalRule], dimensionKeys: ["boundaries"]
    }] }],
    stages: [{
      key: "stage-limits", title: "复合极限", goal: originalGoal, status: "planned",
      rationale: "先说明条件，再看示例。", prerequisiteStageKeys: [], moduleDirections: ["复合极限条件"],
      problem: { question: "如何计算复合函数的极限？", steps: ["确认内层极限", "检查外层条件"] },
      moduleBlueprints: [{
        key: "module-composition", title: "复合极限条件", goal: "区分极限存在和连续。",
        keyQuestions: [{
          key: "question-composition", contentQuestionKey: "content-composition",
          question: "何时可以使用复合极限法则？", checkableOutcome: originalRule
        }]
      }]
    }]
  };
  return validateRoadmapInput(input);
}

function errorReport(paths: string[]) {
  const claims: PlanningKnowledgeClaim[] = paths.map((path, index) => ({
    key: `condition-${index}`, path, quote: path === directPath ? originalGoal : originalRule,
    conclusion: "原条件不能保证复合极限等于外层去心极限。",
    premises: ["内层函数恒为零。", "外层去心值为一、点值为二。"], applicability: ["本测试中明确引用的字段。"],
    verdict: "confirmed_error",
    basis: { kind: "derivation", fragmentIds: [], reason: "复合函数恒为二，而外层去心极限为一，因此仅有两个极限存在不充分。" },
    reason: "测试局部更正是否完整保存，不认证模型推理能力。"
  }));
  return {
    summary: "测试报告：条件遗漏。", limitations: ["本测试仅验证程序保留更正的边界。"], claims,
    findings: claims.map(claim => ({
      path: claim.path, quote: claim.quote,
      replacement: claim.path === directPath ? correctedGoal : correctedRule,
      reason: "补充外层连续这个充分条件。"
    }))
  };
}

function cleanReport(quote: string, path = registryPath) {
  return {
    summary: "测试报告：本项未发现错误。", limitations: ["只核对引用字段，不能证明整门课程正确。"],
    claims: [{
      key: "current-condition", path, quote, conclusion: "当前引用符合本次检查的条件。",
      premises: ["按引用的条件检查。"], applicability: ["只限这个字段。"], verdict: "no_error_found",
      basis: { kind: "derivation", fragmentIds: [], reason: "本模拟不提供真实模型质量证据。" }, reason: "服务合同夹具。"
    }], findings: []
  };
}

function queueReports(reports: unknown[]) {
  let next = 0;
  mocks.generateText.mockImplementation(async (input: ProviderInput) => {
    if (input.taskType === "roadmap_stage_critique") return { raw: {}, text: JSON.stringify({ report: {
      reviewPolicyVersion: 1, summary: "结构测试没有重大问题。", blockingIssues: [], warnings: []
    } }) };
    if (input.taskType !== "planning_knowledge_check" || next >= reports.length) {
      throw new Error(`Unexpected fixture provider call: ${input.taskType}`);
    }
    const report = reports[next++];
    if (report instanceof Error) throw report;
    return { raw: {}, text: JSON.stringify(report) };
  });
}

function knowledgeCalls() {
  return mocks.generateText.mock.calls.map(call => call[0] as ProviderInput)
    .filter(input => input.taskType === "planning_knowledge_check");
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.logs.clear();
  let logIndex = 0;
  mocks.domain.mockImplementation(async ({ select }: { select?: Record<string, unknown> }) => select?.entryGuideJson
    ? { entryGuideJson: "{}" }
    : { id: "domain-retention", name: "极限", goal: "理解复合极限条件。", currentLevel: "极限基础", taskBrief: "学习复合极限。" });
  mocks.createLog.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
    const log = { ...data, id: `log-${++logIndex}` };
    mocks.logs.set(log.id, log);
    return log;
  });
  mocks.updateLog.mockImplementation(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
    const log = { ...mocks.logs.get(where.id), id: where.id, ...data };
    mocks.logs.set(log.id, log);
    return log;
  });
  mocks.findLog.mockImplementation(async ({ where }: { where: { id: string } }) => mocks.logs.get(where.id) || null);
});

describe("planning corrections through the real roadmap validator", () => {
  it("rolls back the whole batch and repairs from the successful raw report when a projection overwrites a correction", async () => {
    const draft = baseline();
    const original = structuredClone(draft);
    const partial = { ...errorReport([projectionPath, directPath]), fixtureMarker: "valid-report-with-unretained-correction" };
    queueReports([partial, partial, partial]);

    const result = await reviewRoadmapDraftQuality("domain-retention", { courseDesign, draft, scope: "skeleton" });

    expect(result.draft).toEqual(original);
    expect(draft).toEqual(original);
    expect(result.draft.stages[0].goal).toBe(originalGoal);
    const review = result.qualityReport.knowledgeReview;
    expect(review).toMatchObject({
      verdict: "confirmed_error", draftDigest: planningKnowledgeDigest(original), findings: partial.findings,
      corrections: [], aiCallLogIds: ["log-2", "log-3", "log-4"]
    });
    const calls = knowledgeCalls();
    expect(calls).toHaveLength(3);
    expect(result.aiCallLogIds).toEqual(["log-1", "log-2", "log-3", "log-4"]);
    expect(mocks.findLog.mock.calls.map(([input]) => input.where.id)).toEqual(["log-2", "log-3"]);
    for (const [index, call] of calls.slice(1).entries()) {
      const saved = mocks.logs.get(`log-${index + 2}`)!;
      expect(saved).toMatchObject({ status: "success", rawOutput: JSON.stringify(partial) });
      expect(call.messages[1].content).toContain(`Previous original response data:\n${JSON.stringify(saved.rawOutput)}`);
      expect(call.messages[1].content).toContain(`Previous parsed candidate data:\n${saved.parsedOutputJson}`);
      expect(call.messages[1].content).toContain("planning_correction_not_retained");
      expect(call.messages[1].content).toContain(registryPath);
    }
    expect(mocks.logs.has("log-5")).toBe(false);
  });

  it("commits only a repaired batch that corrects the registry and each previously reported location", async () => {
    const draft = baseline();
    const original = structuredClone(draft);
    const partial = errorReport([projectionPath, directPath]);
    const complete = errorReport([registryPath, projectionPath, directPath]);
    queueReports([partial, complete, cleanReport(correctedRule)]);

    const result = await reviewRoadmapDraftQuality("domain-retention", { courseDesign, draft, scope: "skeleton" });

    expect(knowledgeCalls()).toHaveLength(3);
    expect(draft).toEqual(original);
    expect(result.draft.learningGoals?.[0].contentQuestions?.[0].contentRequirements).toEqual([correctedRule]);
    expect(result.draft.stages[0].moduleBlueprints?.[0].keyQuestions[0]).toMatchObject({
      contentRequirements: [correctedRule], checkableOutcome: correctedRule
    });
    expect(result.draft.stages[0].goal).toBe(correctedGoal);
    expect(result.qualityReport.knowledgeReview).toMatchObject({
      verdict: "no_error_found", draftDigest: planningKnowledgeDigest(result.draft), findings: [],
      corrections: [{
        findings: complete.findings, beforeHash: planningKnowledgeDigest(original), afterHash: planningKnowledgeDigest(result.draft)
      }], aiCallLogIds: ["log-2", "log-3", "log-4"]
    });
    expect(mocks.findLog).toHaveBeenCalledTimes(1);
    expect(knowledgeCalls()[2].messages[1].content).toContain(`此前局部更正（只读）：${JSON.stringify([{
      findings: complete.findings, beforeHash: planningKnowledgeDigest(original), afterHash: planningKnowledgeDigest(result.draft)
    }])}`);
    expect(knowledgeCalls()[2].messages[1].content).toContain(correctedRule);
  });

  it("keeps known errors when subsequent reports claim no error without applying the failed corrections", async () => {
    const draft = baseline();
    const partial = errorReport([projectionPath, directPath]);
    const dismissal = cleanReport(originalRule);
    queueReports([partial, dismissal, dismissal]);

    const result = await reviewRoadmapDraftQuality("domain-retention", { courseDesign, draft, scope: "skeleton" });

    expect(result.draft).toEqual(draft);
    expect(result.qualityReport.knowledgeReview).toMatchObject({
      verdict: "confirmed_error", draftDigest: planningKnowledgeDigest(draft), claims: partial.claims,
      findings: partial.findings, corrections: [], aiCallLogIds: ["log-2", "log-3", "log-4"]
    });
    expect(result.qualityReport.knowledgeReview.limitations.join(" ")).toContain("确定错误尚未更正");
    expect(knowledgeCalls()).toHaveLength(3);
    const lastPrompt = knowledgeCalls()[2].messages[1].content;
    expect(lastPrompt).toContain("unresolved_planning_knowledge_error");
    expect(lastPrompt).toContain(projectionPath);
    expect(lastPrompt).toContain(correctedGoal);
    expect(mocks.logs.get("log-3")).toMatchObject({ status: "success", rawOutput: JSON.stringify(dismissal) });
    expect(mocks.findLog.mock.calls.map(([input]) => input.where.id)).toEqual(["log-2", "log-3"]);
  });

  it("retains a committed correction batch when the follow-up provider fails without retrying transport", async () => {
    const draft = baseline();
    const original = structuredClone(draft);
    const complete = errorReport([registryPath, projectionPath, directPath]);
    queueReports([complete, new AiProviderError("follow-up knowledge provider unavailable")]);

    const result = await reviewRoadmapDraftQuality("domain-retention", { courseDesign, draft, scope: "skeleton" });

    expect(draft).toEqual(original);
    expect(result.draft.learningGoals?.[0].contentQuestions?.[0].contentRequirements).toEqual([correctedRule]);
    expect(result.draft.stages[0].moduleBlueprints?.[0].keyQuestions[0]).toMatchObject({
      contentRequirements: [correctedRule], checkableOutcome: correctedRule
    });
    expect(result.draft.stages[0].goal).toBe(correctedGoal);
    expect(result.qualityReport.knowledgeReview).toMatchObject({
      verdict: "uncertain", draftDigest: planningKnowledgeDigest(result.draft), claims: [], findings: [],
      corrections: [{
        findings: complete.findings, beforeHash: planningKnowledgeDigest(original), afterHash: planningKnowledgeDigest(result.draft)
      }], aiCallLogIds: ["log-2", "log-3"]
    });
    expect(result.qualityReport.knowledgeReview.limitations).toContain("follow-up knowledge provider unavailable");
    expect(knowledgeCalls()).toHaveLength(2);
    expect(result.aiCallLogIds).toEqual(["log-1", "log-2", "log-3"]);
    expect(mocks.logs.get("log-3")).toMatchObject({
      status: "failed", failureStage: "provider", errorMessage: "follow-up knowledge provider unavailable"
    });
    expect(mocks.findLog).not.toHaveBeenCalled();
    expect(mocks.logs.has("log-4")).toBe(false);
  });

  it("accepts an owner-only repair when normalization also realizes the previously failed projection correction", async () => {
    const draft = baseline();
    const original = structuredClone(draft);
    const partial = errorReport([projectionPath, directPath]);
    const ownerRepair = errorReport([registryPath, directPath]);
    queueReports([partial, ownerRepair, cleanReport(correctedRule)]);

    const result = await reviewRoadmapDraftQuality("domain-retention", { courseDesign, draft, scope: "skeleton" });

    expect(draft).toEqual(original);
    expect(result.draft.learningGoals?.[0].contentQuestions?.[0].contentRequirements).toEqual([correctedRule]);
    expect(result.draft.stages[0].moduleBlueprints?.[0].keyQuestions[0]).toMatchObject({
      contentRequirements: [correctedRule], checkableOutcome: correctedRule
    });
    expect(result.draft.stages[0].goal).toBe(correctedGoal);
    expect(result.qualityReport.knowledgeReview).toMatchObject({
      verdict: "no_error_found", draftDigest: planningKnowledgeDigest(result.draft), findings: [],
      corrections: [{
        findings: ownerRepair.findings, beforeHash: planningKnowledgeDigest(original), afterHash: planningKnowledgeDigest(result.draft)
      }], aiCallLogIds: ["log-2", "log-3", "log-4"]
    });
    expect(knowledgeCalls()).toHaveLength(3);
    expect(mocks.findLog).toHaveBeenCalledTimes(1);
    expect(mocks.logs.get("log-3")).toMatchObject({ status: "success", rawOutput: JSON.stringify(ownerRepair) });
    expect(knowledgeCalls()[1].messages[1].content).toContain("planning_correction_not_retained");
    expect(knowledgeCalls()[1].messages[1].content).toContain(registryPath);
  });
});
