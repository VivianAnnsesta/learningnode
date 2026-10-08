import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLearningDomain,
  confirmTaskBrief,
  deleteLearningDomain,
  getLearningDomain,
  listLearningDomains,
  updateLearningDomain
} from "./domainService";

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  domain: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  },
  learningNode: {
    updateMany: vi.fn()
  },
  aiCallLog: {
    create: vi.fn()
  }
}));

vi.mock("../prisma", () => ({
  prisma: prismaMock
}));

const buildDomainRecord = (overrides: Record<string, unknown> = {}) => ({
  id: "d1",
  name: "Domain",
  description: null,
  currentLevel: null,
  goal: null,
  scope: null,
  excludedScope: null,
  depth: null,
  outputType: null,
  outputTarget: null,
  taskBrief: null,
  taskBriefConfirmedAt: null,
  roadmapTitle: null,
  roadmapStatus: "draft",
  courseDesignStatus: "none",
  courseDesignRepairCount: 0,
  courseDesignConfirmedAt: null,
  courseDesignAiCallLogId: null,
  status: "active",
  createdAt: new Date("2026-07-09T00:00:00.000Z"),
  updatedAt: new Date("2026-07-09T00:00:00.000Z"),
  ...overrides
});

describe("domainService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation((callback) => callback(prismaMock));
  });

  it("lists domains ordered by updatedAt", async () => {
    prismaMock.domain.findMany.mockResolvedValue([buildDomainRecord()]);

    await expect(listLearningDomains()).resolves.toEqual([buildDomainRecord()]);
    expect(prismaMock.domain.findMany).toHaveBeenCalledWith({
      orderBy: { updatedAt: "desc" },
      select: expect.any(Object)
    });
  });

  it("gets a single domain", async () => {
    prismaMock.domain.findUnique.mockResolvedValue(buildDomainRecord());

    await expect(getLearningDomain("d1")).resolves.toEqual(buildDomainRecord());
    expect(prismaMock.domain.findUnique).toHaveBeenCalledWith({
      where: { id: "d1" },
      select: expect.any(Object)
    });
  });

  it("rejects empty names on create", async () => {
    await expect(createLearningDomain({ name: "  " })).rejects.toThrow(
      "学习领域名称不能为空"
    );
  });

  it("normalizes fields on create", async () => {
    prismaMock.domain.create.mockResolvedValue(
      buildDomainRecord({
      name: "English",
      description: "desc",
      currentLevel: "入门",
      goal: null,
      scope: null,
      excludedScope: null,
      depth: null,
      outputType: "项目型",
      outputTarget: null,
      taskBrief: "brief",
      status: "active"
      })
    );

    await createLearningDomain({
      name: " English ",
      description: "  desc  ",
      currentLevel: " 入门 ",
      goal: "",
      outputType: " 项目型 ",
      taskBrief: "  brief  "
    });

    expect(prismaMock.domain.create).toHaveBeenCalledWith({
      data: {
        name: "English",
        description: "desc",
        currentLevel: "入门",
        goal: null,
        scope: null,
        excludedScope: null,
        depth: null,
        outputType: "项目型",
        outputTarget: null,
        taskBrief: "brief",
        status: "active"
      },
      select: expect.any(Object)
    });
  });

  it("rejects invalid update status", async () => {
    await expect(
      updateLearningDomain("d1", { status: "bad-status" })
    ).rejects.toThrow("无效的学习领域状态");
  });

  it("persists explicit confirmation for the current task brief", async () => {
    const confirmedAt = new Date("2026-07-19T04:00:00.000Z");
    prismaMock.domain.findUnique.mockResolvedValue({ taskBrief: "A clear brief" });
    prismaMock.domain.update.mockResolvedValue(
      buildDomainRecord({
        taskBrief: "A clear brief",
        taskBriefConfirmedAt: confirmedAt
      })
    );

    await expect(confirmTaskBrief("d1")).resolves.toMatchObject({
      id: "d1",
      taskBrief: "A clear brief",
      taskBriefConfirmedAt: confirmedAt
    });
    expect(prismaMock.domain.update).toHaveBeenCalledWith({
      where: { id: "d1" },
      data: { taskBriefConfirmedAt: expect.any(Date) },
      select: expect.any(Object)
    });
  });

  it("rejects confirmation when the persisted task brief is empty", async () => {
    prismaMock.domain.findUnique.mockResolvedValue({ taskBrief: "  " });

    await expect(confirmTaskBrief("d1")).rejects.toThrow(
      "请先保存任务书，再确认。"
    );
    expect(prismaMock.domain.update).not.toHaveBeenCalled();
  });

  it("rejects empty update payload", async () => {
    await expect(updateLearningDomain("d1", {})).rejects.toThrow(
      "未提供可更新字段"
    );
  });

  it("updates normalized fields", async () => {
    prismaMock.domain.findUnique.mockResolvedValue(
      buildDomainRecord({
        taskBrief: "old brief",
        taskBriefConfirmedAt: new Date("2026-07-19T03:00:00.000Z"),
        courseDesignDraft: "{}",
        roadmapDraftJson: "{}"
      })
    );
    prismaMock.domain.update.mockResolvedValue(
      buildDomainRecord({
      name: "Updated",
      description: null,
      currentLevel: "中级",
      goal: null,
      scope: null,
      excludedScope: null,
      depth: null,
      outputType: "应用型",
      outputTarget: null,
      taskBrief: "revised brief",
      courseDesignStatus: "needs_review",
      status: "completed"
      })
    );

    await updateLearningDomain("d1", {
      name: " Updated ",
      description: " ",
      currentLevel: " 中级 ",
      outputType: " 应用型 ",
      status: "completed",
      taskBrief: " revised brief "
    });

    expect(prismaMock.domain.update).toHaveBeenCalledWith({
      where: { id: "d1" },
      data: {
        name: "Updated",
        description: null,
        currentLevel: "中级",
        outputType: "应用型",
        taskBrief: "revised brief",
        status: "completed",
        taskBriefConfirmedAt: null,
        courseDesignStatus: "needs_review",
        courseDesignConfirmedAt: null,
        roadmapStatus: "needs_review"
      },
      select: expect.any(Object)
    });
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.learningNode.updateMany).toHaveBeenCalledWith({
      where: {
        domainId: "d1",
        status: { notIn: ["completed", "mastered", "skipped"] }
      },
      data: { status: "needs_review" }
    });
    expect(prismaMock.domain.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.aiCallLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        domainId: "d1",
        inputSummary: "Course research inputs changed after planning artifacts were created."
      })
    });
  });

  it("invalidates only course design when no map artifact exists", async () => {
    prismaMock.domain.findUnique.mockResolvedValue(
      buildDomainRecord({
        goal: "Old goal",
        courseDesignDraft: "{}"
      })
    );
    prismaMock.domain.update.mockResolvedValue(
      buildDomainRecord({
        goal: "New goal",
        courseDesignStatus: "needs_review"
      })
    );

    await updateLearningDomain("d1", { goal: "New goal" });

    expect(prismaMock.domain.update).toHaveBeenCalledWith({
      where: { id: "d1" },
      data: {
        goal: "New goal",
        taskBriefConfirmedAt: null,
        courseDesignStatus: "needs_review",
        courseDesignConfirmedAt: null
      },
      select: expect.any(Object)
    });
    expect(prismaMock.learningNode.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.aiCallLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        taskType: "course_research",
        outputSummary: "Existing course design marked as needs_review."
      })
    });
  });

  it("does not mark maps for review when the task brief is unchanged", async () => {
    prismaMock.domain.findUnique.mockResolvedValue(
      buildDomainRecord({
        taskBrief: "same brief",
        taskBriefConfirmedAt: new Date("2026-07-19T03:00:00.000Z")
      })
    );
    prismaMock.domain.update.mockResolvedValue(
      buildDomainRecord({
        taskBrief: "same brief"
      })
    );

    await updateLearningDomain("d1", {
      taskBrief: " same brief "
    });

    expect(prismaMock.learningNode.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.domain.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.aiCallLog.create).not.toHaveBeenCalled();
  });

  it("clears task brief confirmation when a course-research input changes", async () => {
    prismaMock.domain.findUnique.mockResolvedValue(
      buildDomainRecord({
        goal: "Old goal",
        taskBrief: "same brief",
        taskBriefConfirmedAt: new Date("2026-07-19T03:00:00.000Z")
      })
    );
    prismaMock.domain.update.mockResolvedValue(
      buildDomainRecord({
        goal: "New goal",
        taskBrief: "same brief",
        taskBriefConfirmedAt: null
      })
    );

    await updateLearningDomain("d1", { goal: " New goal " });

    expect(prismaMock.domain.update).toHaveBeenCalledWith({
      where: { id: "d1" },
      data: {
        goal: "New goal",
        taskBriefConfirmedAt: null
      },
      select: expect.any(Object)
    });
    expect(prismaMock.learningNode.updateMany).not.toHaveBeenCalled();
    expect(prismaMock.aiCallLog.create).not.toHaveBeenCalled();
  });

  it("rejects when the review log write fails inside the transaction path", async () => {
    prismaMock.domain.findUnique.mockResolvedValue(
      buildDomainRecord({
        taskBrief: "old brief",
        courseDesignDraft: "{}",
        roadmapDraftJson: "{}"
      })
    );
    prismaMock.domain.update.mockResolvedValue(
      buildDomainRecord({
        taskBrief: "new brief"
      })
    );
    prismaMock.aiCallLog.create.mockRejectedValue(new Error("log write failed"));

    await expect(
      updateLearningDomain("d1", { taskBrief: "new brief" })
    ).rejects.toThrow("log write failed");

    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(prismaMock.domain.update).toHaveBeenCalledWith({
      where: { id: "d1" },
      data: {
        taskBrief: "new brief",
        taskBriefConfirmedAt: null,
        courseDesignStatus: "needs_review",
        courseDesignConfirmedAt: null,
        roadmapStatus: "needs_review"
      },
      select: expect.any(Object)
    });
    expect(prismaMock.learningNode.updateMany).toHaveBeenCalledTimes(1);
    expect(prismaMock.aiCallLog.create).toHaveBeenCalledTimes(1);
  });

  it("deletes a domain", async () => {
    prismaMock.domain.delete.mockResolvedValue({ id: "d1" });

    await deleteLearningDomain("d1");

    expect(prismaMock.domain.delete).toHaveBeenCalledWith({
      where: { id: "d1" }
    });
  });
});
