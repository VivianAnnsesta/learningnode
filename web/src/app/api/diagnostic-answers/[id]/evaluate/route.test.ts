import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiConfigurationError } from "../../../../../lib/ai/provider";
import { POST } from "./route";

const tutorServiceMock = vi.hoisted(() => ({
  evaluateDiagnosticAnswer: vi.fn()
}));

vi.mock("../../../../../lib/ai/tutorService", () => ({
  evaluateDiagnosticAnswer: tutorServiceMock.evaluateDiagnosticAnswer
}));

describe("semantic diagnostic answer evaluate API", () => {
  const params = { params: Promise.resolve({ id: "answer-1" }) };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns evaluation result", async () => {
    tutorServiceMock.evaluateDiagnosticAnswer.mockResolvedValue({
      answerId: "answer-1",
      score: 0.74
    });

    const response = await POST(
      new Request("http://localhost/api/diagnostic-answers/answer-1/evaluate", {
        method: "POST"
      }),
      params
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      answerId: "answer-1",
      score: 0.74
    });
  });

  it("returns 503 for AI configuration errors", async () => {
    tutorServiceMock.evaluateDiagnosticAnswer.mockRejectedValue(
      new AiConfigurationError("AI not configured")
    );

    const response = await POST(
      new Request("http://localhost/api/diagnostic-answers/answer-1/evaluate", {
        method: "POST"
      }),
      params
    );

    expect(response.status).toBe(503);
    expect((await response.json()).error).toBe("AI not configured");
  });
});
