import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { currentCourse, currentRoadmap } from "./currentRoadmap.fixture";
import { saveRoadmapDraft } from "./roadmapService";
import { confirmDomainMap } from "./domainMapService";
import { canonicalMapDraftDigest, evaluateMapDraftReview, getBoundMapDraftReview, recordMapDraftQualityReview, resolveMapDraftQualityReview } from "./mapDraftReviewService";
import { createUncertainPlanningKnowledgeReview } from "../ai/planningKnowledgeReview";

const dependency = vi.hoisted(() => ({ db: null as PrismaClient | null }));
vi.mock("../prisma", () => ({ get prisma() { return dependency.db!; } }));
let db: PrismaClient, temporaryRoot: string;
beforeAll(() => {
  temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "englishnode-known-error-"));
  const database = path.join(temporaryRoot, "isolated.db");
  fs.copyFileSync(path.resolve("prisma/seed.db"), database);
  db = new PrismaClient({ datasources: { db: { url: `file:${database.replace(/\\/g, "/")}` } } });
  dependency.db = db;
});
afterAll(async () => {
  await db?.$disconnect();
  if (temporaryRoot && path.dirname(temporaryRoot) === path.resolve(os.tmpdir())) fs.rmSync(temporaryRoot, { recursive: true, force: true });
});

describe("known-error retention at the formal map boundary (isolated SQLite)", () => {
  it("cannot accept or acknowledge unchanged erroneous content after unavailable or no-error retries, while a corrected candidate gets fresh uncertainty", async () => {
    await db.domain.create({ data: { id: "retention-domain", name: "图像", goal: "解释参数", courseDesignStatus: "draft", courseDesignDraft: JSON.stringify(currentCourse), courseDesignAiCallLogId: "course-log" } });
    await db.aiCallLog.create({ data: { id: "course-log", domainId: "retention-domain", provider: "fixture", taskType: "course_design_research", status: "success", inputSummary: "状态边界夹具，不是知识认证" } });
    const saved = await saveRoadmapDraft("retention-domain", currentRoadmap(), "course-log");
    const draft = saved.draft;
    const originalKnowledge = {
      ...createUncertainPlanningKnowledgeReview(draft, [{ id: "material-original", text: "实际原材料", location: "paragraph:7", contentHash: "body-original" }], "仅核对列出的主张", ["knowledge-error-log"]),
      verdict: "confirmed_error" as const, summary: "已确认必要条件缺失（边界夹具）",
      claims: [{ key: "original-claim", path: "stages[0].goal", quote: draft.stages![0].goal!, conclusion: "条件不足的主张", premises: ["原前提"], applicability: ["原适用条件"], verdict: "confirmed_error" as const, basis: { kind: "derivation" as const, fragmentIds: ["material-original"], reason: "原独立推导" }, reason: "原错误理由", counterexample: "原可检查反例" }]
    };
    const report = { status: "passed" as const, summary: "只有结构通过", blockingIssues: [], warnings: [], knowledgeReview: originalKnowledge };
    const binding = { domainId: "retention-domain", scope: "map" as const, draft, baseRevision: 0, courseDesignAiCallLogId: "course-log" };
    const original = await recordMapDraftQualityReview({ ...binding, report, aiCallLogIds: ["generation-log", "knowledge-error-log"] });
    const unavailable = await recordMapDraftQualityReview({ ...binding, availability: "unavailable", report: { status: "blocked", summary: "服务不可用", blockingIssues: [], warnings: [] }, aiCallLogIds: ["failed-review-log"] });
    expect(unavailable.report.knowledgeReview).toEqual(original.report.knowledgeReview);
    expect(unavailable.aiCallLogIds).toEqual(["generation-log", "knowledge-error-log", "failed-review-log"]);
    await expect(resolveMapDraftQualityReview({ domainId: binding.domainId, reviewId: unavailable.id, decision: "acknowledge_unavailable", rationale: "已阅读资料并接受服务不可用风险" })).rejects.toThrow("明确知识错误必须先修正");
    await expect(confirmDomainMap(binding.domainId, draft, "确认显示的范围与资料限制", currentCourse)).rejects.toThrow("MAP_QUALITY_BLOCKED");

    const optimistic = await recordMapDraftQualityReview({ ...binding, report: { ...report, knowledgeReview: { ...originalKnowledge, verdict: "no_error_found", summary: "后来的模型没有发现错误", claims: [] } }, aiCallLogIds: ["optimistic-review-log"] });
    expect(optimistic.report.knowledgeReview).toEqual(original.report.knowledgeReview);
    expect(evaluateMapDraftReview({ ...binding, review: await getBoundMapDraftReview(binding.domainId) })).toBe("blocked");
    await expect(confirmDomainMap(binding.domainId, draft, "确认显示的范围与资料限制", currentCourse)).rejects.toThrow("MAP_QUALITY_BLOCKED");
    expect((await db.mapDraftQualityReview.findUniqueOrThrow({ where: { id: original.id } })).reportJson).toBe(original.reportJson);
    expect((await db.domain.findUniqueOrThrow({ where: { id: binding.domainId } })).mapRevision).toBe(0);
    expect(await db.unit.count()).toBe(0);
    expect(await db.learningNode.count()).toBe(0);

    const correctedDraft = { ...draft, stages: draft.stages!.map((stage, index) => index ? stage : { ...stage, goal: `${stage.goal}（实际加入必要条件）` }) };
    const corrected = await saveRoadmapDraft(binding.domainId, correctedDraft, "course-log", { expectedCurrentDraft: draft });
    const pending = await recordMapDraftQualityReview({ ...binding, draft: corrected.draft, availability: "unavailable", report: { status: "blocked", summary: "新候选尚未核对", blockingIssues: [], warnings: [] }, aiCallLogIds: ["new-unavailable-log"] });
    expect(pending.draftHash).not.toBe(canonicalMapDraftDigest(draft));
    expect(pending.report.knowledgeReview?.verdict).toBe("uncertain");
    expect(pending.aiCallLogIds).toEqual(["new-unavailable-log"]);
    expect(evaluateMapDraftReview({ ...binding, draft: corrected.draft, review: pending })).toBe("unavailable");
    expect(await db.mapDraftQualityReview.count()).toBe(4);
  });
});
