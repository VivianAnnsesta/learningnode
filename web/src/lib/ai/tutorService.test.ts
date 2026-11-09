import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  generateCourseDesignDraft,
  generateRoadmapDraft,
  generateRoadmapSkeletonDraft,
  reviewRoadmapDraftQuality,
  repairCourseDesignDraft,
  runSourceRelevanceCheck
} from "./tutorService";
import { AiProviderError } from "./provider";
import { planningMaterials } from "../learning/planningEvidence";

const providerMock = vi.hoisted(() => ({
  generateText: vi.fn()
}));
const sourceGroundingMock = vi.hoisted(() => ({ groundCourseSource: vi.fn() }));
const savedAiLogs = vi.hoisted(() => new Map<string, Record<string, unknown>>());

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  domain: {
    findUnique: vi.fn(),
    update: vi.fn()
  },
  aiCallLog: {
    create: vi.fn(),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const saved = { ...savedAiLogs.get(where.id), id: where.id, ...data };
      savedAiLogs.set(where.id, saved);
      return saved;
    }),
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => savedAiLogs.get(where.id) || null)
  }
}));

beforeEach(() => savedAiLogs.clear());

vi.mock("../prisma", () => ({
  prisma: prismaMock
}));

vi.mock("./openaiCompatibleProvider", () => ({
  readOpenAiCompatibleConfig: vi.fn(() => ({
    provider: "qwen",
    baseUrl: "https://example.com/v1",
    apiKey: "sk-test",
    model: "glm-5.2",
    temperature: 0.25,
    timeoutMs: 300000,
    maxTokens: 130000
  })),
  createOpenAiCompatibleProvider: vi.fn(() => ({
    config: {
      provider: "qwen",
      baseUrl: "https://example.com/v1",
      apiKey: "sk-test",
      model: "glm-5.2",
      temperature: 0.25,
      timeoutMs: 300000,
      maxTokens: 130000
    },
    generateText: providerMock.generateText
  }))
}));

vi.mock("../learning/sourceGroundingService", () => ({
  groundCourseSource: sourceGroundingMock.groundCourseSource,
  groundCourseSources: vi.fn(async (urls: string[]) =>
    urls.map((url) => ({
      ok: true,
      status: 200,
      finalUrl: url,
      title: `Grounded ${url}`,
      excerpt: `Excerpt for ${url}`
    }))
  )
}));

const uncertainKnowledgeText = JSON.stringify({
  verdict: "uncertain", summary: "本测试没有逐项知识验证证据。", claims: [], findings: [],
  limitations: ["结构校验与来源摘要不能证明具体教学安排或知识正确。"]
});

const critiqueResultText = (draft: unknown, significantIssues = false) =>
  JSON.stringify({
    report: {
      summary: significantIssues ? "仍有问题。" : "整体合格。",
      significantIssues,
      dimensions: [
        { key: "prerequisiteCorrectness", score: 4, note: "先修链正确。" },
        { key: "goalMatch", score: 4, note: "匹配目标。" },
        { key: "cognitiveLoad", score: 4, note: "负荷可控。" },
        { key: "sourceQuality", score: 4, note: "来源可达。" },
        { key: "checkability", score: 4, note: "产出可检验。" }
      ]
    },
    draft
  });

const confirmedCourseDesign = {
  taskBriefSnapshot: "Learn calculus for exam preparation.",
  globalExplanation: {
    theorySkeleton: "Limits precede derivatives and integrals.",
    sourceBasis: "Authoritative calculus courses.",
    optimizationRationale: "Prerequisites first.",
    risksAndValidation: "Check algebra gaps."
  },
  sources: [
    {
      url: "https://example.edu/calculus",
      title: "Calculus",
      reason: "Clear prerequisite order."
    }
  ],
  keyTradeoffs: ["Keep the first pass focused."],
  qualityGate: { passed: true, missing: [] }
};

const courseResearchDomain = {
  id: "domain-1",
  name: "TypeScript React",
  description: "Can build small React components.",
  currentLevel: "Basic JavaScript and React.",
  goal: "Build a typed React application.",
  scope: "TypeScript, React props, async API calls.",
  excludedScope: "Advanced type-level programming.",
  depth: "Project-ready in two weeks.",
  outputType: "Project",
  outputTarget: "A small typed React app.",
  taskBrief: "Design a source-backed TypeScript React learning route.",
  taskBriefConfirmedAt: new Date("2026-07-19T03:00:00.000Z")
};

const incompleteCourseDesign = {
  taskBriefSnapshot: courseResearchDomain.taskBrief,
  globalExplanation: {
    theorySkeleton: "Start from TypeScript's type system, then apply it to React.",
    sourceBasis: "Sources still need repair.",
    optimizationRationale: "Types before component integration.",
    risksAndValidation: "Validate JavaScript and React prerequisites."
  },
  sources: [],
  keyTradeoffs: ["Prefer project relevance over advanced type theory."]
};

const repairedCourseDesign = {
  ...incompleteCourseDesign,
  globalExplanation: {
    ...incompleteCourseDesign.globalExplanation,
    sourceBasis: "Use the TypeScript Handbook and React TypeScript guide."
  },
  sources: [
    {
      url: "https://www.typescriptlang.org/docs/handbook/intro.html",
      title: "TypeScript Handbook",
      reason: "Official language concepts and examples."
    }
  ]
};
const structurallyValidCourseDesign = {
  ...repairedCourseDesign,
  courseDesignVersion: 3,
  knowledgeBoundary: { version: 1, assumedKnowledge: ["基础 JavaScript 与 React"], newKnowledge: ["TypeScript 的类型约束与 React 属性类型"] }
};

describe("course design automatic repair", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sourceGroundingMock.groundCourseSource.mockImplementation(async (url: string) => ({
      ok: true, status: 200, finalUrl: url, title: `Grounded ${url}`, excerpt: `Excerpt for ${url}`
    }));
    let logIndex = 0;
    prismaMock.domain.findUnique.mockResolvedValue(courseResearchDomain);
    prismaMock.aiCallLog.create.mockImplementation(async () => {
      logIndex += 1;
      return { id: `log-${logIndex}` };
    });
    prismaMock.$transaction.mockImplementation((callback) =>
      callback(prismaMock)
    );
    prismaMock.domain.update.mockImplementation(async ({ data }: any) => ({
      courseDesignDraft: data.courseDesignDraft,
      courseDesignStatus: data.courseDesignStatus,
      courseDesignRepairCount: data.courseDesignRepairCount,
      courseDesignConfirmedAt: data.courseDesignConfirmedAt,
      courseDesignAiCallLogId: data.courseDesignAiCallLogId
    }));
  });

  // Superseded contract: repairs a failed cloud research draft before returning it.
// Current equivalents use real SQLite in learningSessionService/roadmapLifecycle tests,
// and tasks/courseQualityBaseline plus current openaiCompatibleProvider contracts; original test retained in before/retired.


  it("stops after two structural repair attempts and keeps map creation blocked", async () => {
    const taskTypes: string[] = [];
    providerMock.generateText.mockImplementation(async (input: any) => {
      taskTypes.push(input.taskType);
      if (input.taskType === "planning_knowledge_check") return { raw: {}, text: uncertainKnowledgeText };
      return {
        raw: {},
        text:
          input.taskType === "course_design_critique"
            ? critiqueResultText(incompleteCourseDesign)
            : JSON.stringify(incompleteCourseDesign)
      };
    });

    const result = await generateCourseDesignDraft("domain-1");

    expect(taskTypes).toEqual([
      "course_design_research",
      "course_design_critique",
      "course_design_repair",
      "course_design_repair",
      "planning_knowledge_check"
    ]);
    expect(result.draft.qualityGate.passed).toBe(false);
    expect(result.draft.knowledgeReview).toMatchObject({ verdict: "uncertain", claims: [], aiCallLogIds: ["log-5"] });
    expect(result.repair).toMatchObject({
      attempted: true,
      attempts: 2,
      totalAttempts: 2,
      succeeded: false
    });
    expect(result.warning).toContain("仍未通过质量门");
    expect(prismaMock.domain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          courseDesignStatus: "incomplete",
          courseDesignRepairCount: 2
        })
      })
    );
  });

  it("keeps the original AI draft blocked when the repair provider fails", async () => {
    providerMock.generateText.mockImplementation(async (input: any) => {
      if (input.taskType === "planning_knowledge_check") return { raw: {}, text: uncertainKnowledgeText };
      if (input.taskType === "course_design_repair") {
        throw new AiProviderError("Repair provider timed out.");
      }
      if (input.taskType === "course_design_critique") {
        return { raw: {}, text: critiqueResultText(incompleteCourseDesign) };
      }
      return { raw: {}, text: JSON.stringify(incompleteCourseDesign) };
    });

    const result = await generateCourseDesignDraft("domain-1");

    expect(result.source).toBe("ai");
    expect(result.draft.qualityGate.passed).toBe(false);
    expect(result.aiCallLogId).toBe("log-1");
    expect(result.repair).toMatchObject({
      attempted: true,
      attempts: 2,
      totalAttempts: 2,
      succeeded: false,
      error: "Repair provider timed out."
    });
    expect(providerMock.generateText).toHaveBeenCalledTimes(5);
    expect(prismaMock.aiCallLog.create).toHaveBeenCalledTimes(5);
    expect(result.draft.knowledgeReview).toMatchObject({ verdict: "uncertain", claims: [], aiCallLogIds: ["log-5"] });
    expect(providerMock.generateText.mock.calls[4][0].taskType).toBe("planning_knowledge_check");
    expect(result.warning).toContain("自动修复失败");
    expect(prismaMock.domain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          courseDesignStatus: "incomplete",
          courseDesignRepairCount: 2,
          courseDesignAiCallLogId: "log-1"
        })
      })
    );
  });

  it("does not treat successful retrieval with only title and excerpt as actual source body", async () => {
    const taskTypes: string[] = [];
    providerMock.generateText.mockImplementation(async (input: { taskType: string }) => {
      taskTypes.push(input.taskType);
      return { raw: {}, text: input.taskType === "planning_knowledge_check" ? uncertainKnowledgeText
        : input.taskType === "course_design_critique" ? critiqueResultText(structurallyValidCourseDesign) : JSON.stringify(structurallyValidCourseDesign) };
    });
    const result = await generateCourseDesignDraft("domain-1");
    expect(result.source).toBe("ai");
    expect(taskTypes).toEqual(["course_design_research", "course_design_critique", "planning_knowledge_check"]);
    expect(sourceGroundingMock.groundCourseSource).toHaveBeenCalledTimes(1);
    expect(result.draft.sources[0].grounding).toMatchObject({ ok: true, title: expect.any(String), excerpt: expect.any(String), bodyRetrieved: false, fragments: [], contentHash: null });
    expect(result.draft.qualityGate.passed).toBe(true);
    expect(result.draft.knowledgeReview).toMatchObject({ verdict: "uncertain", claims: [], materials: [], aiCallLogIds: ["log-3"] });
    expect(prismaMock.aiCallLog.create.mock.calls.map(([input]) => input.data.taskType)).toEqual(taskTypes);
  });

  it("reuses retrieved bodies and reads actual pasted materials by selection without losing learner context", async () => {
    const rawBody = "用户原始正文：类型能描述组件属性的约束。";
    const url = repairedCourseDesign.sources[0].url;
    const sourceBody = "实际取得正文：TypeScript 可为 React 组件 props 声明类型。";
    prismaMock.domain.findUnique.mockResolvedValue({ ...courseResearchDomain,
      entryGuideJson: JSON.stringify({ planningInput: { materials: `${rawBody}\n${url}` } }) });
    sourceGroundingMock.groundCourseSource.mockImplementation(async (value: string) => ({
      ok: true, status: 200, finalUrl: value, title: "实际课程", excerpt: "摘要", fragments: [{ location: "正文段落1", text: sourceBody }]
    }));
    providerMock.generateText.mockImplementation(async (input: { taskType: string }) => ({ raw: {}, text: input.taskType === "planning_knowledge_check" ? uncertainKnowledgeText
      : input.taskType === "course_design_critique" ? critiqueResultText(structurallyValidCourseDesign) : JSON.stringify(structurallyValidCourseDesign) }));
    const result = await generateCourseDesignDraft("domain-1");
    expect(sourceGroundingMock.groundCourseSource).toHaveBeenCalledTimes(1);
    expect(result.draft.sources[0].grounding).toMatchObject({ bodyRetrieved: true, fragments: [{ location: "正文段落1", text: sourceBody }], contentHash: expect.any(String) });
    const researchPrompt = providerMock.generateText.mock.calls[0][0].messages[1].content;
    expect(researchPrompt).toContain(rawBody);
    expect(researchPrompt).toContain(sourceBody);
    expect(researchPrompt).toContain(courseResearchDomain.goal);
    const materials = result.draft.knowledgeReview?.materials || [];
    expect(materials.some(material => material.text.includes(rawBody))).toBe(true);
    expect(materials.some(material => material.text === sourceBody)).toBe(true);
    expect(result.draft.knowledgeReview?.verdict).toBe("uncertain");
    expect(result.draft.qualityGate.passed).toBe(true);
    expect(prismaMock.domain.findUnique.mock.calls.filter(([input]) => input.select?.entryGuideJson)).toHaveLength(2);
  });

  it("clears generated grounding claims when actual retrieval unexpectedly rejects", async () => {
    const fakeBody = "模型自行声称取得的正文，实际抓取没有返回它。";
    const fabricatedDraft = { ...structurallyValidCourseDesign, sources: structurallyValidCourseDesign.sources.map(source => ({
      ...source, grounding: { ok: true, status: 200, title: "模型声称已核验", excerpt: "模型摘要", bodyRetrieved: true, fragments: [{ location: "伪造正文位置", text: fakeBody }] }
    })) };
    sourceGroundingMock.groundCourseSource.mockRejectedValue(new Error("Unexpected retrieval failure"));
    providerMock.generateText.mockImplementation(async (input: { taskType: string }) => ({ raw: {}, text: input.taskType === "planning_knowledge_check" ? uncertainKnowledgeText
      : input.taskType === "course_design_critique" ? critiqueResultText(fabricatedDraft) : JSON.stringify(fabricatedDraft) }));
    const result = await generateCourseDesignDraft("domain-1");
    expect(result.source).toBe("ai");
    expect(result.draft.sources[0].grounding).toMatchObject({ ok: false, bodyRetrieved: false, fragments: [], contentHash: null });
    expect(result.draft.sources[0].grounding?.error).toContain("Unexpected retrieval failure");
    expect(result.draft.knowledgeReview).toMatchObject({ verdict: "uncertain", claims: [], materials: [] });
    const knowledgePrompt = providerMock.generateText.mock.calls.find(([input]) => input.taskType === "planning_knowledge_check")![0].messages[1].content;
    expect(knowledgePrompt).not.toContain(fakeBody);
    expect(sourceGroundingMock.groundCourseSource).toHaveBeenCalledTimes(1);
  });

  it("retains actual user URL retrieval failures even when AI revisions omit all sources", async () => {
    const url = "https://material.example.edu/syllabus";
    prismaMock.domain.findUnique.mockResolvedValue({ ...courseResearchDomain,
      entryGuideJson: JSON.stringify({ planningInput: { materials: url } }) });
    sourceGroundingMock.groundCourseSource.mockResolvedValue({ ok: false, status: null, finalUrl: null, title: null, excerpt: null, fragments: [], error: "正文取得失败" });
    const omitted = { ...structurallyValidCourseDesign, sources: [] };
    providerMock.generateText.mockImplementation(async (input: { taskType: string }) => ({ raw: {}, text: input.taskType === "planning_knowledge_check" ? uncertainKnowledgeText
      : input.taskType === "course_design_critique" ? critiqueResultText(omitted) : JSON.stringify(omitted) }));
    const result = await generateCourseDesignDraft("domain-1");
    expect(result.draft.sources).toHaveLength(1);
    expect(result.draft.sources[0]).toMatchObject({ url, grounding: { bodyRetrieved: false, error: "正文取得失败", fragments: [] } });
    expect(result.draft.knowledgeReview?.materials).toEqual([]);
    expect(sourceGroundingMock.groundCourseSource).toHaveBeenCalledTimes(1);
  });

  it("keeps actual pasted and public snapshots through research, both critiques and repair while rejecting model pasted sources", async () => {
    const actualBody = "实际用户正文：类型约束要按真实组件属性检查。";
    const publicUrl = repairedCourseDesign.sources[0].url, missingUrl = "https://react.dev/learn/typescript";
    const publicBody = "实际公开正文：React props 可使用 TypeScript 类型声明。";
    const rawMaterials = `${actualBody}\n${publicUrl}\n${missingUrl}`;
    const pastedIdentity = planningMaterials({}, rawMaterials)[0].url;
    const fakeSource = { url: pastedIdentity, title: "模型自称公开权威", reason: "模型回填内部身份", grounding: { ok: true, status: 200, title: "已验证", excerpt: "模型摘要", bodyRetrieved: true, fragments: [{ location: "模型编造位置", text: "MODEL_FORGED_PASTED_BODY" }] } };
    const modelDraft = { ...structurallyValidCourseDesign, sources: [fakeSource, { ...fakeSource, url: "pasted:model-invented" }] };
    prismaMock.domain.findUnique.mockResolvedValue({ ...courseResearchDomain,
      entryGuideJson: JSON.stringify({ planningInput: { materials: rawMaterials } }) });
    sourceGroundingMock.groundCourseSource.mockImplementation(async (url: string) => url === missingUrl
      ? { ok: false, status: 403, finalUrl: missingUrl, title: null, excerpt: null, fragments: [], error: "HTTP 403" }
      : { ok: true, status: 200, finalUrl: url, title: "实际公开课程", excerpt: "仅摘要", fragments: [{ location: "实际正文段落 1", text: publicBody }] });
    let critiquePass = 0;
    providerMock.generateText.mockImplementation(async (input: { taskType: string; messages: Array<{ content: string }> }) => {
      const prompt = input.messages[1].content;
      expect(prompt).not.toContain("MODEL_FORGED_PASTED_BODY");
      expect(prompt).not.toContain("pasted:model-invented");
      expect(prompt).toContain(actualBody);
      expect(prompt).toContain(publicBody);
      if (input.taskType === "planning_knowledge_check") return { raw: {}, text: uncertainKnowledgeText };
      if (input.taskType === "course_design_critique") {
        critiquePass += 1;
        return { raw: {}, text: critiqueResultText(critiquePass === 1 ? modelDraft : { ...modelDraft, knowledgeBoundary: undefined }, true) };
      }
      return { raw: {}, text: JSON.stringify(modelDraft) };
    });
    const result = await generateCourseDesignDraft("domain-1");
    expect(result.source).toBe("ai");
    expect(result.repair.error).toBeUndefined();
    expect(result.repair).toMatchObject({ attempts: 1, succeeded: true });
    expect(sourceGroundingMock.groundCourseSource.mock.calls.map(([url]) => url)).toEqual([publicUrl, missingUrl]);
    expect(result.draft.sources.map(source => source.url)).toEqual([publicUrl, missingUrl]);
    expect(result.draft.sources[0].grounding).toMatchObject({ bodyRetrieved: true, fragments: [{ location: "实际正文段落 1", text: publicBody }] });
    expect(result.draft.sources[1].grounding).toMatchObject({ ok: false, status: 403, finalUrl: missingUrl, bodyRetrieved: false, error: "HTTP 403" });
    expect(result.draft.knowledgeReview?.materials?.some(material => material.text === actualBody)).toBe(true);
    expect(result.draft.knowledgeReview?.materials?.some(material => material.text === publicBody)).toBe(true);
    expect(result.draft.knowledgeReview?.materials?.some(material => material.text.includes("MODEL_FORGED"))).toBe(false);
    expect(prismaMock.aiCallLog.create.mock.calls.map(([input]) => input.data.taskType)).toEqual(["course_design_research", "course_design_critique", "course_design_critique", "course_design_repair", "planning_knowledge_check"]);
    expect([...savedAiLogs.values()].some(log => String(log.rawOutput).includes("MODEL_FORGED_PASTED_BODY"))).toBe(true);
    expect(result.draft.qualityGate.passed).toBe(true);
  });

  it("restores actual URL and pasted input for an explicit saved-course repair", async () => {
    const actualBody = "用户真实正文：组件属性类型来自实际约定。", url = repairedCourseDesign.sources[0].url;
    const rawMaterials = `${actualBody}\n${url}`;
    const original = { ...structurallyValidCourseDesign, knowledgeBoundary: undefined, sources: [{ url: "pasted:model-forged", title: "伪造身份", reason: "不是公开URL" }] };
    prismaMock.domain.findUnique.mockResolvedValue({ ...courseResearchDomain,
      entryGuideJson: JSON.stringify({ planningInput: { materials: rawMaterials } }),
      courseDesignDraft: JSON.stringify(original), courseDesignRepairCount: 1, courseDesignAiCallLogId: "original-course-log" });
    sourceGroundingMock.groundCourseSource.mockResolvedValue({ ok: false, status: 404, finalUrl: url, title: null, excerpt: null, fragments: [], error: "HTTP 404" });
    providerMock.generateText.mockImplementation(async (input: { taskType: string; messages: Array<{ content: string }> }) => {
      expect(input.messages[1].content).toContain(actualBody);
      if (input.taskType === "planning_knowledge_check") return { raw: {}, text: uncertainKnowledgeText };
      expect(input.taskType).toBe("course_design_repair");
      expect(input.messages[1].content).toContain("HTTP 404");
      expect(input.messages[1].content).not.toContain("pasted:model-forged");
      return { raw: {}, text: JSON.stringify({ ...structurallyValidCourseDesign, sources: [{ url: "pasted:model-forged-again", title: "模型重新造身份", reason: "不能相信" }] }) };
    });
    const result = await repairCourseDesignDraft("domain-1");
    expect(result.repair.error).toBeUndefined();
    expect(result.repair).toMatchObject({ attempts: 1, totalAttempts: 2, succeeded: true });
    expect(result.draft.knowledgeReview).toMatchObject({ verdict: "uncertain" });
    expect(providerMock.generateText.mock.calls.map(([input]) => input.taskType)).toEqual(["course_design_repair", "planning_knowledge_check"]);
    expect(result.draft.sources).toHaveLength(1);
    expect(result.draft.sources[0]).toMatchObject({ url, grounding: { ok: false, status: 404, error: "HTTP 404", bodyRetrieved: false } });
    expect(planningMaterials(result.draft, rawMaterials)).toEqual(planningMaterials({}, rawMaterials));
    expect(sourceGroundingMock.groundCourseSource).toHaveBeenCalledTimes(1);
  });

  it("still blocks an unrelated unsafe source URL after removing internal pasted declarations", async () => {
    const unsafe = { ...structurallyValidCourseDesign, sources: [{ url: "pasted:model-forged", title: "内部身份", reason: "不能相信" }, { url: "javascript:alert(1)", title: "危险URL", reason: "仍需拒绝" }] };
    sourceGroundingMock.groundCourseSource.mockResolvedValue({ ok: false, status: null, finalUrl: null, title: null, excerpt: null, fragments: [], error: "URL 未通过白名单" });
    providerMock.generateText.mockImplementation(async (input: { taskType: string }) => ({ raw: {}, text: input.taskType === "planning_knowledge_check" ? uncertainKnowledgeText
      : input.taskType === "course_design_critique" ? critiqueResultText(unsafe) : JSON.stringify(unsafe) }));
    const result = await generateCourseDesignDraft("domain-1");
    expect(result.repair.attempts).toBe(2);
    expect(result.draft.qualityGate).toMatchObject({ passed: false, missing: expect.arrayContaining(["unsafe source url"]) });
    expect(result.draft.sources.map(source => source.url)).toEqual(["javascript:alert(1)"]);
    expect(sourceGroundingMock.groundCourseSource.mock.calls.map(([url]) => url)).toEqual(["javascript:alert(1)"]);
  });

  const knowledgeContractReport = {
    summary: "实际引用字段的核对合同夹具。",
    limitations: ["这个模拟只验证报告合同和调用边界，不证明真实教学知识正确。"],
    claims: [{
      key: "prerequisite-check", path: "globalExplanation.risksAndValidation",
      quote: structurallyValidCourseDesign.globalExplanation.risksAndValidation,
      conclusion: "规划要求核对 JavaScript 和 React 的已有基础。", premises: ["目标是 TypeScript React 项目。"],
      applicability: ["仅核对这个实际规划字段。"], verdict: "no_error_found",
      basis: { kind: "derivation", fragmentIds: [], reason: "引用的规划要求与项目使用的 JavaScript、React 基础一致；这不是来源验证。" },
      reason: "未将用户基础声明解释为已掌握。"
    }],
    findings: []
  };
  const structuralResponse = (taskType: string) => taskType === "course_design_critique"
    ? critiqueResultText(structurallyValidCourseDesign) : JSON.stringify(structurallyValidCourseDesign);

  it("repairs a missing findings field using the exact raw and parsed report saved in AiCallLog", async () => {
    const { findings: _findings, ...missingFindings } = knowledgeContractReport;
    const invalidText = JSON.stringify({ ...missingFindings, originalMarker: "saved-report-attempt-one" });
    let knowledgeCalls = 0;
    providerMock.generateText.mockImplementation(async (input: { taskType: string; messages: Array<{ content: string }> }) => {
      if (input.taskType !== "planning_knowledge_check") return { raw: {}, text: structuralResponse(input.taskType) };
      knowledgeCalls += 1;
      if (knowledgeCalls === 1) return { raw: {}, text: invalidText };
      expect(knowledgeCalls).toBe(2);
      const saved = savedAiLogs.get("log-3");
      expect(saved).toMatchObject({ status: "failed", failureStage: "validation", rawOutput: invalidText });
      expect(JSON.parse(saved!.parsedOutputJson as string)).toEqual(JSON.parse(invalidText));
      expect(input.messages[1].content).toContain(`Previous original response data:\n${JSON.stringify(saved!.rawOutput)}`);
      expect(input.messages[1].content).toContain(`Previous parsed candidate data:\n${saved!.parsedOutputJson}`);
      expect(input.messages[1].content).toContain("invalid_planning_knowledge_review");
      return { raw: {}, text: JSON.stringify(knowledgeContractReport) };
    });
    const result = await generateCourseDesignDraft("domain-1");
    expect(result.source).toBe("ai");
    expect(knowledgeCalls).toBe(2);
    expect(prismaMock.aiCallLog.findUnique).toHaveBeenCalledTimes(1);
    expect(prismaMock.aiCallLog.findUnique).toHaveBeenCalledWith({ where: { id: "log-3" }, select: { rawOutput: true, parsedOutputJson: true } });
    expect(result.draft.knowledgeReview).toMatchObject({ verdict: "no_error_found", claims: knowledgeContractReport.claims, findings: [], aiCallLogIds: ["log-3", "log-4"] });
    expect(savedAiLogs.get("log-4")).toMatchObject({ status: "success", rawOutput: JSON.stringify(knowledgeContractReport) });
    expect(savedAiLogs.get("log-3")!.rawOutput).toBe(invalidText);
  });

  it("retains uncertainty and every failed report when all three knowledge calls are invalid", async () => {
    const { findings: _findings, ...missingFindings } = knowledgeContractReport;
    const rawReports: string[] = [];
    let knowledgeCalls = 0;
    providerMock.generateText.mockImplementation(async (input: { taskType: string; messages: Array<{ content: string }> }) => {
      if (input.taskType !== "planning_knowledge_check") return { raw: {}, text: structuralResponse(input.taskType) };
      knowledgeCalls += 1;
      expect(knowledgeCalls).toBeLessThanOrEqual(3);
      if (knowledgeCalls > 1) {
        const previous = savedAiLogs.get(`log-${knowledgeCalls + 1}`)!;
        expect(previous.status).toBe("failed");
        expect(input.messages[1].content).toContain(`Previous original response data:\n${JSON.stringify(previous.rawOutput)}`);
      }
      const text = JSON.stringify({ ...missingFindings, originalMarker: `invalid-report-${knowledgeCalls}` });
      rawReports.push(text);
      return { raw: {}, text };
    });
    const result = await generateCourseDesignDraft("domain-1");
    expect(result.source).toBe("ai");
    expect(knowledgeCalls).toBe(3);
    expect(providerMock.generateText.mock.calls.filter(([input]) => input.taskType === "planning_knowledge_check")).toHaveLength(3);
    expect(prismaMock.aiCallLog.create).toHaveBeenCalledTimes(5);
    expect(prismaMock.aiCallLog.findUnique).toHaveBeenCalledTimes(2);
    expect(result.draft.qualityGate.passed).toBe(true);
    expect(result.draft.knowledgeReview).toMatchObject({ verdict: "uncertain", claims: [], findings: [], aiCallLogIds: ["log-3", "log-4", "log-5"] });
    for (const [index, rawOutput] of rawReports.entries()) {
      expect(savedAiLogs.get(`log-${index + 3}`)).toMatchObject({ status: "failed", failureStage: "validation", rawOutput, parsedOutputJson: rawOutput });
    }
    expect(savedAiLogs.has("log-6")).toBe(false);
    const persistedDraft = JSON.parse(prismaMock.domain.update.mock.calls.at(-1)![0].data.courseDesignDraft);
    expect(persistedDraft.knowledgeReview).toMatchObject({ verdict: "uncertain", aiCallLogIds: ["log-3", "log-4", "log-5"] });
  });

  it("shares three total calls between report repair and an actual teaching-text correction", async () => {
    const path = "globalExplanation.theorySkeleton";
    const quote = structurallyValidCourseDesign.globalExplanation.theorySkeleton;
    const replacement = "Start from JavaScript runtime behavior, then explain TypeScript types and apply them to React.";
    const errorReport = {
      ...knowledgeContractReport,
      claims: [{ ...knowledgeContractReport.claims[0], key: "fixture-correction", path, quote, conclusion: "夹具要求先明确运行时基础。", verdict: "confirmed_error", reason: "夹具用于检验实际更正和预算，不评价真实教学。" }],
      findings: [{ path, quote, replacement, reason: "夹具局部教学文字更正。" }]
    };
    let knowledgeCalls = 0;
    providerMock.generateText.mockImplementation(async (input: { taskType: string; messages: Array<{ content: string }> }) => {
      if (input.taskType !== "planning_knowledge_check") return { raw: {}, text: structuralResponse(input.taskType) };
      knowledgeCalls += 1;
      expect(knowledgeCalls).toBeLessThanOrEqual(3);
      if (knowledgeCalls === 2) return { raw: {}, text: JSON.stringify(errorReport) };
      const { findings: _findings, ...invalidReport } = errorReport;
      if (knowledgeCalls === 3) {
        expect(input.messages[1].content).toContain(replacement);
        expect(input.messages[1].content).toContain("previousCorrections");
        invalidReport.claims = [{ ...invalidReport.claims[0], quote: replacement }];
      }
      return { raw: {}, text: JSON.stringify(invalidReport) };
    });
    const result = await generateCourseDesignDraft("domain-1");
    expect(result.source).toBe("ai");
    expect(knowledgeCalls).toBe(3);
    expect(result.draft.globalExplanation.theorySkeleton).toBe(replacement);
    expect(result.draft.knowledgeReview).toMatchObject({ verdict: "uncertain", aiCallLogIds: ["log-3", "log-4", "log-5"], corrections: [expect.objectContaining({ findings: errorReport.findings })] });
    expect(savedAiLogs.get("log-3")?.status).toBe("failed");
    expect(savedAiLogs.get("log-4")?.status).toBe("success");
    expect(savedAiLogs.get("log-5")?.status).toBe("failed");
    expect(prismaMock.aiCallLog.findUnique).toHaveBeenCalledTimes(1);
    expect(savedAiLogs.has("log-6")).toBe(false);
  });

  it("does not spend report-repair or transport retries on a knowledge provider failure", async () => {
    providerMock.generateText.mockImplementation(async (input: { taskType: string }) => {
      if (input.taskType === "planning_knowledge_check") throw new AiProviderError("knowledge provider unavailable");
      return { raw: {}, text: structuralResponse(input.taskType) };
    });
    const result = await generateCourseDesignDraft("domain-1");
    expect(result.source).toBe("ai");
    expect(providerMock.generateText.mock.calls.filter(([input]) => input.taskType === "planning_knowledge_check")).toHaveLength(1);
    expect(prismaMock.aiCallLog.findUnique).not.toHaveBeenCalled();
    expect(result.draft.knowledgeReview).toMatchObject({ verdict: "uncertain", aiCallLogIds: ["log-3"] });
    expect(savedAiLogs.get("log-3")).toMatchObject({ status: "failed", failureStage: "provider", errorMessage: "knowledge provider unavailable" });
  });

  // Superseded contract: uses the second bounded repair attempt after invalid repair JSON without a hidden provider retry.
// Current equivalents use real SQLite in learningSessionService/roadmapLifecycle tests,
// and tasks/courseQualityBaseline plus current openaiCompatibleProvider contracts; original test retained in before/retired.


  // Superseded contract: bounds transient cloud research retries before returning a blocked fallback.
// Current equivalents use real SQLite in learningSessionService/roadmapLifecycle tests,
// and tasks/courseQualityBaseline plus current openaiCompatibleProvider contracts; original test retained in before/retired.


  // Superseded contract: stops the critique loop early when the report has no significant issues.
// Current equivalents use real SQLite in learningSessionService/roadmapLifecycle tests,
// and tasks/courseQualityBaseline plus current openaiCompatibleProvider contracts; original test retained in before/retired.


  // Superseded contract: binds course sources and the AI call log to provider search evidence.
// Current equivalents use real SQLite in learningSessionService/roadmapLifecycle tests,
// and tasks/courseQualityBaseline plus current openaiCompatibleProvider contracts; original test retained in before/retired.


  it("runs at most two critique passes when issues stay significant", async () => {
    const taskTypes: string[] = [];
    providerMock.generateText.mockImplementation(async (input: any) => {
      taskTypes.push(input.taskType);
      if (input.taskType === "planning_knowledge_check") return { raw: {}, text: uncertainKnowledgeText };
      return {
        raw: {},
        text:
          input.taskType === "course_design_critique"
            ? critiqueResultText(repairedCourseDesign, true)
            : JSON.stringify(repairedCourseDesign)
      };
    });

    const result = await generateCourseDesignDraft("domain-1");

    expect(
      taskTypes.filter((type) => type === "course_design_critique")
    ).toHaveLength(2);
    expect(result.draft.qualityReport?.significantIssues).toBe(true);
  });

  // Superseded contract: keeps the research draft and warns when the critique pass fails.
// Current equivalents use real SQLite in learningSessionService/roadmapLifecycle tests,
// and tasks/courseQualityBaseline plus current openaiCompatibleProvider contracts; original test retained in before/retired.


  // Superseded contract: rejects initial course research when the persisted task brief is not confirmed.
// Current equivalents use real SQLite in learningSessionService/roadmapLifecycle tests,
// and tasks/courseQualityBaseline plus current openaiCompatibleProvider contracts; original test retained in before/retired.


  // Superseded contract: can explicitly retry a persisted incomplete draft and accumulates repair count.
// Current equivalents use real SQLite in learningSessionService/roadmapLifecycle tests,
// and tasks/courseQualityBaseline plus current openaiCompatibleProvider contracts; original test retained in before/retired.


  // Superseded contract: rejects persisted-draft repair after task brief confirmation is invalidated.
// Current equivalents use real SQLite in learningSessionService/roadmapLifecycle tests,
// and tasks/courseQualityBaseline plus current openaiCompatibleProvider contracts; original test retained in before/retired.

});

describe("layered roadmap skeleton quality pipeline", () => {
  const skeletonDraft = {
    planningVersion: 2,
    title: "Calculus roadmap",
    status: "draft",
    stages: [
      {
        key: "limits",
        title: "Limits",
        goal: "Understand limiting behavior.",
        coreTopics: ["limit definition"],
        prerequisiteStageTitles: [],
        prerequisiteStageKeys: [],
        moduleBlueprints: [
          {
            key: "limit-foundations",
            title: "Limit foundations",
            goal: "Explain limits.",
            keyQuestions: [
              {
                key: "limit-meaning",
                question: "What does a limit express?",
                checkableOutcome: "Explain the definition with an example."
              }
            ]
          }
        ]
      }
    ]
  };

  const critiqueText = (blocking = false) =>
    JSON.stringify({
      report: {
        summary: blocking ? "The question is still overloaded." : "Ready for review.",
        blockingIssues: blocking
          ? [
              {
                code: "questionAtomicity",
                targetKey: "limit-meaning",
                message: "The question combines independent abilities.",
                suggestion: "Split it."
              }
            ]
          : [],
        warnings: []
      },
      draft: skeletonDraft
    });

  beforeEach(() => {
    vi.clearAllMocks();
    let logIndex = 0;
    prismaMock.domain.findUnique.mockResolvedValue({
      id: "domain-1",
      name: "Calculus",
      description: "Exam calculus",
      currentLevel: "basic",
      goal: "Master calculus",
      scope: "limits",
      excludedScope: null,
      depth: "exam ready",
      outputType: "roadmap",
      outputTarget: "study plan",
      taskBrief: "Build a calculus route."
    });
    prismaMock.aiCallLog.create.mockImplementation(async () => {
      logIndex += 1;
      return { id: `log-${logIndex}` };
    });
  });

  // Superseded contract: generates a v2 skeleton and always reviews it in a fresh AI call.
// Current equivalents use real SQLite in learningSessionService/roadmapLifecycle tests,
// and tasks/courseQualityBaseline plus current openaiCompatibleProvider contracts; original test retained in before/retired.


  // Superseded contract: uses at most two logged repairs and returns only after critical issues clear.
// Current equivalents use real SQLite in learningSessionService/roadmapLifecycle tests,
// and tasks/courseQualityBaseline plus current openaiCompatibleProvider contracts; original test retained in before/retired.


  it("fails closed instead of returning a confirmable fallback", async () => {
    providerMock.generateText.mockRejectedValue(new Error("provider unavailable"));

    await expect(
      generateRoadmapSkeletonDraft("domain-1", {
        courseDesign: confirmedCourseDesign
      })
    ).rejects.toThrow("provider unavailable");
  });

  // Superseded contract: keeps a deterministic-valid skeleton when only semantic review is unavailable.
// Current equivalents use real SQLite in learningSessionService/roadmapLifecycle tests,
// and tasks/courseQualityBaseline plus current openaiCompatibleProvider contracts; original test retained in before/retired.


  // Superseded contract: reviews an edited persisted Map Draft in a fresh logged call.
// Current equivalents use real SQLite in learningSessionService/roadmapLifecycle tests,
// and tasks/courseQualityBaseline plus current openaiCompatibleProvider contracts; original test retained in before/retired.


  // Superseded contract: accepts a report-only review without asking the reviewer to mutate the draft.
// Current equivalents use real SQLite in learningSessionService/roadmapLifecycle tests,
// and tasks/courseQualityBaseline plus current openaiCompatibleProvider contracts; original test retained in before/retired.


  // Superseded contract: rejects a quality review that expands a Stage the learner did not request.
// Current equivalents use real SQLite in learningSessionService/roadmapLifecycle tests,
// and tasks/courseQualityBaseline plus current openaiCompatibleProvider contracts; original test retained in before/retired.

});

describe("generateRoadmapDraft", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    let logIndex = 0;
    prismaMock.domain.findUnique.mockResolvedValue({
      id: "domain-1",
      name: "Calculus",
      description: "Exam prep",
      currentLevel: "basic algebra",
      goal: "Master core calculus",
      scope: "limits, derivatives, integrals",
      excludedScope: "advanced analysis",
      depth: "exam ready",
      outputType: "roadmap",
      outputTarget: "study plan",
      taskBrief: "Build a calculus roadmap."
    });
    prismaMock.aiCallLog.create.mockImplementation(async () => {
      logIndex += 1;
      return { id: `log-${logIndex}` };
    });
  });

  // Superseded contract: gets a global skeleton first, then expands each stage in order.
// Current equivalents use real SQLite in learningSessionService/roadmapLifecycle tests,
// and tasks/courseQualityBaseline plus current openaiCompatibleProvider contracts; original test retained in before/retired.


  // Superseded contract: retries transient provider failures before using fallback.
// Current equivalents use real SQLite in learningSessionService/roadmapLifecycle tests,
// and tasks/courseQualityBaseline plus current openaiCompatibleProvider contracts; original test retained in before/retired.


  it("uses a domain-specific local fallback when roadmap AI fails", async () => {
    prismaMock.domain.findUnique.mockResolvedValue({
      id: "domain-1",
      name: "TypeScript 编程",
      description: "Need project practice",
      currentLevel: "basic JavaScript",
      goal: "Build a typed web app",
      scope: "TypeScript, React, API calls",
      excludedScope: "backend deployment",
      depth: "project ready",
      outputType: "project",
      outputTarget: "small React app",
      taskBrief: "Build TypeScript project skill."
    });
    providerMock.generateText.mockRejectedValue(new Error("network down"));

    const result = await generateRoadmapDraft("domain-1", {
      courseDesign: confirmedCourseDesign
    });

    expect(result.source).toBe("fallback");
    expect(result.draft.stages?.[0].title).toContain("最小可运行闭环");
    expect(result.draft.stages?.[0].title).toContain("Build a typed web app");
    expect(result.draft.stages?.[2].title).toContain("项目化应用");
    expect(result.draft.stages?.[2].title).toContain("small React app");
    expect(result.draft.stages?.[1].modules?.[0].items?.[0].title).toContain(
      "核心抽象"
    );
    expect(result.draft.stages?.[0].modules?.[0].items?.[0].objective).toContain(
      "small React app"
    );
    expect(result.draft.stages?.[2].modules?.[0].items?.[0].objective).toContain(
      "project"
    );
  });

  it("uses a language-specific fallback scaffold with the learner goal embedded", async () => {
    prismaMock.domain.findUnique.mockResolvedValue({
      id: "domain-1",
      name: "英语口语",
      description: "Need practice for daily speaking",
      currentLevel: "basic conversation",
      goal: "Can hold a 10-minute English conversation",
      scope: "daily topics, self introduction, follow-up questions",
      excludedScope: "business negotiation",
      depth: "daily fluent use",
      outputType: "conversation",
      outputTarget: "10-minute daily dialogue",
      taskBrief: "Build daily speaking ability."
    });
    providerMock.generateText.mockRejectedValue(new Error("network down"));

    const result = await generateRoadmapDraft("domain-1", {
      courseDesign: confirmedCourseDesign
    });

    expect(result.source).toBe("fallback");
    expect(result.draft.stages?.[0].title).toContain("语言使用场景");
    expect(result.draft.stages?.[0].title).toContain("Can hold");
    expect(result.draft.stages?.[0].goal).toContain("daily topics");
    expect(result.draft.stages?.[2].modules?.[0].items?.[0].objective).toContain(
      "10-minute daily dialogue"
    );
    expect(result.draft.stages?.[1].modules?.[1].items?.[0].title).toContain(
      "常见误用"
    );
  });

  it("injects user keywords into the generic fallback instead of returning a blank template", async () => {
    prismaMock.domain.findUnique.mockResolvedValue({
      id: "domain-1",
      name: "设计评审协作",
      description: "Need a reusable team review process",
      currentLevel: "ad hoc",
      goal: "Build a repeatable design review workflow",
      scope: "review agenda, decision criteria, follow-up actions",
      excludedScope: "org-wide governance",
      depth: "team-ready execution",
      outputType: "workflow",
      outputTarget: "a reusable review checklist",
      taskBrief: "Turn reviews into a repeatable workflow."
    });
    providerMock.generateText.mockRejectedValue(new Error("network down"));

    const result = await generateRoadmapDraft("domain-1", {
      courseDesign: confirmedCourseDesign
    });

    expect(result.source).toBe("fallback");
    expect(result.draft.stages?.[0].title).toContain("Build a repeatable");
    expect(result.draft.stages?.[1].title).toContain("review agenda");
    expect(result.draft.stages?.[2].title).toContain("a reusable review");
    expect(result.draft.stages?.[0].goal).toContain("review agenda");
    expect(result.draft.stages?.[2].modules?.[0].items?.[0].objective).toContain(
      "workflow"
    );
  });
});

describe("runSourceRelevanceCheck", () => {
  const reviewDraft = {
    taskBriefSnapshot: "snapshot",
    globalExplanation: {
      theorySkeleton: "x",
      sourceBasis: "y",
      optimizationRationale: "z",
      risksAndValidation: "w"
    },
    sources: [
      {
        url: "https://a.edu",
        title: "A",
        reason: "ra",
        grounding: {
          ok: true,
          status: 200,
          title: "A title",
          excerpt: "A excerpt about TypeScript"
        }
      },
      { url: "https://b.edu", title: "B", reason: "rb" }
    ],
    keyTradeoffs: ["t1"]
  };

  beforeEach(() => {
    vi.clearAllMocks();
    let logIndex = 0;
    prismaMock.domain.findUnique.mockResolvedValue({
      ...courseResearchDomain,
      courseDesignDraft: JSON.stringify(reviewDraft)
    });
    prismaMock.aiCallLog.create.mockImplementation(async () => {
      logIndex += 1;
      return { id: `log-${logIndex}` };
    });
    prismaMock.$transaction.mockImplementation((callback) => callback(prismaMock));
    prismaMock.domain.update.mockImplementation(async ({ data }: any) => data);
  });

  it("merges AI relevance into grounded sources and leaves others untouched", async () => {
    providerMock.generateText.mockResolvedValue({
      raw: {},
      text: JSON.stringify({
        judgments: [
          {
            url: "https://a.edu",
            score: 0.85,
            lowRelevance: false,
            reason: "直接命中目标"
          }
        ]
      })
    });

    const result = await runSourceRelevanceCheck("domain-1");

    expect(result.source).toBe("ai");
    expect(result.aiCallLogId).toBe("log-1");
    const a = result.draft?.sources.find((s) => s.url === "https://a.edu");
    const b = result.draft?.sources.find((s) => s.url === "https://b.edu");
    expect(a?.grounding?.aiRelevance).toEqual({
      score: 0.85,
      lowRelevance: false,
      reason: "直接命中目标"
    });
    expect(b?.grounding?.aiRelevance ?? null).toBeNull();
    expect(providerMock.generateText.mock.calls[0][0]).toMatchObject({
      taskType: "source_relevance_check",
      requiresWebResearch: false
    });
    expect(prismaMock.aiCallLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          taskType: "source_relevance_check",
          domainId: "domain-1"
        })
      })
    );
  });

  it("returns a friendly fallback without calling the model when no grounded content exists", async () => {
    prismaMock.domain.findUnique.mockResolvedValue({
      ...courseResearchDomain,
      courseDesignDraft: JSON.stringify({
        ...reviewDraft,
        sources: [{ url: "https://b.edu", title: "B", reason: "rb" }]
      })
    });

    const result = await runSourceRelevanceCheck("domain-1");

    expect(result.source).toBe("fallback");
    expect(result.warning).toContain("抓取可达");
    expect(providerMock.generateText).not.toHaveBeenCalled();
  });
});
