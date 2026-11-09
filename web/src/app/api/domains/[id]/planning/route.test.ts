import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { createLearningDomain, updateLearningDomain } from "../../../../../lib/learning/domainService";
import { currentCourse } from "../../../../../lib/learning/currentRoadmap.fixture";

type ModelInput = { taskType: string; messages: Array<{ content: string }> };
const deps = vi.hoisted(() => ({
  client: null as PrismaClient | null,
  afterDomainRead: null as null | ((args: unknown, record: unknown) => Promise<unknown>),
  generate: vi.fn(), generateMap: vi.fn()
}));
vi.mock("../../../../../lib/prisma", () => ({ get prisma() { return deps.client!; } }));
vi.mock("../../../../../lib/ai/openaiCompatibleProvider", () => ({
  readOpenAiCompatibleConfig: () => ({ provider: "deepseek", model: "fixture", apiKey: "fixture-secret", baseUrl: "https://example.invalid", temperature: 0.25, timeoutMs: 1000 }),
  createOpenAiCompatibleProvider: (config: unknown) => ({ config, generateText: deps.generate })
}));
vi.mock("../../../../../lib/learning/sourceGroundingService", () => ({ groundCourseSource: () => { throw new Error("No network in this fixture"); } }));
// The real planning entry and course service run; only the subsequent map
// generation is outside this request-snapshot regression's scope.
vi.mock("../map/ai-draft/route", () => ({ POST: deps.generateMap }));

let directory: string, db: PrismaClient;
const oldMaterials = "OLD_ENTRY_BODY_731：这段是更新前的材料。";
const oldFeedback = "OLD_ENTRY_CONCERN_519：这段是更新前的意见。";
const newMaterials = "CURRENT_BODY_982：参数是当前选定条件，变量在此条件下变化。";
const newFeedback = "CURRENT_CONCERN_672：保留当前目标范围，选学比较仍然可选。";
const newTaskBrief = "CURRENT_USER_BRIEF_194：用户刚刚明确保存的任务书。";
const object = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

type CaseWorkflow = { ordinal: number; startedAt: number; closed: boolean; gates: Set<() => void>; pending: Set<Promise<unknown>> };
let activeCase: CaseWorkflow | null = null, nextOrdinal = 0, cleanupIncomplete = false, cleanupFailed = false;
let cleanupTask: Promise<void> | null = null;
class FixtureClosedError extends Error { constructor() { super("Planning snapshot fixture is closed."); this.name = "FixtureClosedError"; } }
function ensureOpen(scope: CaseWorkflow) { if (scope.closed) throw new FixtureClosedError(); }
function diagnostic(scope: CaseWorkflow, stage: string, startedAt: number, status: string) {
  console.info("planning-snapshot-stage", JSON.stringify({ case: scope.ordinal, stage, status, durationMs: Math.round((performance.now() - startedAt) * 100) / 100, elapsedMs: Math.round((performance.now() - scope.startedAt) * 100) / 100 }));
}
function phase<T>(scope: CaseWorkflow, stage: string, operation: () => Promise<T>): Promise<T> {
  ensureOpen(scope);
  const startedAt = performance.now();
  const pending = Promise.resolve().then(async () => {
    try {
      ensureOpen(scope);
      const result = await operation();
      ensureOpen(scope);
      diagnostic(scope, stage, startedAt, "completed");
      return result;
    } catch (error) {
      diagnostic(scope, stage, startedAt, scope.closed ? "closed" : "failed");
      throw error;
    }
  });
  scope.pending.add(pending);
  void pending.catch(() => undefined);
  return pending;
}
function workflow(operation: (scope: CaseWorkflow) => Promise<void>) {
  if (!activeCase) throw new Error("Planning snapshot fixture was not initialized.");
  const scope = activeCase;
  const pending = Promise.resolve().then(() => { ensureOpen(scope); return operation(scope); });
  scope.pending.add(pending);
  void pending.catch(() => undefined);
  return pending;
}
function resumeGate(scope: CaseWorkflow, resume: () => void) {
  ensureOpen(scope);
  const startedAt = performance.now(); resume(); diagnostic(scope, "resume", startedAt, "completed");
}

function delayFirstEntryRead(scope: CaseWorkflow, domainId: string) {
  ensureOpen(scope);
  let enter!: () => void, resume!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; });
  const waiting = new Promise<void>(resolve => { resume = resolve; });
  scope.gates.add(() => { enter(); resume(); });
  deps.afterDomainRead = async (args, record) => {
    if (object(object(args)?.where)?.id === domainId && !object(args)?.select) {
      deps.afterDomainRead = null;
      enter(); await waiting;
      ensureOpen(scope);
    }
    return record;
  };
  return { entered, resume };
}
async function makeDomain(taskBrief?: string) {
  return createLearningDomain({ name: "真实规划入口并发夹具", goal: "区分参数与变量", scope: "简单函数", taskBrief,
    planningInput: { materials: oldMaterials, feedback: oldFeedback } });
}
const invoke = (id: string, payload: Record<string, unknown> = {}) => POST(new Request(`http://localhost/api/domains/${id}/planning`, {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
}), { params: Promise.resolve({ id }) });
const prompts = () => deps.generate.mock.calls.map(([input]) => (input as ModelInput).messages[1].content);

beforeAll(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "englishnode-planning-entry-"));
  const database = path.join(directory, "isolated.db");
  fs.copyFileSync(path.resolve("prisma/seed.db"), database);
  db = new PrismaClient({ datasources: { db: { url: `file:${database.replace(/\\/g, "/")}` } } });
  const domain = new Proxy(db.domain, { get(target, property) {
    if (property === "findUnique") return async (args: Parameters<typeof db.domain.findUnique>[0]) => {
      const record = await db.domain.findUnique(args);
      return deps.afterDomainRead ? deps.afterDomainRead(args, record) : record;
    };
    const value = Reflect.get(target, property);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  deps.client = new Proxy(db, { get(target, property) {
    if (property === "domain") return domain;
    const value = Reflect.get(target, property);
    return typeof value === "function" ? value.bind(target) : value;
  } });
  const startedAt = performance.now();
  try { await db.$connect(); }
  finally { console.info("planning-snapshot-fixture-connect", JSON.stringify({ durationMs: Math.round((performance.now() - startedAt) * 100) / 100 })); }
});
beforeEach(() => {
  if (cleanupIncomplete || cleanupFailed) throw new Error("Previous planning fixture cleanup did not complete; mocks will not be reset.");
  activeCase = { ordinal: ++nextOrdinal, startedAt: performance.now(), closed: false, gates: new Set(), pending: new Set() };
  deps.afterDomainRead = null;
  deps.generateMap.mockReset().mockImplementation(async () => Response.json({ reviewState: "passed", fixtureMapBoundary: true }));
  deps.generate.mockReset().mockImplementation(async (input: ModelInput) => {
    const draft = structuredClone(currentCourse);
    const data = input.taskType === "planning_knowledge_check"
      ? { summary: "仅验证入口快照，不评价教学真伪", claims: [], findings: [], limitations: ["合成模型夹具，不是真实质量判断"] }
      : input.taskType === "course_design_critique"
        ? { draft, report: { summary: "入口协议夹具", significantIssues: false, dimensions: ["prerequisiteCorrectness", "goalMatch", "cognitiveLoad", "sourceQuality", "checkability"].map(key => ({ key, score: 4, note: "合成夹具" })) } }
        : draft;
    return { text: JSON.stringify(data), raw: {} };
  });
});
afterEach(async () => {
  const scope = activeCase;
  if (!scope) return;
  activeCase = null;
  scope.closed = true;
  cleanupIncomplete = true;
  cleanupTask = (async () => {
    const startedAt = performance.now();
    try {
      for (const resume of scope.gates) resume();
      await Promise.allSettled([...scope.pending]);
      diagnostic(scope, "drain", startedAt, "completed");
      deps.afterDomainRead = null;
      cleanupIncomplete = false;
    } catch (error) {
      cleanupFailed = true;
      diagnostic(scope, "drain", startedAt, "failed");
      throw error;
    }
  })();
  void cleanupTask.catch(() => undefined);
  await cleanupTask;
});
afterAll(async () => {
  if (cleanupTask) await cleanupTask;
  await db?.$disconnect();
  if (directory && path.dirname(directory) === path.resolve(os.tmpdir())) fs.rmSync(directory, { recursive: true, force: true });
});

describe("real planning entry uses the course service's single current snapshot", () => {
  it("does not merge an earlier entry read's materials and concern into a newer service snapshot", () => workflow(async scope => {
    const domain = await phase(scope, "create", () => makeDomain("已经存在的用户任务书")), gate = delayFirstEntryRead(scope, domain.id);
    const pending = phase(scope, "invoke", () => invoke(domain.id));
    try {
      await phase(scope, "gate", () => gate.entered);
      await phase(scope, "update", () => updateLearningDomain(domain.id, { goal: "CURRENT_GOAL_928：从简单函数区分参数与变量", planningInput: { materials: newMaterials, feedback: newFeedback } }));
      resumeGate(scope, gate.resume);
      const response = await phase(scope, "response", () => pending);
      expect(response.ok).toBe(true);
      expect(deps.generateMap).toHaveBeenCalledOnce();
      expect(prompts().length).toBeGreaterThan(1);
      for (const prompt of prompts()) {
        expect(prompt).toContain(newMaterials);
        expect(prompt).toContain(newFeedback);
        expect(prompt).not.toContain(oldMaterials);
        expect(prompt).not.toContain(oldFeedback);
      }
    } finally { gate.resume(); await Promise.allSettled([pending]); }
  }));

  it("does not overwrite a newly saved user task brief using the entry's older empty brief", () => workflow(async scope => {
    const domain = await phase(scope, "create", () => makeDomain()), gate = delayFirstEntryRead(scope, domain.id);
    const pending = phase(scope, "invoke", () => invoke(domain.id));
    try {
      await phase(scope, "gate", () => gate.entered);
      await phase(scope, "update", () => updateLearningDomain(domain.id, { goal: "CURRENT_GOAL_FOR_NEW_BRIEF", taskBrief: newTaskBrief,
        planningInput: { materials: newMaterials, feedback: newFeedback } }));
      resumeGate(scope, gate.resume);
      expect((await phase(scope, "response", () => pending)).ok).toBe(true);
      expect((await phase(scope, "read-saved", () => db.domain.findUniqueOrThrow({ where: { id: domain.id } }))).taskBrief).toBe(newTaskBrief);
      for (const prompt of prompts()) expect(prompt).toContain(newTaskBrief);
    } finally { gate.resume(); await Promise.allSettled([pending]); }
  }));

  it("passes only the explicit current request concern while the service still reads actual saved materials", () => workflow(async scope => {
    const domain = await phase(scope, "create", () => makeDomain()), feedback = "EXPLICIT_REQUEST_CONCERN_362：核查这个质疑，不预设质疑正确。";
    expect((await phase(scope, "response", () => invoke(domain.id, { feedback }))).ok).toBe(true);
    for (const prompt of prompts()) {
      expect(prompt).toContain(feedback);
      expect(prompt).toContain(oldMaterials);
      expect(prompt).not.toContain(oldFeedback);
    }
    expect((await phase(scope, "read-saved", () => db.domain.findUniqueOrThrow({ where: { id: domain.id } }))).taskBrief).toBeNull();
  }));
});
