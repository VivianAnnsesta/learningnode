import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  assertCourseResearchInputs,
  confirmCourseDesign,
  getMissingCourseResearchInputs,
  saveCourseDesignDraft
} from "./courseDesignService";

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  domain: {
    findUnique: vi.fn(),
    update: vi.fn()
  },
  aiCallLog: {
    create: vi.fn()
  }
}));

vi.mock("../prisma", () => ({
  prisma: prismaMock
}));

const validDraft = {
  taskBriefSnapshot: "学习目标：完成一个可运行项目。",
  globalExplanation: {
    theorySkeleton: "先建立基本对象、核心问题和最小先修链。",
    sourceBasis: "优先参考大学课程，再用官方文档补充。",
    optimizationRationale: "先修关系优先，其次匹配项目产出。",
    risksAndValidation: "仍需诊断当前基础和误区。"
  },
  sources: [
    {
      url: "https://ocw.mit.edu/courses/18-06-linear-algebra-spring-2010/",
      title: "MIT 18.06 Linear Algebra",
      reason: "课程结构清晰，适合作为主骨架。"
    }
  ],
  keyTradeoffs: ["降低理论密度，保留必要先修。"],
  qualityGate: { passed: true, missing: [] }
};

describe("courseDesignService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation((callback) => callback(prismaMock));
  });

  it("reports missing minimum inputs before course research", () => {
    expect(
      getMissingCourseResearchInputs({
        name: "机器学习",
        taskBrief: "任务书"
      })
    ).toEqual([
      "学习目标",
      "当前水平自评",
      "当前水平证据",
      "预期产出类型",
      "具体产出描述",
      "时间或深度约束",
      "排除范围"
    ]);
  });

  it("rejects course research when minimum inputs are missing", () => {
    expect(() =>
      assertCourseResearchInputs({
        name: "机器学习",
        taskBrief: "任务书"
      })
    ).toThrow("课程研究前仍缺少必要信息");
  });

  it("confirms a persisted course design direction that passed the quality gate", async () => {
    prismaMock.domain.findUnique.mockResolvedValue({
      id: "d1",
      courseDesignDraft: JSON.stringify(validDraft),
      courseDesignStatus: "draft",
      courseDesignRepairCount: 0,
      courseDesignConfirmedAt: null,
      courseDesignAiCallLogId: "log-1"
    });
    prismaMock.domain.update.mockResolvedValue({ id: "d1" });

    const state = await confirmCourseDesign("d1");

    expect(prismaMock.domain.update).toHaveBeenCalledWith({
      where: { id: "d1" },
      data: {
        courseDesignStatus: "confirmed",
        courseDesignConfirmedAt: expect.any(Date)
      }
    });
    expect(prismaMock.aiCallLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        domainId: "d1",
        canvasId: "d1",
        taskType: "course_design_research",
        provider: "user"
      })
    });
    expect(state.draft?.qualityGate.passed).toBe(true);
  });

  it("persists the exact accumulated automatic repair count", async () => {
    prismaMock.domain.update.mockImplementation(async ({ data }) => ({
      courseDesignDraft: data.courseDesignDraft,
      courseDesignStatus: data.courseDesignStatus,
      courseDesignRepairCount: data.courseDesignRepairCount,
      courseDesignConfirmedAt: data.courseDesignConfirmedAt,
      courseDesignAiCallLogId: data.courseDesignAiCallLogId
    }));

    const state = await saveCourseDesignDraft("d1", {
      draft: validDraft,
      aiCallLogId: "repair-log-3",
      repairCount: 3
    });

    expect(state.repairCount).toBe(3);
    expect(prismaMock.domain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          courseDesignRepairCount: 3,
          courseDesignAiCallLogId: "repair-log-3"
        })
      })
    );
  });
});
