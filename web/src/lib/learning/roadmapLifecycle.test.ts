import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from "vitest";
import { currentCourse, currentRoadmap } from "./currentRoadmap.fixture";
import { saveRoadmapDraft } from "./roadmapService";
import { confirmDomainMap } from "./domainMapService";
import { recordMapDraftQualityReview } from "./mapDraftReviewService";
import { createLearningSession, getLearningSession } from "./learningSessionService";
import { createPersonalKnowledge, getPersonalKnowledge } from "./personalKnowledgeService";
import { startLearningActivity } from "./learningActivityService";

const dep = vi.hoisted(() => ({ db: null as PrismaClient | null }));
vi.mock("../prisma", () => ({ get prisma() { return dep.db!; } }));
let db: PrismaClient, root: string;
beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "englishnode-route-v3-"));
  const target = path.join(root, "copy.db");
  fs.copyFileSync(path.resolve("prisma/seed.db"), target);
  db = new PrismaClient({ datasources: { db: { url: `file:${target.replace(/\\/g, "/")}` } } }); dep.db = db;
});
afterAll(async () => { await db.$disconnect(); fs.rmSync(root, { recursive: true, force: true }); });
beforeEach(async () => {
  await db.teachingInteraction.deleteMany(); await db.teachingSegment.deleteMany(); await db.nodeTeachingSession.deleteMany();
  await db.knowledgePoint.updateMany({ data: { currentRevisionId: null } }); await db.knowledgePoint.deleteMany();
  await db.learningProgress.deleteMany(); await db.domain.deleteMany(); await db.aiCallLog.deleteMany();
  await db.domain.create({ data: { id: "d", name: "图像", goal: "判断根数", courseDesignStatus: "draft", courseDesignDraft: JSON.stringify(currentCourse), courseDesignAiCallLogId: "course-log" } });
  await db.aiCallLog.create({ data: { id: "course-log", domainId: "d", provider: "fixture", taskType: "course_design_research", status: "success", inputSummary: "模拟课程规划，非真实模型证据" } });
});
async function accept(expanded = false, revision = 0) {
  const saved = await saveRoadmapDraft("d", { ...currentRoadmap(expanded), baseRevision: revision }, "course-log");
  await recordMapDraftQualityReview({ domainId: "d", scope: expanded && revision === 1 ? "stage" : "map", stageKey: expanded ? "graph" : undefined, draft: saved.draft, baseRevision: revision, courseDesignAiCallLogId: "course-log", report: { status: "passed", summary: "模拟复核", blockingIssues: [], warnings: [] } });
  return confirmDomainMap("d", saved.draft, "接受已看到的具体范围、安排及资料缺口", currentCourse);
}
describe("当前路线的正式确认和历史保留", () => {
  it("只有名称目标也可形成草稿；确认前没有地图；一次正式接受记录版本", async () => {
    const draft = await saveRoadmapDraft("d", currentRoadmap(), "course-log");
    expect(await db.unit.count()).toBe(0); expect(await db.learningNode.count()).toBe(0);
    expect((await db.domain.findUniqueOrThrow({where:{id:"d"}})).taskBriefConfirmedAt).toBeNull();
    await expect(confirmDomainMap("d", draft.draft, "", currentCourse)).rejects.toThrow("明确确认");
    await expect(confirmDomainMap("d", draft.draft, "接受", currentCourse)).rejects.toThrow("复审");
    await accept();
    const domain = await db.domain.findUniqueOrThrow({ where: { id: "d" } });
    expect(domain.mapRevision).toBe(1); expect(domain.taskBriefConfirmedAt).toBeInstanceOf(Date);
    expect(domain.courseDesignStatus).toBe("confirmed"); expect(await db.learningNode.count()).toBe(0);
    expect(await db.learningProgress.count({ where: { status: "map_confirmed" } })).toBe(1);
  });
  it("渐进展开保留稳定身份，只保存明确依赖；过期草稿不能覆盖", async () => {
    await accept(); await accept(true, 1);
    const nodes = await db.learningNode.findMany({ orderBy: { orderIndex: "asc" } });
    expect(nodes.map(n => n.status)).toEqual(["available", "available"]);
    expect(await db.learningNodeDependency.count()).toBe(1);
    await expect(saveRoadmapDraft("d", { ...currentRoadmap(true), baseRevision: 1 }, "course-log")).rejects.toThrow("地图已更新");
    await startLearningActivity(nodes[0].id); await accept(true, 2);
    const after = await db.learningNode.findMany({ orderBy: { orderIndex: "asc" } });
    expect(after.map(n => n.id)).toEqual(nodes.map(n => n.id)); expect(after[0].status).toBe("in_progress");
  });
  it("移除已开始任务仍保留会话、原任务、个人修订和动作审计", async () => {
    await accept(true); const nodes = await db.learningNode.findMany({ orderBy: { orderIndex: "asc" } });
    const removed = nodes[0]; await startLearningActivity(removed.id);
    const session = (await createLearningSession({ requestId: "old-route", nodeId: removed.id, domainId: "d" })).session;
    const record = await createPersonalKnowledge({ requestId: "p", title: "参数的疑问", body: "我想确认变量与参数", recordKind: "question", nodeIds: [removed.id], sources: [{ kind: "session", sessionId: session.id }] });
    const candidate = {...currentRoadmap(true),baseRevision:1};
    const stage = candidate.stages[0], remaining = stage.modules[0].items[1];
    remaining.prerequisiteKeys = [];
    remaining.concept!.learningUnit!.teachingTasks = ["区分参数与变量", "处理临界交点的重复计数"];
    remaining.concept!.learningUnit!.contentContributions![0].requirementIndices = [0, 1]; stage.modules[0].items = [remaining];
    const saved = await saveRoadmapDraft("d", candidate, "course-log");
    await recordMapDraftQualityReview({ domainId: "d", scope: "map", draft: saved.draft, baseRevision: 1, courseDesignAiCallLogId: "course-log", report: { status: "passed", summary: "确认前查看移除差异", blockingIssues: [], warnings: [] } });
    await confirmDomainMap("d", saved.draft, "确认移除当前任务并沿用保留的历史", currentCourse);
    expect(await db.learningNode.findUnique({ where: { id: removed.id } })).toBeNull();
    const history = (await getLearningSession(session.id)).session;
    expect(history.nodeId).toBeNull(); expect(JSON.stringify(history.context)).toContain(removed.title);
    expect((await getPersonalKnowledge(record.knowledgePoint.id)).knowledgePoint.body).toBe("我想确认变量与参数");
    expect(await db.learningProgress.count({ where: { nodeId: null, status: "in_progress" } })).toBe(1);
  });
  it("草稿或课程依据变化必须重新复核，旧格式不得直接进入新正式地图", async () => {
    await accept(); const saved = await saveRoadmapDraft("d", { ...currentRoadmap(true), baseRevision: 1 }, "course-log");
    await recordMapDraftQualityReview({ domainId: "d", scope: "stage", stageKey: "graph", draft: saved.draft, baseRevision: 1, courseDesignAiCallLogId: "course-log", report: { status: "passed", summary: "模拟", blockingIssues: [], warnings: [] } });
    saved.draft.stages[0].goal = "新的目标范围"; await saveRoadmapDraft("d", saved.draft, "course-log");
    await expect(confirmDomainMap("d", saved.draft, "接受", currentCourse)).rejects.toThrow("重新复审");
    await expect(saveRoadmapDraft("d", { ...currentRoadmap(), planningVersion: 2 }, "course-log")).rejects.toThrow("新版");
    await db.domain.update({ where: { id: "d" }, data: { courseDesignAiCallLogId: "changed" } });
    await expect(saveRoadmapDraft("d", saved.draft, "course-log")).rejects.toThrow("已更新");
  });
});
