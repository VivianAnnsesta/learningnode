import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getLegacyCoreReview,
  LegacyCoreReviewError,
  saveLegacyCoreReview
} from "./coreReviewService";

const prismaMock = vi.hoisted(() => ({
  knowledgePoint: {
    findFirst: vi.fn(),
    update: vi.fn()
  },
  semanticCoreVersion: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn()
  },
  coreReviewSession: {
    findMany: vi.fn(),
    create: vi.fn()
  },
  transferChallenge: {
    create: vi.fn()
  },
  $transaction: vi.fn()
}));

vi.mock("../prisma", () => ({
  prisma: prismaMock
}));

describe("coreReviewService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback(prismaMock)
    );
  });

  it("returns empty review data when the knowledge point has no core", async () => {
    prismaMock.knowledgePoint.findFirst.mockResolvedValue({ coreEssence: null });

    const data = await getLegacyCoreReview("w1", "c1");

    expect(data).toEqual({ core: null, versions: [], reviews: [] });
  });

  it("rejects review saves without user recall", async () => {
    await expect(
      saveLegacyCoreReview("w1", "c1", { userRecall: "" })
    ).rejects.toMatchObject({
      message: "用户回忆不能为空。",
      status: 400
    });
  });

  it("creates initial and revised core versions during first review", async () => {
    prismaMock.knowledgePoint.findFirst.mockResolvedValue({
      id: "w1",
      masteryStatus: "can_apply",
      isIsland: false,
      reviewIntervalDays: 7,
      coreEssence: "initial core statement"
    });
    prismaMock.semanticCoreVersion.findFirst.mockResolvedValue(null);
    prismaMock.semanticCoreVersion.create.mockImplementation(({ data }) => ({
      id: `v${data.version}`,
      ...data
    }));
    prismaMock.coreReviewSession.create.mockResolvedValue({
      id: "r1",
      knowledgePointId: "w1",
      userRecall: "recalled explanation"
    });
    prismaMock.transferChallenge.create.mockResolvedValue({
      id: "t1",
      reviewSessionId: "r1"
    });
    prismaMock.knowledgePoint.update.mockResolvedValue({
      id: "w1"
    });

    const result = await saveLegacyCoreReview("w1", "c1", {
      userRecall: "recalled explanation",
      oldSampleExplanations: "power as force can drive objects",
      transferPrompt: "political power",
      transferExplanation: "applies to social influence as well",
      aiFeedback: "good but still narrow",
      revisedStatement: "revised core statement",
      revisionReason: "cover both force and influence",
      passed: true
    });

    expect(prismaMock.semanticCoreVersion.create).toHaveBeenCalledTimes(2);
    expect(
      prismaMock.semanticCoreVersion.create.mock.calls[0][0].data.version
    ).toBe(1);
    expect(
      prismaMock.semanticCoreVersion.create.mock.calls[1][0].data.version
    ).toBe(2);
    expect(prismaMock.coreReviewSession.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.transferChallenge.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.knowledgePoint.update).toHaveBeenCalledWith({
      where: { id: "w1" },
      data: { coreEssence: "revised core statement" }
    });
    expect(prismaMock.knowledgePoint.update).toHaveBeenCalledTimes(2);
    expect(
      prismaMock.knowledgePoint.update.mock.calls[1][0].data.reviewIntervalDays
    ).toBe(11);
    expect(result.review.id).toBe("r1");
  });

  it("loads versions and reviews through knowledge point id", async () => {
    prismaMock.knowledgePoint.findFirst.mockResolvedValue({
      id: "w1",
      coreEssence: "core"
    });
    prismaMock.semanticCoreVersion.findMany.mockResolvedValue([{ id: "v1" }]);
    prismaMock.coreReviewSession.findMany.mockResolvedValue([{ id: "r1" }]);

    const result = await getLegacyCoreReview("w1", "c1");

    expect(prismaMock.semanticCoreVersion.findMany).toHaveBeenCalledWith({
      where: { knowledgePointId: "w1" },
      orderBy: { version: "desc" }
    });
    expect(prismaMock.coreReviewSession.findMany).toHaveBeenCalledWith({
      where: { knowledgePointId: "w1" },
      orderBy: { createdAt: "desc" },
      include: {
        transferChallenges: {
          orderBy: { createdAt: "desc" }
        },
        createdVersions: {
          orderBy: { version: "desc" }
        }
      }
    });
    expect(result.core?.summary).toBe("core");
  });
});
