import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const modelDiscoveryServiceMock = vi.hoisted(() => ({
  discoverAiModels: vi.fn()
}));

vi.mock("../../../../lib/ai/modelDiscoveryService", () => ({
  discoverAiModels: modelDiscoveryServiceMock.discoverAiModels
}));

describe("AI model discovery API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns discovered models for a provider draft", async () => {
    modelDiscoveryServiceMock.discoverAiModels.mockResolvedValue({
      provider: "qwen",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      models: [{ id: "qwen-plus", ownedBy: "qwen" }],
      source: "api",
      selectedModel: "qwen-plus",
      warning: null
    });

    const response = await POST(
      new Request("http://localhost/api/ai/models", {
        method: "POST",
        body: JSON.stringify({ provider: "qwen", apiKey: "sk-test" })
      })
    );

    expect(response.status).toBe(200);
    expect(modelDiscoveryServiceMock.discoverAiModels).toHaveBeenCalledWith({
      provider: "qwen",
      apiKey: "sk-test"
    });
    expect(await response.json()).toMatchObject({
      provider: "qwen",
      selectedModel: "qwen-plus"
    });
  });

  it("rejects invalid JSON", async () => {
    const response = await POST(
      new Request("http://localhost/api/ai/models", {
        method: "POST",
        body: "{"
      })
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toHaveProperty("error");
  });
});
