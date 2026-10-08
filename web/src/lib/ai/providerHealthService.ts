import { prisma } from "../prisma";
import {
  createOpenAiCompatibleProvider,
  readOpenAiCompatibleConfig
} from "./openaiCompatibleProvider";
import { AiConfigurationError, truncateForLog } from "./provider";

export type AiProviderHealthResult = {
  ok: boolean;
  provider: string;
  baseUrl: string;
  model: string;
  latencyMs: number;
  responsePreview: string | null;
  aiCallLogId: string | null;
  error: string | null;
};

const unknownResult = (message: string): AiProviderHealthResult => ({
  ok: false,
  provider: "unconfigured",
  baseUrl: "",
  model: "",
  latencyMs: 0,
  responsePreview: null,
  aiCallLogId: null,
  error: message
});

export async function testAiProviderConnection(): Promise<AiProviderHealthResult> {
  const startedAt = Date.now();

  try {
    const config = readOpenAiCompatibleConfig();
    const provider = createOpenAiCompatibleProvider(config);
    const inputSummary = `Test AI provider connection: ${config.provider} ${config.baseUrl} ${config.model}`;

    try {
      const response = await provider.generateText({
        taskType: "provider_test",
        temperature: 0,
        timeoutMs: Math.min(config.timeoutMs, 15000),
        messages: [
          {
            role: "system",
            content:
              "You are checking whether an OpenAI-compatible chat endpoint works."
          },
          {
            role: "user",
            content:
              "Reply with one short Chinese sentence confirming the AI provider test succeeded."
          }
        ]
      });
      const latencyMs = Date.now() - startedAt;
      const log = await prisma.aiCallLog.create({
        data: {
          taskType: "provider_test",
          provider: config.provider,
          model: config.model,
          status: "success",
          inputSummary: truncateForLog(inputSummary),
          outputSummary: truncateForLog(response.text),
          latencyMs
        }
      });

      return {
        ok: true,
        provider: config.provider,
        baseUrl: config.baseUrl,
        model: config.model,
        latencyMs,
        responsePreview: truncateForLog(response.text, 300),
        aiCallLogId: log.id,
        error: null
      };
    } catch (error) {
      const latencyMs = Date.now() - startedAt;
      const message =
        error instanceof Error ? error.message : "AI provider test failed.";
      const log = await prisma.aiCallLog.create({
        data: {
          taskType: "provider_test",
          provider: config.provider,
          model: config.model,
          status: "failed",
          inputSummary: truncateForLog(inputSummary),
          errorMessage: truncateForLog(message, 2000),
          latencyMs
        }
      });

      return {
        ok: false,
        provider: config.provider,
        baseUrl: config.baseUrl,
        model: config.model,
        latencyMs,
        responsePreview: null,
        aiCallLogId: log.id,
        error: message
      };
    }
  } catch (error) {
    const message =
      error instanceof AiConfigurationError
        ? error.message
        : error instanceof Error
          ? error.message
          : "AI provider is not configured.";
    return unknownResult(message);
  }
}
