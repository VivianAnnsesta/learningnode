import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const reviewServiceMock = vi.hoisted(() => ({
  resolveMapDraftQualityReview: vi.fn()
}));

vi.mock("../../../../../../lib/learning/mapDraftReviewService", () =>
  reviewServiceMock
);

describe("Map Draft review decision API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    reviewServiceMock.resolveMapDraftQualityReview.mockResolvedValue({
      reviewId: "review-1",
      state: "resolved",
      resolution: {
        kind: "dismissed",
        rationale: "该问题针对未展开 Stage，不适用于当前骨架。"
      }
    });
  });

  it("records an explicit learner decision against a review", async () => {
    const response = await POST(
      new Request("http://localhost/api/domains/d1/map/review-decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewId: "review-1",
          decision: "dismiss_semantic",
          rationale: "该问题针对未展开 Stage，不适用于当前骨架。"
        })
      }),
      { params: Promise.resolve({ id: "d1" }) }
    );

    expect(response.status).toBe(200);
    expect(reviewServiceMock.resolveMapDraftQualityReview).toHaveBeenCalledWith({
      domainId: "d1",
      reviewId: "review-1",
      decision: "dismiss_semantic",
      rationale: "该问题针对未展开 Stage，不适用于当前骨架。"
    });
    await expect(response.json()).resolves.toMatchObject({ state: "resolved" });
  });

  it("rejects missing rationale before changing review state", async () => {
    const response = await POST(
      new Request("http://localhost/api/domains/d1/map/review-decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reviewId: "review-1",
          decision: "dismiss_semantic",
          rationale: ""
        })
      }),
      { params: Promise.resolve({ id: "d1" }) }
    );

    expect(response.status).toBe(400);
    expect(reviewServiceMock.resolveMapDraftQualityReview).not.toHaveBeenCalled();
  });
});
