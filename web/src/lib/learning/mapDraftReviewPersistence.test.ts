import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  canonicalMapDraftDigest,
  assertPassingMapDraftReview,
  evaluateMapDraftReview,
  getBoundMapDraftReview,
  recordMapDraftQualityReview
} from "./mapDraftReviewService";

const prismaMock = vi.hoisted(() => ({
  $transaction: vi.fn(),
  mapDraftQualityReview: {
    create: vi.fn(),
    findFirst: vi.fn(),
    findMany: vi.fn()
  }
}));

vi.mock("../prisma", () => ({ prisma: prismaMock }));

const draft = {
  planningVersion: 3 as const,
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
  beforeEach(() => {
    vi.resetAllMocks();
    prismaMock.$transaction.mockImplementation(async (operation) => operation(prismaMock));
    prismaMock.mapDraftQualityReview.findMany.mockResolvedValue([]);
    prismaMock.mapDraftQualityReview.create.mockImplementation(async ({ data }) => ({ id: "review-new", ...data }));
  });

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

  const knownKnowledge = {
    reviewVersion: 1 as const,
    draftDigest: "original-knowledge-candidate-hash",
    materialsDigest: "original-materials-hash",
    verdict: "confirmed_error" as const,
    summary: "复合规则缺少必要适用条件。",
    limitations: ["只核对列出的关键主张。"],
    claims: [{
      key: "composition-conditions", path: "stages[0].moduleBlueprints[0].goal", quote: "理解极限",
      conclusion: "规则无条件成立。", premises: [], applicability: [], verdict: "confirmed_error" as const,
      basis: { kind: "derivation" as const, fragmentIds: ["actual-fragment-1"], reason: "提供了独立反例。" },
      reason: "必要条件缺失。", counterexample: "可检查的原反例"
    }],
    findings: [],
    materials: [{ id: "actual-fragment-1", text: "实际取得的原正文", location: "paragraph:4", contentHash: "original-body-hash" }],
    aiCallLogIds: ["original-knowledge-log"],
    acceptedDraftHash: canonicalMapDraftDigest(draft)
  };
  const knownReceipt = {
    domainId: "domain-1", draftHash: canonicalMapDraftDigest(draft), baseRevision: 3,
    courseDesignAiCallLogId: "course-log-1",
    reportJson: JSON.stringify({ status: "passed", summary: "原结构通过", blockingIssues: [], warnings: [], knowledgeReview: knownKnowledge }),
    aiCallLogIdsJson: JSON.stringify(["original-generation-log", "original-knowledge-log"])
  };

  it.each(["unavailable", "available"] as const)("retains the exact known-error evidence when a same-candidate retry is %s", async availability => {
    const originalJson = knownReceipt.reportJson;
    prismaMock.mapDraftQualityReview.findMany.mockResolvedValue([knownReceipt]);
    const receipt = await recordMapDraftQualityReview({
      domainId: "domain-1", scope: "map", draft, baseRevision: 3, courseDesignAiCallLogId: "course-log-1",
      report: { status: "passed", summary: "后续结构报告", blockingIssues: [], warnings: [], ...(availability === "available" ? { knowledgeReview: { ...knownKnowledge, verdict: "no_error_found" as const, summary: "后来的模型没有发现错误", claims: [] } } : {}) },
      availability, aiCallLogIds: ["retry-failure-log"]
    });
    expect(prismaMock.mapDraftQualityReview.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { domainId: "domain-1", draftHash: canonicalMapDraftDigest(draft), baseRevision: 3, courseDesignAiCallLogId: "course-log-1" }
    }));
    expect(receipt.report.knowledgeReview).toEqual(knownKnowledge);
    expect(JSON.parse(receipt.reportJson).knowledgeReview).toEqual(knownKnowledge);
    expect(receipt.aiCallLogIds).toEqual(["original-generation-log", "original-knowledge-log", "retry-failure-log"]);
    expect(knownReceipt.reportJson).toBe(originalJson);
    expect(receipt.availability).toBe(availability);
    const binding = { draft, baseRevision: 3, courseDesignAiCallLogId: "course-log-1", review: receipt };
    expect(evaluateMapDraftReview(binding)).toBe("blocked");
    expect(() => assertPassingMapDraftReview(binding)).toThrow("MAP_QUALITY_BLOCKED");
    expect(evaluateMapDraftReview({ ...binding, review: { ...receipt, resolutionJson: JSON.stringify({ kind: "unavailable_acknowledged", rationale: "我已经接受复核不可用的风险", draftHash: receipt.draftHash }) } })).toBe("blocked");
  });

  it.each([
    { draft: { ...draft, title: "内容已修改的新候选" }, baseRevision: 3, courseDesignAiCallLogId: "course-log-1" },
    { draft, baseRevision: 4, courseDesignAiCallLogId: "course-log-1" },
    { draft, baseRevision: 3, courseDesignAiCallLogId: "course-log-2" }
  ])("does not copy a known error across a different candidate/revision/course binding: %j", async binding => {
    prismaMock.mapDraftQualityReview.findMany.mockImplementation(async ({ where }) =>
      Object.entries(where).every(([key, value]) => knownReceipt[key as keyof typeof knownReceipt] === value) ? [knownReceipt] : []);
    const receipt = await recordMapDraftQualityReview({
      domainId: "domain-1", scope: "map", ...binding,
      report: { status: "blocked", summary: "复核不可用", blockingIssues: [], warnings: [] },
      availability: "unavailable", aiCallLogIds: ["new-failure-log"]
    });
    expect(receipt.report.knowledgeReview).toMatchObject({ verdict: "uncertain", claims: [], findings: [], materials: [], aiCallLogIds: ["new-failure-log"] });
    expect(receipt.report.knowledgeReview?.draftDigest).toBe(canonicalMapDraftDigest(binding.draft));
    expect(receipt.aiCallLogIds).toEqual(["new-failure-log"]);
    expect(evaluateMapDraftReview({ ...binding, review: receipt })).toBe("unavailable");
  });

  it("marks a new structural-only candidate as not independently checked", async () => {
    const receipt = await recordMapDraftQualityReview({
      domainId: "domain-new", scope: "skeleton", draft, baseRevision: 3, courseDesignAiCallLogId: "course-log-1",
      report: { status: "passed", summary: "结构没有阻断", blockingIssues: [], warnings: [] }
    });
    expect(receipt.report.knowledgeReview?.verdict).toBe("uncertain");
    expect(receipt.report.status).toBe("passed");
    expect(JSON.parse(receipt.reportJson)).toEqual(receipt.report);
  });
});
