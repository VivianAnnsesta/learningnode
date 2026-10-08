import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiConfigurationError } from "../../../../../lib/ai/provider";
import { POST } from "./route";

const tutorServiceMock = vi.hoisted(() => ({
  generateRelationReactivationPlan: vi.fn()
}));

vi.mock("../../../../../lib/ai/tutorService", () => ({
  generateRelationReactivationPlan:
    tutorServiceMock.generateRelationReactivationPlan
}));

const params = { params: Promise.resolve({ id: "r1" }) };

const createRequest = (body: BodyInit) =>
  new Request("http://localhost/api/relations/r1/reactivation-plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body
  });

describe("relation reactivation plan API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes parsed body to tutor service", async () => {
    tutorServiceMock.generateRelationReactivationPlan.mockResolvedValue({
      plan: { summary: "先补证据" }
    });

    const response = await POST(
      createRequest(JSON.stringify({ canvasId: "c1" })),
      params
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.plan.summary).toBe("先补证据");
    expect(
      tutorServiceMock.generateRelationReactivationPlan
    ).toHaveBeenCalledWith("r1", { canvasId: "c1" });
  });

  it("falls back to empty payload when JSON is invalid", async () => {
    tutorServiceMock.generateRelationReactivationPlan.mockResolvedValue({
      plan: { summary: "默认复查建议" }
    });

    const response = await POST(createRequest("{"), params);

    expect(response.status).toBe(200);
    expect(
      tutorServiceMock.generateRelationReactivationPlan
    ).toHaveBeenCalledWith("r1", {});
  });

  it("returns 503 for AI configuration errors", async () => {
    tutorServiceMock.generateRelationReactivationPlan.mockRejectedValue(
      new AiConfigurationError("provider missing")
    );

    const response = await POST(
      createRequest(JSON.stringify({ canvasId: "c1" })),
      params
    );

    expect(response.status).toBe(503);
    const data = await response.json();
    expect(data.error).toBe("provider missing");
  });

  it("returns 500 for ordinary failures", async () => {
    tutorServiceMock.generateRelationReactivationPlan.mockRejectedValue(
      new Error("relation failed")
    );

    const response = await POST(
      createRequest(JSON.stringify({ canvasId: "c1" })),
      params
    );

    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe("relation failed");
  });
});
