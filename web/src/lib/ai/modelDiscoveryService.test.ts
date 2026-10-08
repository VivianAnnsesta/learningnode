import { beforeEach, describe, expect, it, vi } from "vitest";
import { discoverAiModels } from "./modelDiscoveryService";

const openAiCompatibleMock = vi.hoisted(() => ({
  listOpenAiCompatibleModels: vi.fn()
}));

const settingsServiceMock = vi.hoisted(() => ({
  readAiProviderConfigFromSettings: vi.fn()
}));

vi.mock("./openaiCompatibleProvider", () => ({
  listOpenAiCompatibleModels: openAiCompatibleMock.listOpenAiCompatibleModels
}));

vi.mock("./settingsService", () => ({
  readAiProviderConfigFromSettings:
    settingsServiceMock.readAiProviderConfigFromSettings
}));

describe("modelDiscoveryService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    settingsServiceMock.readAiProviderConfigFromSettings.mockReturnValue(null);
  });

  it("uses built-in Qwen presets until an API key is available", async () => {
    const result = await discoverAiModels({
      provider: "qwen",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1"
    });

    expect(openAiCompatibleMock.listOpenAiCompatibleModels).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      provider: "qwen",
      source: "preset",
      selectedModel: "qwen-plus"
    });
    expect(result.models.map((model) => model.id)).toContain("qwen-plus");
    expect(result.warning).toBeTruthy();
  });

  it("loads DeepSeek models from the provider models endpoint when an API key is present", async () => {
    openAiCompatibleMock.listOpenAiCompatibleModels.mockResolvedValue([
      { id: "deepseek-v4-pro", ownedBy: "deepseek" },
      { id: "deepseek-v4-flash", ownedBy: "deepseek" }
    ]);

    const result = await discoverAiModels({
      provider: "deepseek",
      apiKey: "sk-test"
    });

    expect(openAiCompatibleMock.listOpenAiCompatibleModels).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "deepseek",
        baseUrl: "https://api.deepseek.com",
        apiKey: "sk-test",
        model: "deepseek-v4-flash"
      })
    );
    expect(result).toMatchObject({
      provider: "deepseek",
      source: "api",
      selectedModel: "deepseek-v4-flash",
      warning: null
    });
  });

  it("does not automatically upgrade DeepSeek Flash to Pro when Flash is absent", async () => {
    openAiCompatibleMock.listOpenAiCompatibleModels.mockResolvedValue([
      { id: "deepseek-v4-pro", ownedBy: "deepseek" }
    ]);

    const result = await discoverAiModels({
      provider: "deepseek",
      apiKey: "sk-test"
    });

    expect(result.selectedModel).toBe("deepseek-v4-flash");
    expect(result.warning).toContain("不会自动切换 V4 Pro");
  });

  it("filters non-chat provider models before selecting a model", async () => {
    openAiCompatibleMock.listOpenAiCompatibleModels.mockResolvedValue([
      { id: "qwen-image-2.0-pro", ownedBy: "system" },
      { id: "qwen3-asr-flash", ownedBy: "system" },
      { id: "glm-5.2", ownedBy: "system" },
      { id: "qwen-plus", ownedBy: "system" }
    ]);

    const result = await discoverAiModels({
      provider: "qwen",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey: "sk-test"
    });

    expect(result.source).toBe("api");
    expect(result.models.map((model) => model.id)).toEqual([
      "glm-5.2",
      "qwen-plus"
    ]);
    expect(result.selectedModel).toBe("glm-5.2");
  });

  it("falls back to provider presets when model discovery fails", async () => {
    openAiCompatibleMock.listOpenAiCompatibleModels.mockRejectedValue(
      new Error("bad key")
    );

    const result = await discoverAiModels({
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-test"
    });

    expect(result).toMatchObject({
      provider: "openai",
      source: "preset",
      selectedModel: "gpt-4.1-mini"
    });
    expect(result.models.map((model) => model.id)).toContain("gpt-4.1-mini");
    expect(result.warning).toContain("bad key");
  });
});
