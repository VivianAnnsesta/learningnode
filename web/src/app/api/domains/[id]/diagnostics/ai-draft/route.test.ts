import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiConfigurationError } from "../../../../../../lib/ai/provider";
import { POST } from "./route";

const tutorServiceMock = vi.hoisted(() => ({
  generateDiagnosticDraft: vi.fn()
}));

vi.mock("../../../../../../lib/ai/tutorService", () => ({
  generateDiagnosticDraft: tutorServiceMock.generateDiagnosticDraft
}));

describe("domain diagnostic ai draft API", () => {
  const params = { params: Promise.resolve({ id: "d1" }) };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an AI draft", async () => {
    tutorServiceMock.generateDiagnosticDraft.mockResolvedValue({
      draft: { title: "AI draft" }
    });

    const response = await POST(
      new Request("http://localhost/api/domains/d1/diagnostics/ai-draft", {
        method: "POST"
      }),
      params
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      draft: { title: "AI draft" }
    });
  });

  it("returns 503 for AI configuration errors", async () => {
    tutorServiceMock.generateDiagnosticDraft.mockRejectedValue(
      new AiConfigurationError("AI not configured")
    );

    const response = await POST(
      new Request("http://localhost/api/domains/d1/diagnostics/ai-draft", {
        method: "POST"
      }),
      params
    );

    expect(response.status).toBe(503);
    expect((await response.json()).error).toBe("AI not configured");
  });
});
