import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { currentCourse, currentRoadmap } from "../learning/currentRoadmap.fixture";
import { saveCourseDesignDraft, getCourseDesignState, confirmCourseDesign } from "../learning/courseDesignService";
import { canonicalMapDraftDigest, recordMapDraftQualityReview, getBoundMapDraftReview, evaluateMapDraftReview, assertPassingMapDraftReview, resolveMapDraftQualityReview } from "../learning/mapDraftReviewService";
import { roadmapDraftToSkeleton, roadmapSkeletonToDraft, validateRoadmapInput } from "../learning/roadmapService";
import { createLearningSession, prepareLearningSession } from "../learning/learningSessionService";
import { validateLearningFramework } from "../learning/flexibleTeaching";
import type { CourseContentQuestion } from "../learning/roadmapPlanningTypes";
import type { MapDraftQualityReport, CourseDesignDraft } from "./tasks";
import type { PlanningKnowledgeReview, PlanningKnowledgeVerdict } from "./planningKnowledgeReview";

const deps = vi.hoisted(() => ({ client: null as PrismaClient | null, run: vi.fn() }));
vi.mock("../prisma", () => ({ get prisma() { return deps.client!; } }));
vi.mock("./tutorService", () => ({ runJsonTask: deps.run }));
let temporaryRoot: string, db: PrismaClient;
const knowledge = (verdict: PlanningKnowledgeVerdict): PlanningKnowledgeReview => ({
  reviewVersion: 1, draftDigest: "fixture-candidate-digest", materialsDigest: "fixture-materials-digest",
  verdict, summary: verdict === "confirmed_error" ? "协议夹具：明确主张错误尚未修正" : "协议夹具：资料不足，未认证知识正确性",
  limitations: ["这里只验证状态边界，不评价真实知识"], claims: [], findings: []
});
const quality = (verdict: PlanningKnowledgeVerdict): MapDraftQualityReport => ({ status: "passed", summary: "仅结构通过", blockingIssues: [], warnings: [], knowledgeReview: knowledge(verdict) });
const frame = (requiredOutput = "none") => ({
  title: "参数与交点", purpose: "解释参数", scope: "图像计数", mainIdea: "区分参数和未知数",
  prerequisites: [], limitations: ["协议夹具，非知识认证"],
  segments: [{ key: "observe", title: "比较角色", goal: "理解角色", steps: [{ key: "compare", goal: "解释角色", requiredOutput, contentAssignments: [{ contentQuestionKey: "cq-count", requirementIndices: [0] }] }] }]
});

beforeAll(async () => {
  temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "englishnode-planning-reliability-"));
  const file = path.join(temporaryRoot, "isolated.db");
  fs.copyFileSync(path.resolve("prisma/seed.db"), file);
  db = new PrismaClient({ datasources: { db: { url: `file:${file.replace(/\\/g, "/")}` } } });
  deps.client = db;
});
afterAll(async () => {
  await db?.$disconnect();
  if (temporaryRoot && path.dirname(temporaryRoot) === path.resolve(os.tmpdir())) fs.rmSync(temporaryRoot, { recursive: true, force: true });
});
beforeEach(async () => {
  await db.nodeTeachingSession.deleteMany();
  await db.domain.deleteMany();
  const draft = validateRoadmapInput({ ...currentRoadmap(), baseRevision: 0 });
  await db.domain.create({ data: { id: "reliability-domain", name: "图像", goal: "我有高中函数基础，希望区分参数并判断交点数量", currentLevel: "未知", learningGoalsJson: JSON.stringify(draft.learningGoals), roadmapDraftJson: JSON.stringify(draft), roadmapDraftCourseDesignAiCallLogId: "course-log", courseDesignAiCallLogId: "course-log", courseDesignStatus: "draft", courseDesignDraft: JSON.stringify(currentCourse) } });
  deps.run.mockReset().mockImplementation(async (task: { taskType: string; validate: (v: unknown) => unknown }) => ({ data: task.validate(task.taskType === "node_knowledge_check" ? { verdict: "uncertain", summary: "协议夹具，没有权威知识证明", uncertainty: "资料未完成独立验证", findings: [] } : frame()), log: { id: "fixture-log" }, aiCallLogIds: ["fixture-log"] }));
});

describe("planning reliability integrated service boundaries (isolated SQLite, fixture model)", () => {
  it("retains independent unknown evidence on course save/read without changing structural success", async () => {
    const draft: CourseDesignDraft = { ...currentCourse, knowledgeReview: knowledge("uncertain") };
    const saved = await saveCourseDesignDraft("reliability-domain", { draft, aiCallLogId: "course-log" });
    expect(saved.draft?.qualityGate.passed).toBe(true);
    expect(saved.draft?.knowledgeReview?.verdict).toBe("uncertain");
    const restored = await getCourseDesignState("reliability-domain");
    expect(restored.draft?.knowledgeReview).toEqual(draft.knowledgeReview);
    expect(deps.run).not.toHaveBeenCalled();
    expect((await db.domain.findUniqueOrThrow({ where: { id: "reliability-domain" } })).courseDesignDraft).toContain("协议夹具：资料不足");
  });

  it("blocks course acceptance for unresolved facts even if structural quality passed", async () => {
    await saveCourseDesignDraft("reliability-domain", { draft: { ...currentCourse, knowledgeReview: knowledge("confirmed_error") }, aiCallLogId: "course-log" });
    await expect(confirmCourseDesign("reliability-domain")).rejects.toThrow("明确知识错误");
    expect((await db.domain.findUniqueOrThrow({ where: { id: "reliability-domain" } })).courseDesignStatus).toBe("draft");
    expect(await db.aiCallLog.count({ where: { provider: "user" } })).toBe(0);
  });

  it("a passing structural map receipt cannot accept or dismiss an unresolved knowledge error", async () => {
    const domain = await db.domain.findUniqueOrThrow({ where: { id: "reliability-domain" } });
    const draft = JSON.parse(domain.roadmapDraftJson!);
    const row = await recordMapDraftQualityReview({ domainId: domain.id, scope: "skeleton", draft, baseRevision: 0, courseDesignAiCallLogId: "course-log", report: quality("confirmed_error"), aiCallLogIds: ["knowledge-error-log"] });
    expect(row.status).toBe("passed");
    expect(JSON.parse(row.reportJson).knowledgeReview.acceptedDraftHash).toBe(canonicalMapDraftDigest(draft));
    const binding = { draft, baseRevision: 0, courseDesignAiCallLogId: "course-log", review: row };
    expect(evaluateMapDraftReview(binding)).toBe("blocked");
    expect(() => assertPassingMapDraftReview(binding)).toThrow("MAP_QUALITY_BLOCKED");
    await expect(resolveMapDraftQualityReview({ domainId: domain.id, reviewId: row.id, decision: "dismiss_semantic", rationale: "不想再检查，希望跳过明确错误" })).rejects.toThrow("不能用结构裁决代替事实更正");
    expect((await db.mapDraftQualityReview.findUniqueOrThrow({ where: { id: row.id } })).resolutionJson).toBeNull();
    expect(await db.learningNode.count()).toBe(0);
  });

  it("material uncertainty stays separately readable while draft and version binding remain enforceable", async () => {
    const domain = await db.domain.findUniqueOrThrow({ where: { id: "reliability-domain" } }), draft = JSON.parse(domain.roadmapDraftJson!);
    const row = await recordMapDraftQualityReview({ domainId: domain.id, scope: "skeleton", draft, baseRevision: 0, courseDesignAiCallLogId: "course-log", report: quality("uncertain") });
    const restored = await getBoundMapDraftReview(domain.id);
    expect(restored?.status).toBe("passed");
    expect(restored?.report?.knowledgeReview?.verdict).toBe("uncertain");
    const binding = { draft, baseRevision: 0, courseDesignAiCallLogId: "course-log", review: row };
    expect(evaluateMapDraftReview(binding)).toBe("passed");
    expect(evaluateMapDraftReview({ ...binding, baseRevision: 1 })).toBe("stale");
    expect(evaluateMapDraftReview({ ...binding, draft: { ...draft, title: "另一个候选" } })).toBe("stale");
    expect(await db.learningNode.count()).toBe(0);
  });

  it("preserves ordering rationale across skeleton, complete draft and restored skeleton", () => {
    const skeleton = roadmapDraftToSkeleton(currentRoadmap());
    skeleton.stages[0].rationale = "先比较图像更容易理解，其他教学次序也可行。";
    const draft = validateRoadmapInput(roadmapSkeletonToDraft(skeleton, 7));
    expect(draft.stages[0].rationale).toBe(skeleton.stages[0].rationale);
    expect(roadmapDraftToSkeleton(JSON.parse(JSON.stringify(draft))).stages[0].rationale).toBe(skeleton.stages[0].rationale);
    expect(draft.stages[0].prerequisiteStageKeys).toEqual([]);
  });

  it("cannot turn pure elective teaching into a compulsory output, including unassigned extra steps", () => {
    const question: CourseContentQuestion = { key: "cq-count", question: "可选地比较参数", importance: "optional", contentRequirements: ["比较角色"], requirementIndices: [0], dimensionKeys: [] };
    for (const required of ["attempt", "record"]) {
      expect(() => validateLearningFramework(frame(required), [question])).toThrow("选学");
      const unassigned = frame();
      unassigned.segments[0].steps.push({ key: "extra", goal: "额外强制作答", requiredOutput: required, contentAssignments: [] });
      expect(() => validateLearningFramework(unassigned, [question])).toThrow("选学");
    }
    expect(validateLearningFramework(frame(), [question]).segments[0].steps[0].requiredOutput).toBe("none");
    expect(validateLearningFramework(frame("attempt"), [{ ...question, importance: "required" }]).segments[0].steps[0].requiredOutput).toBe("attempt");
  });

  it("passes actual course fragments and explicit foundation sources into learning rather than claiming excerpts verify content", async () => {
    const actualText = "参数角色实际正文的后段：用户需要比较参数与变量的作用。";
    await saveCourseDesignDraft("reliability-domain", { draft: { ...currentCourse, sources: [{ url: "https://material.edu/course", title: "实际课程资料", reason: "取得正文", grounding: { ok: true, status: 200, title: "实际课程资料", excerpt: "只有标题摘要，不应作为正文", bodyRetrieved: true, fragments: [{ location: "paragraph:12", text: actualText }], contentHash: "a".repeat(64), retrievedAt: "2026-10-09T12:00:00.000Z" } }], knowledgeReview: knowledge("uncertain") }, aiCallLogId: "course-log" });
    const plan = currentRoadmap(true), item = plan.stages[0].modules[0].items[0];
    const unit = await db.unit.create({ data: { id: "reliability-stage", domainId: "reliability-domain", title: "参数", orderIndex: 0, mapKey: "graph", planningBlueprintJson: JSON.stringify(plan.stages[0].moduleBlueprints) } });
    await db.learningNode.create({ data: { id: "reliability-node", domainId: "reliability-domain", unitId: unit.id, title: item.title, keyQuestion: item.keyQuestion, objective: item.objective, mapKey: item.key, conceptJson: JSON.stringify(item.concept), planningQuestionKeysJson: JSON.stringify(item.planningQuestionKeys), orderIndex: 0 } });
    const session = (await createLearningSession({ requestId: "start-learning", domainId: "reliability-domain", nodeId: "reliability-node" })).session;
    expect(session.context.domain?.assumptions).toContain("我有高中函数基础");
    expect(session.context.domain?.assumptions).toContain("课程暂定基础");
    expect(session.context.domain?.assumptions).toContain("未证明已掌握");
    const prepared = (await prepareLearningSession(session.id, { requestId: "prepare-learning", revision: session.revision })).session;
    expect(prepared.status).toBe("ready");
    const prompt = deps.run.mock.calls.find(([task]) => task.taskType === "node_lesson_preparation")![0].userPrompt as string;
    expect(prompt).toContain(actualText);
    expect(prompt).not.toContain("只有标题摘要，不应作为正文");
    const stored = await db.teachingSource.findFirstOrThrow({ where: { sessionId: session.id } });
    expect(JSON.parse(stored.fragmentsJson)[0]).toMatchObject({ location: "paragraph:12", text: actualText });
  });
});
