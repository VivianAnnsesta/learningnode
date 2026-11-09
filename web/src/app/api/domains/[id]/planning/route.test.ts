import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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

function delayFirstEntryRead(domainId: string) {
  let enter!: () => void, resume!: () => void;
  const entered = new Promise<void>(resolve => { enter = resolve; });
  const waiting = new Promise<void>(resolve => { resume = resolve; });
  deps.afterDomainRead = async (args, record) => {
    if (object(object(args)?.where)?.id === domainId && !object(args)?.select) {
      deps.afterDomainRead = null;
      enter(); await waiting;
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

beforeAll(() => {
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
});
beforeEach(() => {
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
afterAll(async () => {
  await db?.$disconnect();
  if (directory && path.dirname(directory) === path.resolve(os.tmpdir())) fs.rmSync(directory, { recursive: true, force: true });
});

describe("real planning entry uses the course service's single current snapshot", () => {
  it("does not merge an earlier entry read's materials and concern into a newer service snapshot", async () => {
    const domain = await makeDomain("已经存在的用户任务书"), gate = delayFirstEntryRead(domain.id);
    const pending = invoke(domain.id);
    await gate.entered;
    await updateLearningDomain(domain.id, { goal: "CURRENT_GOAL_928：从简单函数区分参数与变量", planningInput: { materials: newMaterials, feedback: newFeedback } });
    gate.resume();
    const response = await pending;
    expect(response.ok).toBe(true);
    expect(deps.generateMap).toHaveBeenCalledOnce();
    expect(prompts().length).toBeGreaterThan(1);
    for (const prompt of prompts()) {
      expect(prompt).toContain(newMaterials);
      expect(prompt).toContain(newFeedback);
      expect(prompt).not.toContain(oldMaterials);
      expect(prompt).not.toContain(oldFeedback);
    }
  });

  it("does not overwrite a newly saved user task brief using the entry's older empty brief", async () => {
    const domain = await makeDomain(), gate = delayFirstEntryRead(domain.id);
    const pending = invoke(domain.id);
    await gate.entered;
    await updateLearningDomain(domain.id, { goal: "CURRENT_GOAL_FOR_NEW_BRIEF", taskBrief: newTaskBrief,
      planningInput: { materials: newMaterials, feedback: newFeedback } });
    gate.resume();
    expect((await pending).ok).toBe(true);
    expect((await db.domain.findUniqueOrThrow({ where: { id: domain.id } })).taskBrief).toBe(newTaskBrief);
    for (const prompt of prompts()) expect(prompt).toContain(newTaskBrief);
  });

  it("passes only the explicit current request concern while the service still reads actual saved materials", async () => {
    const domain = await makeDomain(), feedback = "EXPLICIT_REQUEST_CONCERN_362：核查这个质疑，不预设质疑正确。";
    expect((await invoke(domain.id, { feedback })).ok).toBe(true);
    for (const prompt of prompts()) {
      expect(prompt).toContain(feedback);
      expect(prompt).toContain(oldMaterials);
      expect(prompt).not.toContain(oldFeedback);
    }
    expect((await db.domain.findUniqueOrThrow({ where: { id: domain.id } })).taskBrief).toBeNull();
  });
});
