import { beforeEach, describe, expect, it, vi } from "vitest";
import { testAiProviderConnection } from "./providerHealthService";

const providerMock = vi.hoisted(() => ({
  generateText: vi.fn()
}));

const openAiCompatibleMock = vi.hoisted(() => ({
  readOpenAiCompatibleConfig: vi.fn(),
  createOpenAiCompatibleProvider: vi.fn()
}));

const prismaMock = vi.hoisted(() => ({
  aiCallLog: {
    create: vi.fn()
  }
}));

vi.mock("./openaiCompatibleProvider", () => ({
  readOpenAiCompatibleConfig: openAiCompatibleMock.readOpenAiCompatibleConfig,
  createOpenAiCompatibleProvider:
    openAiCompatibleMock.createOpenAiCompatibleProvider
}));

vi.mock("../prisma", () => ({
  prisma: prismaMock
}));

describe("providerHealthService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    openAiCompatibleMock.readOpenAiCompatibleConfig.mockReturnValue({
      provider: "lmstudio",
      baseUrl: "http://localhost:1234/v1",
      model: "local-model",
      temperature: 0.25,
      timeoutMs: 45000
    });
    openAiCompatibleMock.createOpenAiCompatibleProvider.mockReturnValue(
      providerMock
    );
    prismaMock.aiCallLog.create.mockResolvedValue({ id: "log-1" });
  });

  it("returns ok and logs success when the provider responds", async () => {
    providerMock.generateText.mockResolvedValue({
      text: "连接成功。",
      raw: {}
    });

    const result = await testAiProviderConnection();

    expect(result).toMatchObject({
      ok: true,
      provider: "lmstudio",
      model: "local-model",
      responsePreview: "连接成功。",
      aiCallLogId: "log-1",
      error: null
    });
    expect(prismaMock.aiCallLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        taskType: "provider_test",
        status: "success",
        outputSummary: "连接成功。"
      })
    });
  });

  it("returns ok false and logs failure when the provider request fails", async () => {
    providerMock.generateText.mockRejectedValue(new Error("connection refused"));

    const result = await testAiProviderConnection();

    expect(result).toMatchObject({
      ok: false,
      provider: "lmstudio",
      error: "connection refused",
      aiCallLogId: "log-1"
    });
    expect(prismaMock.aiCallLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        taskType: "provider_test",
        status: "failed",
        errorMessage: "connection refused"
      })
    });
  });
});
