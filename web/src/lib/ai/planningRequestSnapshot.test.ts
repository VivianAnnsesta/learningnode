import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { generateCourseDesignDraft, repairCourseDesignDraft } from "./tutorService";
import { createLearningDomain, updateLearningDomain } from "../learning/domainService";
import { currentCourse } from "../learning/currentRoadmap.fixture";
import { AiProviderError } from "./provider";

type Request = { taskType: string; messages: Array<{ content: string }> };
const deps = vi.hoisted(() => ({ client: null as PrismaClient | null, generate: vi.fn() }));
vi.mock("../prisma", () => ({ get prisma() { return deps.client!; } }));
vi.mock("./openaiCompatibleProvider", () => ({
  readOpenAiCompatibleConfig: () => ({ provider: "deepseek", model: "fixture", apiKey: "fixture-secret", baseUrl: "https://example.invalid", temperature: 0.25, timeoutMs: 1000 }),
  createOpenAiCompatibleProvider: (config: unknown) => ({ config, generateText: deps.generate })
}));
vi.mock("../learning/sourceGroundingService", () => ({ groundCourseSource: () => { throw new Error("No network in this fixture"); } }));

let directory: string, db: PrismaClient;
const originalMaterials = "ORIGINAL_BODY_731：参数表示固定条件，变量在给定条件下变化。";
const originalFeedback = "ORIGINAL_CONCERN_519：不要把选学比较改成必修。";
const course = () => structuredClone(currentCourse);
const reply = (input: Request) => {
  const data = input.taskType === "planning_knowledge_check"
    ? { summary: "协议测试未核实知识", claims: [], findings: [], limitations: ["这里只验证请求证据和保存边界"] }
    : input.taskType === "course_design_critique"
      ? { draft: course(), report: { summary: "协议测试", significantIssues: false, dimensions: ["prerequisiteCorrectness", "goalMatch", "cognitiveLoad", "sourceQuality", "checkability"].map(key => ({ key, score: 4, note: "夹具，不是真实质量判断" })) } }
      : course();
  return { text: JSON.stringify(data), raw: {} };
};
function pauseAt(taskType: string, fail = false) {
  let enter!: () => void, resume!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; });
  const waiting = new Promise<void>(resolve => { resume = resolve; });
  let paused = false;
  deps.generate.mockImplementation(async (input: Request) => {
    if (!paused && input.taskType === taskType) {
      paused = true; enter(); await waiting;
      if (fail) throw new AiProviderError("fixture authentication failure", 401);
    }
    return reply(input);
  });
  return { entered, resume };
}
async function makeDomain() {
  return createLearningDomain({ name: "请求快照夹具", goal: "区分参数与变量", scope: "简单函数图像", taskBrief: "只研究本次范围", planningInput: { materials: originalMaterials, feedback: originalFeedback } });
}
beforeAll(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "englishnode-planning-snapshot-"));
  const file = path.join(directory, "isolated.db");
  fs.copyFileSync(path.resolve("prisma/seed.db"), file);
  db = new PrismaClient({ datasources: { db: { url: `file:${file.replace(/\\/g, "/")}` } } });
  deps.client = db;
});
beforeEach(() => { deps.generate.mockReset().mockImplementation(async (input: Request) => reply(input)); });
afterAll(async () => {
  await db?.$disconnect();
  if (directory && path.dirname(directory) === path.resolve(os.tmpdir())) fs.rmSync(directory, { recursive: true, force: true });
});

describe("planning request snapshots (isolated SQLite and fixture provider)", () => {
  it.each(["goal", "materials", "feedback"] as const)("cannot revive a delayed course after %s changes", async field => {
    const domain = await makeDomain(), gate = pauseAt("course_design_research");
    const pending = generateCourseDesignDraft(domain.id);
    const settled = pending.then(value => ({ value }), error => ({ error }));
    await gate.entered;
    await updateLearningDomain(domain.id, field === "goal" ? { goal: "NEW_GOAL_918" } : { planningInput: { materials: field === "materials" ? "NEW_BODY_918" : originalMaterials, feedback: field === "feedback" ? "NEW_CONCERN_918" : originalFeedback } });
    const before = await db.domain.findUniqueOrThrow({ where: { id: domain.id } });
    gate.resume();
    expect(await settled).toHaveProperty("error");
    const after = await db.domain.findUniqueOrThrow({ where: { id: domain.id } });
    expect(after.courseDesignDraft).toBe(before.courseDesignDraft);
    expect(after.courseDesignStatus).toBe(before.courseDesignStatus);
    expect(await db.aiCallLog.count({ where: { domainId: domain.id } })).toBeGreaterThan(0);
  });

  it("does not overwrite a newer candidate from concurrent requests with identical inputs", async () => {
    const domain = await makeDomain(), gate = pauseAt("course_design_research");
    const pending = generateCourseDesignDraft(domain.id).then(value => ({ value }), error => ({ error }));
    await gate.entered;
    const newer = await generateCourseDesignDraft(domain.id);
    expect(newer.source).toBe("ai");
    const before = await db.domain.findUniqueOrThrow({ where: { id: domain.id } });
    gate.resume();
    expect(await pending).toHaveProperty("error");
    const after = await db.domain.findUniqueOrThrow({ where: { id: domain.id } });
    expect(after.courseDesignAiCallLogId).toBe(before.courseDesignAiCallLogId);
    expect(after.courseDesignDraft).toBe(before.courseDesignDraft);
  });

  it("does not use fallback to overwrite changed planning inputs", async () => {
    const domain = await makeDomain(), gate = pauseAt("course_design_research", true);
    const pending = generateCourseDesignDraft(domain.id).then(value => ({ value }), error => ({ error }));
    await gate.entered;
    await updateLearningDomain(domain.id, { goal: "NEW_GOAL_AFTER_FAILURE" });
    gate.resume();
    expect(await pending).toHaveProperty("error");
    expect((await db.domain.findUniqueOrThrow({ where: { id: domain.id } })).courseDesignDraft).toBeNull();
  });

  it("does not overwrite a newer successful candidate with an older request's fallback", async () => {
    const domain = await makeDomain(), gate = pauseAt("course_design_research", true);
    const pending = generateCourseDesignDraft(domain.id).then(value => ({ value }), error => ({ error }));
    await gate.entered;
    const newer = await generateCourseDesignDraft(domain.id);
    expect(newer.source).toBe("ai");
    const before = await db.domain.findUniqueOrThrow({ where: { id: domain.id } });
    gate.resume();
    expect(await pending).toHaveProperty("error");
    const after = await db.domain.findUniqueOrThrow({ where: { id: domain.id } });
    expect(after.courseDesignDraft).toBe(before.courseDesignDraft);
    expect(after.courseDesignAiCallLogId).toBe(before.courseDesignAiCallLogId);
  });

  it("keeps original learner concern through research, critique and independent knowledge checking", async () => {
    const domain = await makeDomain();
    const result = await generateCourseDesignDraft(domain.id);
    expect(result.source).toBe("ai");
    for (const [input] of deps.generate.mock.calls as Array<[Request]>) {
      expect(input.messages[1].content).toContain(originalFeedback);
      expect(input.messages[1].content).not.toContain("courseDesignDraft");
    }
    const saved = await db.domain.findUniqueOrThrow({ where: { id: domain.id } });
    expect(saved.courseDesignAiCallLogId).toBe(result.aiCallLogId);
  });

  it("uses the same original materials for knowledge checking after an in-flight input edit", async () => {
    const domain = await makeDomain(), gate = pauseAt("course_design_critique");
    const pending = generateCourseDesignDraft(domain.id).then(value => ({ value }), error => ({ error }));
    await gate.entered;
    await updateLearningDomain(domain.id, { planningInput: { materials: "NEW_BODY_SHOULD_NOT_ENTER_827", feedback: originalFeedback } });
    gate.resume();
    await pending;
    const knowledgeCalls = deps.generate.mock.calls.map(([input]) => input as Request).filter(input => input.taskType === "planning_knowledge_check");
    expect(knowledgeCalls).toHaveLength(1);
    expect(knowledgeCalls[0].messages[1].content).toContain(originalMaterials);
    expect(knowledgeCalls[0].messages[1].content).not.toContain("NEW_BODY_SHOULD_NOT_ENTER_827");
  });

  it("does not let an in-flight course repair revive an invalidated candidate", async () => {
    const domain = await makeDomain();
    const incomplete = { ...course(), knowledgeBoundary: undefined };
    await db.domain.update({ where: { id: domain.id }, data: { courseDesignDraft: JSON.stringify(incomplete), courseDesignStatus: "incomplete" } });
    const gate = pauseAt("course_design_repair");
    const pending = repairCourseDesignDraft(domain.id).then(value => ({ value }), error => ({ error }));
    await gate.entered;
    await updateLearningDomain(domain.id, { goal: "NEW_REPAIR_GOAL_971" });
    const before = await db.domain.findUniqueOrThrow({ where: { id: domain.id } });
    gate.resume();
    expect(await pending).toHaveProperty("error");
    const after = await db.domain.findUniqueOrThrow({ where: { id: domain.id } });
    expect(after.courseDesignDraft).toBe(before.courseDesignDraft);
    expect(after.courseDesignStatus).toBe("needs_review");
  });
});
