import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

const coreReviewServiceMock = vi.hoisted(() => ({
  getLegacyCoreReview: vi.fn(),
  saveLegacyCoreReview: vi.fn(),
  LegacyCoreReviewError: class LegacyCoreReviewError extends Error {
    status: number;

    constructor(message: string, status = 400) {
      super(message);
      this.status = status;
    }
  }
}));

vi.mock("../../../../../lib/learning/coreReviewService", () => ({
  getLegacyCoreReview: coreReviewServiceMock.getLegacyCoreReview,
  saveLegacyCoreReview: coreReviewServiceMock.saveLegacyCoreReview,
  LegacyCoreReviewError: coreReviewServiceMock.LegacyCoreReviewError
}));

const params = { params: Promise.resolve({ id: "w1" }) };

describe("core review API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("loads compatibility review data through the shared service", async () => {
    coreReviewServiceMock.getLegacyCoreReview.mockResolvedValue({
      core: { id: "core1" },
      versions: [],
      reviews: []
    });

    const response = await GET(
      new Request("http://localhost/api/words/w1/core-review?canvasId=c1"),
      params
    );

    expect(response.status).toBe(200);
    expect(coreReviewServiceMock.getLegacyCoreReview).toHaveBeenCalledWith(
      "w1",
      "c1"
    );
  });

  it("rejects GET without canvasId", async () => {
    const response = await GET(
      new Request("http://localhost/api/words/w1/core-review"),
      params
    );

    expect(response.status).toBe(400);
  });

  it("saves compatibility review data through the shared service", async () => {
    coreReviewServiceMock.saveLegacyCoreReview.mockResolvedValue({
      review: { id: "r1" }
    });

    const response = await POST(
      new Request("http://localhost/api/words/w1/core-review?canvasId=c1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userRecall: "recall" })
      }),
      params
    );

    expect(response.status).toBe(200);
    expect(coreReviewServiceMock.saveLegacyCoreReview).toHaveBeenCalledWith(
      "w1",
      "c1",
      { userRecall: "recall" }
    );
  });

  it("maps shared service validation errors to route responses", async () => {
    coreReviewServiceMock.saveLegacyCoreReview.mockRejectedValue(
      new coreReviewServiceMock.LegacyCoreReviewError("invalid", 422)
    );

    const response = await POST(
      new Request("http://localhost/api/words/w1/core-review?canvasId=c1", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userRecall: "recall" })
      }),
      params
    );

    expect(response.status).toBe(422);
    const data = await response.json();
    expect(data.error).toBe("invalid");
  });
});
