import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

const roadmapServiceMock = vi.hoisted(() => ({
  getStageAssessmentSummaries: vi.fn(),
  applyStageAssessment: vi.fn()
}));

vi.mock("../../../../../lib/learning/roadmapService", () => ({
  getStageAssessmentSummaries: roadmapServiceMock.getStageAssessmentSummaries,
  applyStageAssessment: roadmapServiceMock.applyStageAssessment
}));

const params = { params: Promise.resolve({ id: "d1" }) };

const createRequest = (body: BodyInit) =>
  new Request("http://localhost/api/domains/d1/stage-assessment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body
  });

describe("domain stage assessment API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns stage summaries from GET", async () => {
    roadmapServiceMock.getStageAssessmentSummaries.mockResolvedValue({
      stages: [{ stageId: "s1", readiness: "ready_for_assessment" }]
    });

    const response = await GET(
      new Request("http://localhost/api/domains/d1/stage-assessment"),
      params
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.stages[0].stageId).toBe("s1");
    expect(roadmapServiceMock.getStageAssessmentSummaries).toHaveBeenCalledWith(
      "d1"
    );
  });

  it("returns 400 when stageId is missing", async () => {
    const response = await POST(
      createRequest(JSON.stringify({ stageId: "" })),
      params
    );

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("stageId 不能为空。");
  });

  it("returns 400 when JSON is invalid", async () => {
    const response = await POST(createRequest("{"), params);

    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toBe("无效的 JSON。");
  });

  it("applies stage assessment from POST", async () => {
    roadmapServiceMock.applyStageAssessment.mockResolvedValue({
      roadmap: { status: "confirmed" },
      stage: { stageId: "s1" }
    });

    const response = await POST(
      createRequest(JSON.stringify({ stageId: "s1" })),
      params
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.roadmap.status).toBe("confirmed");
    expect(roadmapServiceMock.applyStageAssessment).toHaveBeenCalledWith(
      "d1",
      "s1"
    );
  });

  it("returns 404 when the stage is not found", async () => {
    roadmapServiceMock.applyStageAssessment.mockRejectedValue(
      new Error("阶段不存在")
    );

    const response = await POST(
      createRequest(JSON.stringify({ stageId: "missing" })),
      params
    );

    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data.error).toBe("阶段不存在");
  });
});
