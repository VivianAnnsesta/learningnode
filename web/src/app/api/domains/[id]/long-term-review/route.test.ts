import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiConfigurationError } from "../../../../../lib/ai/provider";
import { GET, POST } from "./route";

const roadmapServiceMock = vi.hoisted(() => ({
  getLongTermReviewSummary: vi.fn()
}));

const tutorServiceMock = vi.hoisted(() => ({
  generateLongTermReviewInsightPack: vi.fn()
}));

vi.mock("../../../../../lib/learning/roadmapService", () => ({
  getLongTermReviewSummary: roadmapServiceMock.getLongTermReviewSummary
}));

vi.mock("../../../../../lib/ai/tutorService", () => ({
  generateLongTermReviewInsightPack:
    tutorServiceMock.generateLongTermReviewInsightPack
}));

const params = { params: Promise.resolve({ id: "d1" }) };

describe("domain long-term review API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns summary from GET", async () => {
    roadmapServiceMock.getLongTermReviewSummary.mockResolvedValue({
      overdueCount: 2,
      nextActions: ["先处理逾期知识点"]
    });

    const response = await GET(
      new Request("http://localhost/api/domains/d1/long-term-review"),
      params
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.summary.overdueCount).toBe(2);
    expect(roadmapServiceMock.getLongTermReviewSummary).toHaveBeenCalledWith(
      "d1"
    );
  });

  it("returns 500 when GET fails", async () => {
    roadmapServiceMock.getLongTermReviewSummary.mockRejectedValue(
      new Error("summary failed")
    );

    const response = await GET(
      new Request("http://localhost/api/domains/d1/long-term-review"),
      params
    );

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe("summary failed");
  });

  it("returns generated pack from POST", async () => {
    tutorServiceMock.generateLongTermReviewInsightPack.mockResolvedValue({
      pack: {
        summary: "本轮优先跨学科迁移",
        crossDomainTransferChallenges: [],
        wormholeMisuseAlerts: [],
        nextActions: []
      }
    });

    const response = await POST(
      new Request("http://localhost/api/domains/d1/long-term-review", {
        method: "POST"
      }),
      params
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.pack.summary).toBe("本轮优先跨学科迁移");
    expect(
      tutorServiceMock.generateLongTermReviewInsightPack
    ).toHaveBeenCalledWith("d1");
  });

  it("returns 503 when POST hits AI configuration error", async () => {
    tutorServiceMock.generateLongTermReviewInsightPack.mockRejectedValue(
      new AiConfigurationError("AI not configured")
    );

    const response = await POST(
      new Request("http://localhost/api/domains/d1/long-term-review", {
        method: "POST"
      }),
      params
    );

    expect(response.status).toBe(503);
    const data = await response.json();
    expect(data.error).toBe("AI not configured");
  });
});
