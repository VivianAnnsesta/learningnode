import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiConfigurationError } from "../../../../../lib/ai/provider";
import { POST } from "./route";

const tutorServiceMock = vi.hoisted(() => ({
  generateIslandReactivationPlan: vi.fn()
}));

vi.mock("../../../../../lib/ai/tutorService", () => ({
  generateIslandReactivationPlan: tutorServiceMock.generateIslandReactivationPlan
}));

const params = { params: Promise.resolve({ id: "w1" }) };

const createRequest = (body: BodyInit) =>
  new Request("http://localhost/api/words/w1/reactivation-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body
  });

describe("word reactivation plan API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes parsed body to tutor service", async () => {
    tutorServiceMock.generateIslandReactivationPlan.mockResolvedValue({
      plan: { summary: "保留孤岛" }
    });

    const response = await POST(
      createRequest(JSON.stringify({ canvasId: "c1" })),
      params
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.plan.summary).toBe("保留孤岛");
    expect(tutorServiceMock.generateIslandReactivationPlan).toHaveBeenCalledWith(
      "w1",
      { canvasId: "c1" }
    );
  });

  it("falls back to empty payload when JSON is invalid", async () => {
    tutorServiceMock.generateIslandReactivationPlan.mockResolvedValue({
      plan: { summary: "默认回收建议" }
    });

    const response = await POST(createRequest("{"), params);

    expect(response.status).toBe(200);
    expect(tutorServiceMock.generateIslandReactivationPlan).toHaveBeenCalledWith(
      "w1",
      {}
    );
  });

  it("returns 503 for AI configuration errors", async () => {
    tutorServiceMock.generateIslandReactivationPlan.mockRejectedValue(
      new AiConfigurationError("missing model")
    );

    const response = await POST(
      createRequest(JSON.stringify({ canvasId: "c1" })),
      params
    );

    expect(response.status).toBe(503);
    const data = await response.json();
    expect(data.error).toBe("missing model");
  });

  it("returns 500 for ordinary failures", async () => {
    tutorServiceMock.generateIslandReactivationPlan.mockRejectedValue(
      new Error("reactivation failed")
    );

    const response = await POST(
      createRequest(JSON.stringify({ canvasId: "c1" })),
      params
    );

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe("reactivation failed");
  });
});
