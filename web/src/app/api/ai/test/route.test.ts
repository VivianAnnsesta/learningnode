import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const providerHealthServiceMock = vi.hoisted(() => ({
  testAiProviderConnection: vi.fn()
}));

vi.mock("../../../../lib/ai/providerHealthService", () => ({
  testAiProviderConnection: providerHealthServiceMock.testAiProviderConnection
}));

describe("AI provider test API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a successful provider test result", async () => {
    providerHealthServiceMock.testAiProviderConnection.mockResolvedValue({
      ok: true,
      provider: "lmstudio",
      baseUrl: "http://localhost:1234/v1",
      model: "local-model",
      latencyMs: 42,
      responsePreview: "连接成功。",
      aiCallLogId: "log-1",
      error: null
    });

    const response = await POST();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      provider: "lmstudio",
      aiCallLogId: "log-1"
    });
  });

  it("keeps the API non-throwing when provider test fails", async () => {
    providerHealthServiceMock.testAiProviderConnection.mockRejectedValue(
      new Error("connection refused")
    );

    const response = await POST();

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: "connection refused"
    });
  });
});
