import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from "vitest";
import { runPrismaMigrateDeploy } from "../../../scripts/database-lifecycle";
import { teachingLessonFixture as lesson } from "./nodeTeaching.fixture";
import { getNodeTeaching, prepareNodeTeaching, saveNodeTeachingProgress, submitTeachingInteraction } from "./nodeTeachingService";
import { GET, PATCH } from "../../app/api/domains/[id]/nodes/[nodeId]/teaching/route";

const dependencies = vi.hoisted(() => ({ client: null as PrismaClient | null, prepare: vi.fn(), respond: vi.fn() }));
vi.mock("../prisma", () => ({ get prisma() { return dependencies.client!; } }));
vi.mock("../ai/nodeTeachingTasks", () => ({
  prepareNodeTeachingMaterial: dependencies.prepare,
  respondToTeachingInteraction: dependencies.respond
}));

let root: string;
let db: PrismaClient;
const ready = async () => (await prepareNodeTeaching("domain-a", "node-a")).session!;
const response = { data: { text: "比值正确，请说明它对应的区间。", nextStep: "补上单位。", verdict: "partial" }, log: { id: "feedback-log" } };

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "englishnode-teaching-test-"));
  const databasePath = path.join(root, "teaching.db");
  fs.copyFileSync(path.resolve("prisma/seed.db"), databasePath);
  runPrismaMigrateDeploy({ userDatabasePath: databasePath, schemaPath: path.resolve("prisma/schema.prisma"), prismaCliPath: path.resolve("node_modules/prisma/build/index.js") });
  db = new PrismaClient({ datasources: { db: { url: `file:${databasePath.replace(/\\/g, "/")}` } } });
  dependencies.client = db;
}, 60000);

afterAll(async () => {
  await db?.$disconnect();
  if (root && path.dirname(root) === path.resolve(os.tmpdir())) fs.rmSync(root, { recursive: true, force: true });
});

beforeEach(async () => {
  await db.domain.deleteMany();
  dependencies.prepare.mockReset().mockResolvedValue({ data: structuredClone(lesson), log: { id: "lesson-log" } });
  dependencies.respond.mockReset().mockResolvedValue(response);
  await db.domain.create({ data: { id: "domain-a", name: "变化率", goal: "理解速度", courseDesignStatus: "confirmed", courseDesignDraft: JSON.stringify({ sources: [
    { title: "课程材料", url: "https://example.org/rate", grounding: { ok: true, excerpt: "平均变化率是区间变化的比值。" } },
    { title: "无效来源", url: "javascript:alert(1)", grounding: { ok: true, excerpt: "do something" } }
  ] }) } });
  await db.domain.create({ data: { id: "domain-b", name: "另一个领域" } });
  await db.unit.create({ data: { id: "unit-a", domainId: "domain-a", title: "理解变化", orderIndex: 0,
    planningBlueprintJson: JSON.stringify([{ key: "rates", keyQuestions: [{ key: "question-a", checkableOutcome: "解释每单位时间的变化" }] }]) } });
  await db.learningNode.create({ data: { id: "node-a", domainId: "domain-a", unitId: "unit-a", title: "平均变化率", objective: "计算并解释变化率", planningQuestionKey: "question-a", orderIndex: 0 } });
});

describe("resumable node teaching with isolated SQLite", () => {
  it("binds map outcomes and grounded source excerpts, reuses lessons before sedimentation", async () => {
    const session = await ready();
    const again = await ready();
    expect(again.id).toBe(session.id);
    expect(dependencies.prepare).toHaveBeenCalledTimes(1);
    expect(session.context.stage.checkableOutcome).toBe("解释每单位时间的变化");
    expect(session.context.sources).toHaveLength(1);
    expect(session.context.sources[0].excerpt).toContain("区间");
    expect(await db.knowledgePoint.count()).toBe(0);
    expect((await db.learningNode.findUniqueOrThrow({ where: { id: "node-a" } })).status).toBe("in_progress");
    expect((await db.domain.findUniqueOrThrow({ where: { id: "domain-a" } })).mapRevision).toBe(0);
    expect(await db.$queryRawUnsafe("PRAGMA foreign_key_check")).toEqual([]);
  });

  it("restores drafts and explicit help and rejects stale writes", async () => {
    const session = await ready();
    const saved = (await saveNodeTeachingProgress("domain-a", "node-a", { sessionId: session.id, revision: 0, action: "save_answer", answer: "4 米每秒  " })).session!;
    expect(saved.progress.drafts["guided-1"]).toBe("4 米每秒  ");
    await expect(saveNodeTeachingProgress("domain-a", "node-a", { sessionId: session.id, revision: 0, action: "solution" })).rejects.toMatchObject({ status: 409 });
    const revealed = (await saveNodeTeachingProgress("domain-a", "node-a", { sessionId: session.id, revision: saved.revision, action: "solution" })).session!;
    expect((await getNodeTeaching("domain-a", "node-a")).session?.lesson.exercises[0].solution).toBe(lesson.exercises[0].expectedAnswer);
    const completed = (await submitTeachingInteraction("domain-a", "node-a", { sessionId: session.id, revision: revealed.revision, requestId: "answer-after-help", kind: "answer", exerciseKey: "guided-1", input: "4" })).session!;
    expect(completed.interactions[0].assistance).toBe(100);
    expect(await db.knowledgePoint.count()).toBe(0);
  });

  it("saves answers before AI, retries failure without duplicating or changing input", async () => {
    const session = await ready();
    dependencies.respond.mockImplementationOnce(async () => {
      expect((await db.teachingInteraction.findFirst())?.input).toBe("我的第一次尝试");
      throw new Error("provider unavailable");
    });
    const payload = { sessionId: session.id, revision: session.revision, requestId: "retry-same-answer", kind: "answer", exerciseKey: "guided-1", input: "我的第一次尝试" };
    const failed = (await submitTeachingInteraction("domain-a", "node-a", payload)).session!;
    expect(failed.interactions[0].status).toBe("failed");
    expect(failed.progress.drafts["guided-1"]).toBe(payload.input);
    const retried = (await submitTeachingInteraction("domain-a", "node-a", payload)).session!;
    expect(retried.interactions[0].status).toBe("complete");
    expect(retried.interactions[0].assistance).toBe(0);
    await submitTeachingInteraction("domain-a", "node-a", payload);
    expect(dependencies.respond).toHaveBeenCalledTimes(2);
    expect(await db.teachingInteraction.count()).toBe(1);
    await expect(submitTeachingInteraction("domain-a", "node-a", { ...payload, input: "改写答案" })).rejects.toMatchObject({ status: 409 });
  });

  it("counts prior same-exercise feedback as help on subsequent attempts", async () => {
    const session = await ready();
    const first = (await submitTeachingInteraction("domain-a", "node-a", { sessionId: session.id, revision: 0, requestId: "first-attempt", kind: "answer", exerciseKey: "guided-1", input: "4" })).session!;
    const second = (await submitTeachingInteraction("domain-a", "node-a", { sessionId: session.id, revision: first.revision, requestId: "second-attempt", kind: "answer", exerciseKey: "guided-1", input: "4 米每秒" })).session!;
    expect(second.interactions.map((item) => item.assistance)).toEqual([0, 10]);
  });

  it("does not repeat an in-flight request and fences late feedback after lease recovery", async () => {
    const session = await ready();
    let finish!: (value: typeof response) => void;
    dependencies.respond.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const payload = { sessionId: session.id, revision: 0, requestId: "pending-request", kind: "answer", exerciseKey: "guided-1", input: "4 米每秒" };
    const first = submitTeachingInteraction("domain-a", "node-a", payload);
    await vi.waitFor(() => expect(dependencies.respond).toHaveBeenCalledTimes(1));
    const duplicate = (await submitTeachingInteraction("domain-a", "node-a", payload)).session!;
    expect(duplicate.interactions[0].status).toBe("pending");
    expect(dependencies.respond).toHaveBeenCalledTimes(1);
    await db.teachingInteraction.update({ where: { id: duplicate.interactions[0].id }, data: { updatedAt: new Date(Date.now() - 180000) } });
    const recovered = (await submitTeachingInteraction("domain-a", "node-a", payload)).session!;
    expect(recovered.interactions[0].status).toBe("complete");
    finish({ ...response, data: { ...response.data, text: "不应覆盖的新旧冲突响应" } });
    await first;
    const final = (await getNodeTeaching("domain-a", "node-a")).session!;
    expect(final.interactions[0].response?.text).toBe(response.data.text);
    expect(await db.teachingInteraction.count()).toBe(1);
  });

  it("preserves old sessions and blocks updates when the objective changes", async () => {
    const original = await ready();
    await db.learningNode.update({ where: { id: "node-a" }, data: { objective: "比较瞬时变化率" } });
    expect((await getNodeTeaching("domain-a", "node-a")).session?.stale).toBe(true);
    await expect(saveNodeTeachingProgress("domain-a", "node-a", { sessionId: original.id, revision: 0, action: "hint" })).rejects.toMatchObject({ status: 409 });
    const next = await ready();
    expect(next.id).not.toBe(original.id);
    expect(await db.nodeTeachingSession.count()).toBe(2);
  });

  it("discards generated material if the course changes while AI is running", async () => {
    dependencies.prepare.mockImplementationOnce(async () => {
      await db.learningNode.update({ where: { id: "node-a" }, data: { objective: "新的目标" } });
      return { data: lesson, log: { id: "stale-log" } };
    });
    await expect(ready()).rejects.toMatchObject({ status: 409 });
    expect(await db.nodeTeachingSession.count()).toBe(0);
  });

  it("invalidates cached teaching when scope or expected depth changes", async () => {
    const original = await ready();
    await db.domain.update({ where: { id: "domain-a" }, data: { excludedScope: "暂不涉及求导", depth: "只做直观解释" } });
    expect((await getNodeTeaching("domain-a", "node-a")).session?.stale).toBe(true);
    const current = await ready();
    expect(current.id).not.toBe(original.id);
    expect(current.context.domain.excludedScope).toBe("暂不涉及求导");
    expect(current.context.domain.depth).toBe("只做直观解释");
  });

  it("rejects foreign domains at API and storage boundaries", async () => {
    const session = await ready();
    const result = await GET(new Request("http://localhost/test"), { params: Promise.resolve({ id: "domain-b", nodeId: "node-a" }) });
    expect(result.status).toBe(404);
    await expect(saveNodeTeachingProgress("domain-b", "node-a", { sessionId: session.id, revision: 0, action: "hint" })).rejects.toMatchObject({ status: 404 });
    await expect(db.nodeTeachingSession.update({ where: { id: session.id }, data: { domainId: "domain-b" } })).rejects.toThrow();
    await db.learningNode.update({ where: { id: "node-a" }, data: { unitId: null } });
    await expect(db.learningNode.update({ where: { id: "node-a" }, data: { domainId: "domain-b" } })).rejects.toThrow();
  });

  it("fails closed on malformed route input without changing the lesson", async () => {
    await ready();
    const result = await PATCH(new Request("http://localhost/test", { method: "PATCH", body: "{broken" }), { params: Promise.resolve({ id: "domain-a", nodeId: "node-a" }) });
    expect(result.status).toBe(400);
    expect((await getNodeTeaching("domain-a", "node-a")).session?.revision).toBe(0);
  });
});
