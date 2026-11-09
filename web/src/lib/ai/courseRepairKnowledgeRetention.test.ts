import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { repairCourseDesignDraft, generateRoadmapSkeletonDraft } from "./tutorService";
import { createLearningDomain } from "../learning/domainService";
import { getCourseDesignState } from "../learning/courseDesignService";
import { currentCourse, currentRoadmap } from "../learning/currentRoadmap.fixture";
import { roadmapDraftToSkeleton } from "../learning/roadmapService";
import { validateCourseDesignDraft } from "./tasks";
import { planningKnowledgeDigest, validateGeneratedPlanningKnowledgeReview } from "./planningKnowledgeReview";
import { AiProviderError } from "./provider";
import { AiLogPersistenceError } from "./generationEvidence";

type Request = { taskType: string; messages: Array<{ content: string }> };
const deps = vi.hoisted(() => ({ client: null as PrismaClient | null, generate: vi.fn() }));
vi.mock("../prisma", () => ({ get prisma() { return deps.client!; } }));
vi.mock("./openaiCompatibleProvider", () => ({
  readOpenAiCompatibleConfig: () => ({ provider: "deepseek", model: "fixture", apiKey: "fixture-secret", baseUrl: "https://example.invalid", temperature: 0.25, timeoutMs: 1000 }),
  createOpenAiCompatibleProvider: (config: unknown) => ({ config, generateText: deps.generate })
}));
vi.mock("../learning/sourceGroundingService", () => ({ groundCourseSource: () => { throw new Error("No network in this fixture"); } }));

let directory: string, db: PrismaClient;
const wrongRule = "内层极限与外层去心极限存在就足以直接使用复合极限法则。";
const correctedRule = "内层极限存在且外层在该极限点连续时，可以使用复合极限法则。";
const rulePath = "globalExplanation.theorySkeleton";
const completeCourse = (rule: string) => ({ ...structuredClone(currentCourse), globalExplanation: { ...currentCourse.globalExplanation, theorySkeleton: rule } });
const limitations = ["构造的协议回归；只检查错误保存与复核合同，不认证模型知识。"];
const knownReport = {
  summary: "仅有两个去心极限存在并不充分。", limitations,
  claims: [{ key: "composition-rule", path: rulePath, quote: wrongRule, conclusion: "两个极限存在就充分。", premises: ["g(x)=0", "F(t)=1（t≠0），F(0)=2"], applicability: ["x趋于0"],
    verdict: "confirmed_error", basis: { kind: "derivation", fragmentIds: [], reason: "g恒为0，所以F(g(x))恒为2，外层去心极限却为1；这满足所列前提而否定结论。" }, reason: "遗漏外层连续等适用条件。" }],
  findings: [{ path: rulePath, quote: wrongRule, replacement: correctedRule, reason: "给出适用的充分条件。" }]
};
function provider(repairedRule: string, knowledgeFails = false, secondUnchanged = false) {
  deps.generate.mockImplementation(async (input: Request) => {
    let value: unknown;
    if (input.taskType === "course_design_repair") value = { ...completeCourse(repairedRule), globalExplanation: { ...completeCourse(repairedRule).globalExplanation, ...(secondUnchanged ? { optimizationRationale: wrongRule } : {}) } };
    else if (input.taskType === "planning_knowledge_check") {
      if (knowledgeFails) throw new AiProviderError("fixture knowledge unavailable", 401);
      value = input.messages[1].content.includes('"scope":"skeleton"')
        ? { summary: "未进行真实知识核验", limitations, claims: [], findings: [] }
        : { summary: "夹具报告：本次未发现错误", limitations, findings: [], claims: [{ key: "current-rule", path: rulePath, quote: repairedRule, conclusion: "按当前引用核对。", premises: [], applicability: ["仅引用字段"], verdict: "no_error_found", basis: { kind: "derivation", fragmentIds: [], reason: "协议夹具，用于检查不能靠新意见清除未改旧错误。" }, reason: "非真实模型结果" }] };
    } else if (input.taskType === "roadmap_skeleton_generation") value = roadmapDraftToSkeleton(currentRoadmap());
    else if (input.taskType === "roadmap_skeleton_critique") value = { report: { reviewPolicyVersion: 1, summary: "协议夹具", blockingIssues: [], warnings: [] } };
    else throw new Error(`Unexpected task ${input.taskType}`);
    return { text: JSON.stringify(value), raw: {} };
  });
}
async function savedKnownError(secondError = false) {
  const domain = await createLearningDomain({ name: "课程修复错误保留夹具", goal: "理解复合极限的使用条件", taskBrief: "解释条件，不把未检查当正确" });
  const incomplete = validateCourseDesignDraft({ ...completeCourse(wrongRule), knowledgeBoundary: undefined,
    globalExplanation: { ...completeCourse(wrongRule).globalExplanation, ...(secondError ? { optimizationRationale: wrongRule } : {}) } });
  expect(incomplete.qualityGate.passed).toBe(false);
  const original = secondError ? { ...knownReport,
    claims: [...knownReport.claims, { ...knownReport.claims[0], key: "second-copy", path: "globalExplanation.optimizationRationale" }],
    findings: [...knownReport.findings, { ...knownReport.findings[0], path: "globalExplanation.optimizationRationale" }] } : knownReport;
  const report = validateGeneratedPlanningKnowledgeReview(original, incomplete, []);
  expect(report.draftDigest).toBe(planningKnowledgeDigest(incomplete));
  const log = await db.aiCallLog.create({ data: { domainId: domain.id, taskType: "planning_knowledge_check", provider: "fixture", model: "fixture", status: "success", inputSummary: "原始已确认错误的协议夹具", rawOutput: JSON.stringify(original), validatedOutputJson: JSON.stringify(report) } });
  const draft = { ...incomplete, knowledgeReview: { ...report, aiCallLogIds: [log.id], materials: [] } };
  await db.domain.update({ where: { id: domain.id }, data: { courseDesignDraft: JSON.stringify(draft), courseDesignStatus: "incomplete", courseDesignAiCallLogId: log.id } });
  return { domain, log };
}
beforeAll(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "englishnode-course-repair-knowledge-"));
  const file = path.join(directory, "isolated.db");
  fs.copyFileSync(path.resolve("prisma/seed.db"), file);
  db = new PrismaClient({ datasources: { db: { url: `file:${file.replace(/\\/g, "/")}` } } });
  deps.client = db;
});
beforeEach(() => { deps.generate.mockReset(); });
afterAll(async () => {
  await db?.$disconnect();
  if (directory && path.dirname(directory) === path.resolve(os.tmpdir())) fs.rmSync(directory, { recursive: true, force: true });
});

describe("explicit course repair preserves independent knowledge evidence", () => {
  it("cannot erase unchanged known knowledge errors by repairing structure and issuing a new no-error opinion", async () => {
    const { domain, log } = await savedKnownError(); provider(wrongRule);
    await repairCourseDesignDraft(domain.id);
    const state = await getCourseDesignState(domain.id);
    expect.soft(state.draft?.qualityGate.passed).toBe(true);
    expect.soft(state.draft?.globalExplanation.theorySkeleton).toBe(wrongRule);
    expect.soft(state.draft?.knowledgeReview?.verdict).toBe("confirmed_error");
    const skeleton = await generateRoadmapSkeletonDraft(domain.id, { courseDesign: state.draft }).then(value => ({ value }), error => ({ error }));
    expect.soft(skeleton).toHaveProperty("error");
    expect.soft(deps.generate.mock.calls.filter(([input]) => input.taskType === "roadmap_skeleton_generation")).toHaveLength(0);
    expect((await db.aiCallLog.findUniqueOrThrow({ where: { id: log.id } })).rawOutput).toBe(log.rawOutput);
  });

  it("independently checks and binds an actually corrected new candidate before saving its knowledge outcome", async () => {
    const { domain, log } = await savedKnownError(); provider(correctedRule);
    await repairCourseDesignDraft(domain.id);
    const state = await getCourseDesignState(domain.id);
    expect.soft(deps.generate.mock.calls.filter(([input]) => input.taskType === "planning_knowledge_check")).toHaveLength(1);
    expect.soft(state.draft?.globalExplanation.theorySkeleton).toBe(correctedRule);
    expect.soft(state.draft?.knowledgeReview?.verdict).toBe("no_error_found");
    expect.soft(state.draft?.knowledgeReview?.draftDigest).toBe(planningKnowledgeDigest(validateCourseDesignDraft(state.draft)));
    expect((await db.aiCallLog.findUniqueOrThrow({ where: { id: log.id } })).rawOutput).toBe(log.rawOutput);
  });

  it("retains the unchanged known error when the new knowledge provider is unavailable", async () => {
    const { domain, log } = await savedKnownError(); provider(wrongRule, true);
    await repairCourseDesignDraft(domain.id);
    const state = await getCourseDesignState(domain.id);
    expect.soft(deps.generate.mock.calls.filter(([input]) => input.taskType === "planning_knowledge_check").length).toBeGreaterThan(0);
    expect.soft(state.draft?.knowledgeReview?.verdict).toBe("confirmed_error");
    expect.soft(state.draft?.globalExplanation.theorySkeleton).toBe(wrongRule);
    expect((await db.aiCallLog.findUniqueOrThrow({ where: { id: log.id } })).rawOutput).toBe(log.rawOutput);
  });

  it("marks an actual replacement as unverified when its knowledge check fails, while retaining the original report", async () => {
    const { domain, log } = await savedKnownError(); provider(correctedRule, true);
    await repairCourseDesignDraft(domain.id);
    const state = await getCourseDesignState(domain.id);
    expect.soft(deps.generate.mock.calls.filter(([input]) => input.taskType === "planning_knowledge_check")).toHaveLength(1);
    expect.soft(state.draft?.knowledgeReview?.verdict).toBe("uncertain");
    expect.soft(state.draft?.knowledgeReview?.draftDigest).toBe(planningKnowledgeDigest(validateCourseDesignDraft(state.draft)));
    expect((await db.aiCallLog.findUniqueOrThrow({ where: { id: log.id } })).rawOutput).toBe(log.rawOutput);
  });

  it("keeps an unchanged error when another originally erroneous field has actually changed", async () => {
    const { domain } = await savedKnownError(true); provider(correctedRule, false, true);
    await repairCourseDesignDraft(domain.id);
    const state = await getCourseDesignState(domain.id);
    expect(state.draft?.globalExplanation.theorySkeleton).toBe(correctedRule);
    expect(state.draft?.knowledgeReview?.verdict).toBe("confirmed_error");
    expect(state.draft?.knowledgeReview?.findings.map(finding => finding.path)).toEqual(["globalExplanation.optimizationRationale"]);
    expect(deps.generate.mock.calls.filter(([input]) => input.taskType === "planning_knowledge_check")).toHaveLength(3);
    const archive = (state.draft?.knowledgeReview as unknown as { corrections: Array<{ originalReport: unknown }> }).corrections[0];
    expect(archive.originalReport).toMatchObject({ verdict: "confirmed_error", findings: expect.arrayContaining([{ ...knownReport.findings[0] }]) });
  });

  it("blocks unsafe rebinding of an old report with a mismatched original fingerprint", async () => {
    const { domain, log } = await savedKnownError(); provider(correctedRule);
    const saved = await db.domain.findUniqueOrThrow({ where: { id: domain.id } });
    const original = JSON.parse(saved.courseDesignDraft!);
    original.knowledgeReview.draftDigest = "mismatched-old-candidate";
    await db.domain.update({ where: { id: domain.id }, data: { courseDesignDraft: JSON.stringify(original) } });
    await expect(repairCourseDesignDraft(domain.id)).rejects.toThrow("无法安全重定位");
    expect((await db.domain.findUniqueOrThrow({ where: { id: domain.id } })).courseDesignDraft).toBe(JSON.stringify(original));
    expect((await db.aiCallLog.findUniqueOrThrow({ where: { id: log.id } })).rawOutput).toBe(log.rawOutput);
  });

  it("distinguishes retained original source evidence from the current request's new material", async () => {
    const { domain, log } = await savedKnownError();
    const row = await db.domain.findUniqueOrThrow({ where: { id: domain.id } });
    const saved = JSON.parse(row.courseDesignDraft!);
    delete saved.knowledgeReview;
    const oldMaterials = [{ id: "original-fragment", text: `ORIGINAL_SOURCE_731：${correctedRule}`, contentHash: "original-hash" }];
    const sourceReport = { ...knownReport, claims: knownReport.claims.map(claim => ({ ...claim, basis: { kind: "source", fragmentIds: ["original-fragment"], reason: "旧正文明确给出外层连续这个充分条件。" } })) };
    const report = { ...validateGeneratedPlanningKnowledgeReview(sourceReport, saved, oldMaterials), materials: oldMaterials, aiCallLogIds: [log.id] };
    await db.domain.update({ where: { id: domain.id }, data: { courseDesignDraft: JSON.stringify({ ...saved, knowledgeReview: report }), entryGuideJson: JSON.stringify({ planningInput: { materials: "CURRENT_MATERIAL_918：当前资料并未核实复合极限命题。", feedback: "按当前原文核对" } }) } });
    provider(wrongRule, true);
    await repairCourseDesignDraft(domain.id);
    const state = await getCourseDesignState(domain.id);
    expect(state.draft?.knowledgeReview).toMatchObject({ verdict: "confirmed_error", materials: oldMaterials, materialsDigest: planningKnowledgeDigest(oldMaterials) });
    const prompt = deps.generate.mock.calls.find(([input]) => input.taskType === "planning_knowledge_check")![0].messages[1].content;
    expect(prompt).toContain("CURRENT_MATERIAL_918");
    expect(prompt).not.toContain("ORIGINAL_SOURCE_731");
    const archive = (state.draft?.knowledgeReview as unknown as { corrections: Array<{ originalReport: unknown }> }).corrections[0];
    expect(archive.originalReport).toEqual(report);
  });

  it("does not publish a repaired course if the knowledge call cannot save its evidence log", async () => {
    const { domain } = await savedKnownError(); provider(correctedRule);
    const original = (await db.domain.findUniqueOrThrow({ where: { id: domain.id } })).courseDesignDraft;
    const createLog = db.aiCallLog.create.bind(db.aiCallLog);
    const spy = vi.spyOn(db.aiCallLog, "create").mockImplementation(args => {
      if (args.data.taskType === "planning_knowledge_check") throw new Error("fixture log persistence failure");
      return createLog(args);
    });
    try {
      await expect(repairCourseDesignDraft(domain.id)).rejects.toBeInstanceOf(AiLogPersistenceError);
      expect((await db.domain.findUniqueOrThrow({ where: { id: domain.id } })).courseDesignDraft).toBe(original);
    } finally { spy.mockRestore(); }
  });
});
