import { describe, expect, it } from "vitest";
import {
  assertPassingMapDraftReview,
  canonicalMapDraftDigest,
  evaluateMapDraftReview
} from "./mapDraftReviewService";

const layeredDraft = {
  planningVersion: 3 as const,
  title: "高数路线",
  status: "draft",
  baseRevision: 0,
  stages: [
    {
      key: "limits",
      title: "极限",
      goal: "理解极限",
      status: "planned" as const,
      moduleDirections: ["极限基础"],
      prerequisiteStageKeys: [],
      moduleBlueprints: [
        {
          key: "limit-foundations",
          title: "极限基础",
          goal: "理解极限",
          keyQuestions: [
            {
              key: "limit-meaning",
              question: "极限表达了什么？",
              checkableOutcome: "能解释定义"
            }
          ]
        }
      ],
      modules: []
    }
  ]
};

describe("Map Draft review receipts", () => {
  it("uses a canonical digest that ignores object key insertion order", () => {
    const reordered = {
      stages: layeredDraft.stages,
      baseRevision: 0,
      status: "draft",
      title: "高数路线",
      planningVersion: 3
    };

    expect(canonicalMapDraftDigest(layeredDraft)).toBe(
      canonicalMapDraftDigest(reordered)
    );
    expect(
      canonicalMapDraftDigest({ ...layeredDraft, title: "高数路线（已编辑）" })
    ).not.toBe(canonicalMapDraftDigest(layeredDraft));
  });

  it("accepts only a passing receipt bound to the exact draft, revision and Course Design log", () => {
    const draftHash = canonicalMapDraftDigest(layeredDraft);
    const review = {
      status: "passed",
      draftHash,
      baseRevision: 0,
      courseDesignAiCallLogId: "course-log-1"
    };

    expect(
      evaluateMapDraftReview({
        draft: layeredDraft,
        baseRevision: 0,
        courseDesignAiCallLogId: "course-log-1",
        review
      })
    ).toBe("passed");
    expect(
      evaluateMapDraftReview({
        draft: { ...layeredDraft, title: "用户编辑后的路线" },
        baseRevision: 0,
        courseDesignAiCallLogId: "course-log-1",
        review
      })
    ).toBe("stale");
    expect(
      evaluateMapDraftReview({
        draft: layeredDraft,
        baseRevision: 1,
        courseDesignAiCallLogId: "course-log-1",
        review
      })
    ).toBe("stale");
    expect(
      evaluateMapDraftReview({
        draft: layeredDraft,
        baseRevision: 0,
        courseDesignAiCallLogId: "course-log-2",
        review
      })
    ).toBe("stale");
  });

  it("blocks v3 confirmation when the receipt is missing or still has critical findings", () => {
    expect(() =>
      assertPassingMapDraftReview({
        draft: layeredDraft,
        baseRevision: 0,
        courseDesignAiCallLogId: "course-log-1",
        review: null
      })
    ).toThrow("MAP_REVIEW_STALE");

    expect(() =>
      assertPassingMapDraftReview({
        draft: layeredDraft,
        baseRevision: 0,
        courseDesignAiCallLogId: "course-log-1",
        review: {
          status: "blocked",
          draftHash: canonicalMapDraftDigest(layeredDraft),
          baseRevision: 0,
          courseDesignAiCallLogId: "course-log-1"
        }
      })
    ).toThrow("MAP_QUALITY_BLOCKED");
  });

  it("rejects a receipt from the wrong review scope or Stage", () => {
    const binding = {
      status: "passed",
      scope: "stage",
      stageKey: "limits",
      draftHash: canonicalMapDraftDigest(layeredDraft),
      baseRevision: 0,
      courseDesignAiCallLogId: "course-log-1"
    };

    expect(
      evaluateMapDraftReview({
        draft: layeredDraft,
        baseRevision: 0,
        courseDesignAiCallLogId: "course-log-1",
        review: binding,
        expectedScopes: ["stage", "map"],
        expectedStageKey: "derivatives"
      })
    ).toBe("stale");
    expect(
      evaluateMapDraftReview({
        draft: layeredDraft,
        baseRevision: 0,
        courseDesignAiCallLogId: "course-log-1",
        review: binding,
        expectedScopes: ["skeleton", "map"],
        expectedStageKey: null
      })
    ).toBe("stale");
    expect(
      evaluateMapDraftReview({
        draft: layeredDraft,
        baseRevision: 0,
        courseDesignAiCallLogId: "course-log-1",
        review: binding,
        expectedScopes: ["stage", "map"],
        expectedStageKey: "limits"
      })
    ).toBe("passed");
  });

  it("accepts a user dismissal only while it remains bound to the exact reviewed draft", () => {
    const review = {
      status: "blocked",
      draftHash: canonicalMapDraftDigest(layeredDraft),
      baseRevision: 0,
      courseDesignAiCallLogId: "course-log-1",
      resolutionJson: JSON.stringify({
        kind: "dismissed",
        rationale: "该 Stage 尚未展开，节点覆盖问题不适用。",
        draftHash: canonicalMapDraftDigest(layeredDraft),
        resolvedAt: "2026-08-13T00:00:00.000Z"
      })
    };

    expect(
      evaluateMapDraftReview({
        draft: layeredDraft,
        baseRevision: 0,
        courseDesignAiCallLogId: "course-log-1",
        review
      })
    ).toBe("resolved");
    expect(() =>
      assertPassingMapDraftReview({
        draft: layeredDraft,
        baseRevision: 0,
        courseDesignAiCallLogId: "course-log-1",
        review
      })
    ).not.toThrow();

    expect(
      evaluateMapDraftReview({
        draft: { ...layeredDraft, title: "已修改" },
        baseRevision: 0,
        courseDesignAiCallLogId: "course-log-1",
        review
      })
    ).toBe("stale");
  });

  it("distinguishes an unavailable review from a semantic block and accepts explicit acknowledgement", () => {
    const binding = {
      status: "blocked",
      availability: "unavailable",
      draftHash: canonicalMapDraftDigest(layeredDraft),
      baseRevision: 0,
      courseDesignAiCallLogId: "course-log-1"
    };

    expect(
      evaluateMapDraftReview({
        draft: layeredDraft,
        baseRevision: 0,
        courseDesignAiCallLogId: "course-log-1",
        review: binding
      })
    ).toBe("unavailable");

    expect(
      evaluateMapDraftReview({
        draft: layeredDraft,
        baseRevision: 0,
        courseDesignAiCallLogId: "course-log-1",
        review: {
          ...binding,
          resolutionJson: JSON.stringify({
            kind: "unavailable_acknowledged",
            rationale: "服务暂时不可用，我已人工核对蓝图并接受风险。",
            draftHash: binding.draftHash,
            resolvedAt: "2026-08-13T00:00:00.000Z"
          })
        }
      })
    ).toBe("resolved");
  });

  it("treats a legacy unconfirmed draft as requiring regeneration", () => {
    expect(
      evaluateMapDraftReview({
        draft: { title: "旧草稿", stages: [] },
        baseRevision: 0,
        courseDesignAiCallLogId: "course-log-1",
        review: null
      })
    ).toBe("legacy");
  });
});
