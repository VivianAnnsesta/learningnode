import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiConfigurationError } from "../../../../../lib/ai/provider";
import { POST } from "./route";

const tutorServiceMock = vi.hoisted(() => ({
  generateTransferChallenge: vi.fn()
}));

vi.mock("../../../../../lib/ai/tutorService", () => ({
  generateTransferChallenge: tutorServiceMock.generateTransferChallenge
}));

const params = { params: Promise.resolve({ id: "w1" }) };

const createRequest = (body: BodyInit) =>
  new Request("http://localhost/api/words/w1/transfer-challenge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body
  });

describe("word transfer challenge API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes parsed body to tutor service", async () => {
    tutorServiceMock.generateTransferChallenge.mockResolvedValue({
      challenge: { prompt: "test" }
    });

    const response = await POST(
      createRequest(JSON.stringify({ canvasId: "c1", userGoal: "goal" })),
      params
    );

    expect(response.status).toBe(200);
    expect(tutorServiceMock.generateTransferChallenge).toHaveBeenCalledWith(
      "w1",
      { canvasId: "c1", userGoal: "goal" }
    );
  });

  it("falls back to empty payload when JSON is invalid", async () => {
    tutorServiceMock.generateTransferChallenge.mockResolvedValue({
      challenge: { prompt: "default" }
    });

    const response = await POST(createRequest("{"), params);

    expect(response.status).toBe(200);
    expect(tutorServiceMock.generateTransferChallenge).toHaveBeenCalledWith(
      "w1",
      {}
    );
  });

  it("returns 503 for AI configuration errors", async () => {
    tutorServiceMock.generateTransferChallenge.mockRejectedValue(
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
});
