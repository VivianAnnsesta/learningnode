import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { currentCourse, currentRoadmap } from "../../../../lib/learning/currentRoadmap.fixture";
import { saveRoadmapDraft } from "../../../../lib/learning/roadmapService";
import { recordMapDraftQualityReview } from "../../../../lib/learning/mapDraftReviewService";
import { confirmDomainMap } from "../../../../lib/learning/domainMapService";
import { GET, PATCH } from "../../../api/domains/[id]/map/route";
import { creationDraftSavePayload, restoredCreationDraftBinding } from "./creationDraftEditing";

const dependency = vi.hoisted(() => ({ db: null as PrismaClient | null }));
vi.mock("../../../../lib/prisma", () => ({ get prisma() { return dependency.db!; } }));
let db: PrismaClient, directory: string;
const context = { params: Promise.resolve({ id: "creation-domain" }) };

beforeAll(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "englishnode-creation-binding-"));
  const target = path.join(directory, "copy.db");
  fs.copyFileSync(path.resolve("prisma/seed.db"), target);
  db = new PrismaClient({ datasources: { db: { url: `file:${target.replace(/\\/g, "/")}` } } });
  dependency.db = db;
});
afterAll(async () => { await db.$disconnect(); fs.rmSync(directory, { recursive: true, force: true }); });
beforeEach(async () => {
  await db.domain.deleteMany();
  await db.aiCallLog.deleteMany();
  await db.domain.create({ data: {
    id: "creation-domain", name: "图像", goal: "判断根数", courseDesignStatus: "draft",
    courseDesignDraft: JSON.stringify(currentCourse), courseDesignAiCallLogId: "course-log"
  } });
  await db.aiCallLog.create({ data: {
    id: "course-log", domainId: "creation-domain", provider: "fixture", taskType: "course_design_research",
    status: "success", inputSummary: "测试课程绑定，不是真实模型证据", rawOutput: "original course evidence"
  } });
  const saved = await saveRoadmapDraft("creation-domain", currentRoadmap(), "course-log");
  await recordMapDraftQualityReview({
    domainId: "creation-domain", scope: "skeleton", draft: saved.draft, baseRevision: 0,
    courseDesignAiCallLogId: "course-log", report: { status: "passed", summary: "模拟复审", blockingIssues: [], warnings: [] }
  });
});

async function restore() {
  const response = await GET(new Request("http://localhost/api/domains/creation-domain/map"), context);
  expect(response.status).toBe(200);
  return await response.json();
}
async function save(payload: ReturnType<typeof creationDraftSavePayload>) {
  return PATCH(new Request("http://localhost/api/domains/creation-domain/map", {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
  }), context);
}

describe("首次正式确认前的已保存路线编辑版本", () => {
  it("从实际地图恢复绑定并保存修改，但原复审失效且正式地图不变", async () => {
    const restored = await restore();
    expect(restored.qualityReview.state).toBe("passed");
    const binding = restoredCreationDraftBinding(restored);
    const edited = { ...restored.draft, title: "用户修正过的候选路线" };
    const payload = creationDraftSavePayload(JSON.stringify(edited), binding);
    expect(payload.courseDesignAiCallLogId).toBe("course-log");
    const response = await save(payload);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ reviewState: "stale", courseDesignAiCallLogId: "course-log" });
    const after = await restore();
    expect(after.draft.title).toBe(edited.title);
    expect(restoredCreationDraftBinding(after)).toBe("course-log");
    expect(after.qualityReview.state).toBe("stale");
    await expect(confirmDomainMap("creation-domain", after.draft, "接受路线", currentCourse)).rejects.toThrow("重新复审");
    expect((await db.domain.findUniqueOrThrow({ where: { id: "creation-domain" } })).mapRevision).toBe(0);
    expect(await db.unit.count()).toBe(0);
    expect(await db.learningNode.count()).toBe(0);
    expect((await db.aiCallLog.findUniqueOrThrow({ where: { id: "course-log" } })).rawOutput).toBe("original course evidence");
  });

  it("恢复后课程真实更新时保留候选旧绑定，服务端拒绝且不覆盖已存草稿", async () => {
    const restored = await restore();
    const original = await db.domain.findUniqueOrThrow({ where: { id: "creation-domain" } });
    await db.domain.update({ where: { id: "creation-domain" }, data: { courseDesignAiCallLogId: "new-course-log" } });
    const afterCourseChanged = await restore();
    expect(restoredCreationDraftBinding(afterCourseChanged)).toBe("course-log");
    const payload = creationDraftSavePayload(JSON.stringify({ ...restored.draft, title: "旧课程候选的修改" }), restoredCreationDraftBinding(afterCourseChanged));
    const response = await save(payload);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: "课程设计方向已更新，请重新生成领域地图草稿。" });
    const after = await db.domain.findUniqueOrThrow({ where: { id: "creation-domain" } });
    expect(after.roadmapDraftJson).toBe(original.roadmapDraftJson);
    expect(after.roadmapDraftCourseDesignAiCallLogId).toBe("course-log");
    expect(after.courseDesignAiCallLogId).toBe("new-course-log");
    expect(after.mapRevision).toBe(0);
    expect(await db.mapDraftQualityReview.count()).toBe(1);
  });

  it("缺少保存候选版本时不能使用当前课程ID隐式补绑", async () => {
    await db.domain.update({ where: { id: "creation-domain" }, data: { roadmapDraftCourseDesignAiCallLogId: null } });
    const restored = await restore();
    expect(restored.draft).not.toBeNull();
    expect(restoredCreationDraftBinding(restored)).toBeNull();
    expect(() => creationDraftSavePayload(JSON.stringify(restored.draft), restoredCreationDraftBinding(restored))).toThrow("缺少课程版本");
    expect((await db.domain.findUniqueOrThrow({ where: { id: "creation-domain" } })).courseDesignAiCallLogId).toBe("course-log");
  });

  it("恢复已清空的草稿时同步清空绑定，不能沿用先前页面版本", async () => {
    expect(restoredCreationDraftBinding(await restore())).toBe("course-log");
    await db.domain.update({ where: { id: "creation-domain" }, data: { roadmapDraftJson: null } });
    const restored = await restore();
    expect(restored.draft).toBeNull();
    expect(restoredCreationDraftBinding(restored)).toBeNull();
    expect(() => creationDraftSavePayload(JSON.stringify(currentRoadmap()), restoredCreationDraftBinding(restored))).toThrow("重新生成");
    expect(await db.unit.count()).toBe(0);
  });
});
