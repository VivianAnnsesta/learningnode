import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  canonicalMapDraftDigest,
  getBoundMapDraftReview,
  recordMapDraftQualityReview
} from "./mapDraftReviewService";

const prismaMock = vi.hoisted(() => ({
  mapDraftQualityReview: {
    create: vi.fn(),
    findFirst: vi.fn()
  }
}));

vi.mock("../prisma", () => ({ prisma: prismaMock }));

const draft = {
  planningVersion: 2 as const,
  title: "高数路线",
  status: "draft",
  baseRevision: 3,
  stages: [
    {
      key: "limits",
      title: "极限",
      status: "planned" as const,
      moduleBlueprints: [
        {
          key: "limit-foundations",
          title: "极限基础",
          goal: "理解极限",
          keyQuestions: [
            {
              key: "limit-meaning",
              question: "极限表达了什么？",
              checkableOutcome: "能用例子解释定义"
            }
          ]
        }
      ],
      modules: []
    }
  ]
};

describe("persisted Map Draft review receipts", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stores a review bound to the exact draft, map revision, and Course Design log", async () => {
    prismaMock.mapDraftQualityReview.create.mockResolvedValue({ id: "review-1" });

    await recordMapDraftQualityReview({
      domainId: "domain-1",
      scope: "skeleton",
      draft,
      baseRevision: 3,
      courseDesignAiCallLogId: "course-log-1",
      report: {
        status: "passed",
        summary: "分层与问题边界通过。",
        blockingIssues: [],
        warnings: []
      },
      aiCallLogIds: ["generation-log", "critique-log"]
    });

    expect(prismaMock.mapDraftQualityReview.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        domainId: "domain-1",
        scope: "skeleton",
        baseRevision: 3,
        draftHash: canonicalMapDraftDigest(draft),
        courseDesignAiCallLogId: "course-log-1",
        status: "passed",
        createdAt: expect.any(Date),
        reportJson: expect.stringContaining("分层与问题边界通过"),
        aiCallLogIdsJson: JSON.stringify(["generation-log", "critique-log"])
      })
    });
  });

  it("returns the newest persisted receipt and its parsed report", async () => {
    prismaMock.mapDraftQualityReview.findFirst.mockResolvedValue({
      id: "review-1",
      scope: "skeleton",
      stageKey: null,
      status: "passed",
      draftHash: canonicalMapDraftDigest(draft),
      baseRevision: 3,
      courseDesignAiCallLogId: "course-log-1",
      reportJson: JSON.stringify({
        status: "passed",
        summary: "通过",
        blockingIssues: [],
        warnings: []
      }),
      aiCallLogIdsJson: JSON.stringify(["critique-log"]),
      createdAt: new Date("2026-08-09T00:00:00.000Z")
    });

    const review = await getBoundMapDraftReview("domain-1");

    expect(prismaMock.mapDraftQualityReview.findFirst).toHaveBeenCalledWith({
      where: { domainId: "domain-1" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }]
    });
    expect(review).toEqual(
      expect.objectContaining({
        id: "review-1",
        report: expect.objectContaining({ status: "passed", summary: "通过" }),
        aiCallLogIds: ["critique-log"]
      })
    );
  });
});
