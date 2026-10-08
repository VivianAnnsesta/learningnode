import {
  AiConfigurationError,
  AiProviderError,
  aiProviderDefaultBaseUrls,
  isAiProviderName,
  normalizeMaxTokens,
  normalizeTimeoutMs,
  requiresApiKey,
  type AiGenerateTextInput,
  type AiGenerateTextResult,
  type AiMessage,
  type AiProvider,
  type AiProviderConfig,
  type AiProviderName,
  type AiResearchSource
} from "./provider";
import { readAiProviderConfigFromSettings } from "./settingsService";

type ChatCompletionMessage = {
  role?: string;
  content?: unknown;
  reasoning_content?: unknown;
};

type ChatCompletionChoice = {
  finish_reason?: unknown;
  message?: ChatCompletionMessage;
};

type ChatCompletionResponse = {
  choices?: ChatCompletionChoice[];
  error?: {
    message?: string;
  };
};

type ResponsesApiResponse = {
  id?: unknown;
  output_text?: unknown;
  output?: unknown;
  error?: {
    message?: string;
  };
};

type ListModelsResponse = {
  object?: string;
  data?: Array<{
    id?: unknown;
    object?: unknown;
    owned_by?: unknown;
  }>;
  error?: {
    message?: string;
  };
};

export type AiModelInfo = {
  id: string;
  ownedBy: string | null;
};

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const numberFromEnv = (value: string | undefined, fallback: number) => {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getProviderName = (): AiProviderName => {
  const value = process.env.AI_PROVIDER?.trim().toLowerCase();
  if (value && isAiProviderName(value)) {
    return value;
  }
  if (process.env.AI_BASE_URL?.trim()) return "openai-compatible";
  throw new AiConfigurationError(
    "AI provider is not configured. Set AI_PROVIDER to openai, qwen, deepseek, lmstudio, or openai-compatible."
  );
};

export function readOpenAiCompatibleConfig(): AiProviderConfig {
  const settingsConfig = readAiProviderConfigFromSettings();
  if (settingsConfig) {
    return settingsConfig;
  }

  const provider = getProviderName();
  const baseUrl =
    process.env.AI_BASE_URL?.trim() ||
    aiProviderDefaultBaseUrls[provider];
  const apiKey =
    process.env.AI_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    process.env.DASHSCOPE_API_KEY?.trim() ||
    process.env.QWEN_API_KEY?.trim() ||
    process.env.DEEPSEEK_API_KEY?.trim();
  const model = process.env.AI_MODEL?.trim();

  if (!model) {
    throw new AiConfigurationError(
      "AI_MODEL is not configured. For LM Studio, use the loaded model identifier."
    );
  }
  if (!baseUrl) {
    throw new AiConfigurationError(
      "AI_BASE_URL is required for openai-compatible providers."
    );
  }

  if (requiresApiKey(provider) && !apiKey) {
    throw new AiConfigurationError(
      `${provider} provider requires AI_API_KEY or a provider-specific API key.`
    );
  }

  return {
    provider,
    baseUrl: trimTrailingSlash(baseUrl),
    apiKey,
    model,
    temperature: numberFromEnv(process.env.AI_TEMPERATURE, 0.25),
    timeoutMs: normalizeTimeoutMs(
      numberFromEnv(process.env.AI_TIMEOUT_MS, 45000),
      45000
    ),
    maxTokens: process.env.AI_MAX_TOKENS
      ? numberFromEnv(process.env.AI_MAX_TOKENS, 1800)
      : undefined
  };
}

const normalizeContent = (content: unknown) => {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (
          part &&
          typeof part === "object" &&
          "text" in part &&
          typeof part.text === "string"
        ) {
          return part.text;
        }
        return "";
      })
      .filter(Boolean)
      .join("");
  }
  return "";
};

const textLength = (content: unknown) => normalizeContent(content).trim().length;

const responseOutputText = (raw: ResponsesApiResponse) => {
  if (typeof raw.output_text === "string" && raw.output_text.trim()) {
    return raw.output_text;
  }
  if (!Array.isArray(raw.output)) return "";
  return raw.output
    .flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const content = (item as { content?: unknown }).content;
      if (!Array.isArray(content)) return [];
      return content.map((part) => {
        if (!part || typeof part !== "object") return "";
        const value = part as { type?: unknown; text?: unknown };
        return value.type === "output_text" && typeof value.text === "string"
          ? value.text
          : "";
      });
    })
    .filter(Boolean)
    .join("");
};

const collectResponsesSources = (raw: ResponsesApiResponse): AiResearchSource[] => {
  const cited: AiResearchSource[] = [];
  const searched: AiResearchSource[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== "object") return;
    const record = value as Record<string, unknown>;
    if (
      typeof record.url === "string" &&
      record.url.trim() &&
      (record.type === "url" || record.type === "url_citation")
    ) {
      const source = {
        url: record.url.trim(),
        ...(typeof record.title === "string" && record.title.trim()
          ? { title: record.title.trim() }
          : {})
      };
      (record.type === "url_citation" ? cited : searched).push(source);
    }
    Object.values(record).forEach(visit);
  };
  visit(raw.output);

  const unique = new Map<string, AiResearchSource>();
  for (const source of cited.length ? cited : searched) {
    const existing = unique.get(source.url);
    unique.set(source.url, {
      url: source.url,
      ...(source.title || existing?.title
        ? { title: source.title || existing?.title }
        : {})
    });
  }
  return [...unique.values()];
};

const toRequestMessage = (message: AiMessage) => ({
  role: message.role,
  content: message.content
});

const truthyEnv = (value: string | undefined) => {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
};

const parseJsonObjectEnv = (name: string) => {
  const raw = process.env[name]?.trim();
  if (!raw) return {};

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    throw new AiConfigurationError(
      `${name} must be a valid JSON object.`
    );
  }
};

const parseResearchExtraBody = () =>
  parseJsonObjectEnv("AI_RESEARCH_EXTRA_BODY_JSON");

const parseRequestExtraBody = () => parseJsonObjectEnv("AI_EXTRA_BODY_JSON");

const boolFromEnv = (value: string | undefined) => {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return undefined;
};

const modelCanToggleThinking = (model: string) => {
  const normalized = model.trim().toLowerCase();
  if (!normalized) return false;
  if (
    normalized.includes("thinking") ||
    normalized.includes("deepseek-r1") ||
    normalized.includes("qwq")
  ) {
    return false;
  }
  return (
    normalized.startsWith("glm-") ||
    normalized.startsWith("qwen") ||
    normalized.startsWith("deepseek-v4") ||
    normalized.includes("/deepseek-v3") ||
    normalized.includes("/deepseek-v4")
  );
};

const buildRequestBody = (
  config: AiProviderConfig,
  input: AiGenerateTextInput
) => {
  const extraBody = parseRequestExtraBody();
  const configuredThinking = boolFromEnv(process.env.AI_ENABLE_THINKING);
  const usesDeepSeekThinkingParameter =
    config.provider === "deepseek" && modelCanToggleThinking(config.model);
  const body: Record<string, unknown> = {};

  if (configuredThinking !== undefined) {
    if (usesDeepSeekThinkingParameter) {
      body.thinking = {
        type: configuredThinking ? "enabled" : "disabled"
      };
    } else {
      body.enable_thinking = configuredThinking;
    }
  } else if (
    !input.requiresWebResearch &&
    modelCanToggleThinking(config.model)
  ) {
    if (usesDeepSeekThinkingParameter) {
      body.thinking = { type: "disabled" };
    } else if (config.provider === "qwen") {
      body.enable_thinking = false;
    }
  }

  return {
    ...body,
    ...extraBody
  };
};

const buildResearchBody = (config: AiProviderConfig) => {
  const extraBody = parseResearchExtraBody();
  const shouldUseOpenAiWebSearch =
    config.provider === "openai" &&
    !truthyEnv(process.env.AI_DISABLE_OPENAI_WEB_SEARCH);
  const shouldUseQwenWebSearch =
    config.provider === "qwen" &&
    !truthyEnv(process.env.AI_DISABLE_QWEN_WEB_SEARCH);

  if (shouldUseQwenWebSearch) {
    return {
      enable_search: true,
      search_options: {
        forced_search: true
      },
      ...extraBody
    };
  }

  if (!shouldUseOpenAiWebSearch) return extraBody;

  return {
    tools: [{ type: "web_search_preview" }],
    tool_choice: "auto",
    ...extraBody
  };
};

export function createOpenAiCompatibleProvider(
  config = readOpenAiCompatibleConfig()
): AiProvider {
  return {
    config,
    async generateText(input: AiGenerateTextInput): Promise<AiGenerateTextResult> {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        normalizeTimeoutMs(input.timeoutMs ?? config.timeoutMs, config.timeoutMs)
      );

      const useDeepSeekResponses =
        config.provider === "deepseek" && input.requiresWebResearch === true;
      const body: Record<string, unknown> = useDeepSeekResponses
        ? {
            model: config.model,
            input: input.messages.map(toRequestMessage),
            temperature: input.temperature ?? config.temperature,
            stream: false,
            tools: [{ type: "web_search" }],
            tool_choice: "required"
          }
        : {
        model: config.model,
        messages: input.messages.map(toRequestMessage),
        temperature: input.temperature ?? config.temperature,
        stream: false
          };

      if (input.responseFormat === "json_object") {
        if (useDeepSeekResponses) {
          body.text = { format: { type: "json_object" } };
        } else {
          body.response_format = { type: "json_object" };
        }
      }
      const maxTokens = normalizeMaxTokens(input.maxTokens ?? config.maxTokens);
      if (maxTokens) {
        body[useDeepSeekResponses ? "max_output_tokens" : "max_tokens"] = maxTokens;
      }
      if (input.requiresWebResearch && !useDeepSeekResponses) {
        Object.assign(body, buildResearchBody(config));
      }
      if (!useDeepSeekResponses) {
        Object.assign(body, buildRequestBody(config, input));
      } else {
        Object.assign(body, parseRequestExtraBody(), parseResearchExtraBody());
      }

      try {
        const response = await fetch(
          `${config.baseUrl}/${useDeepSeekResponses ? "responses" : "chat/completions"}`,
          {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {})
          },
          body: JSON.stringify(body),
          signal: controller.signal
          }
        );

        const responseBody = await response.text();
        let parsedBody: unknown;
        try { parsedBody = JSON.parse(responseBody); }
        catch { parsedBody = { responseText: responseBody }; }
        const raw = (parsedBody && typeof parsedBody === "object" ? parsedBody : { unexpectedBody: parsedBody }) as ChatCompletionResponse | ResponsesApiResponse;
        const responseId = "id" in raw && typeof raw.id === "string" ? raw.id : response.headers.get("x-request-id") || response.headers.get("request-id") || undefined;
        const evidence = (text = "", sources?: AiResearchSource[]) => ({ text, raw, providerRequestId: responseId, ...(sources ? { sources } : {}) });
        if (!response.ok) {
          throw new AiProviderError(
            raw.error?.message || `AI request failed with status ${response.status}`,
            response.status,
            evidence()
          );
        }

        if (useDeepSeekResponses) {
          const responsesRaw = raw as ResponsesApiResponse;
          const text = responseOutputText(responsesRaw);
          if (!text.trim()) {
            throw new AiProviderError("AI response did not include assistant text.", response.status, evidence(text));
          }
          const sources = collectResponsesSources(responsesRaw);
          return evidence(text, sources);
        }

        const choice = (raw as ChatCompletionResponse).choices?.[0];
        const text = normalizeContent(choice?.message?.content);
        if (!text.trim()) {
          const finishReason =
            typeof choice?.finish_reason === "string"
              ? choice.finish_reason
              : "";
          const reasoningLength = textLength(choice?.message?.reasoning_content);
          if (finishReason === "length" && reasoningLength > 0) {
            throw new AiProviderError(
              "AI response exhausted max_tokens during reasoning before final answer.", response.status, evidence(text)
            );
          }
          throw new AiProviderError("AI response did not include assistant text.", response.status, evidence(text));
        }

        return evidence(text);
      } catch (error) {
        if (error instanceof AiProviderError) throw error;
        if (error instanceof Error && error.name === "AbortError") {
          throw new AiProviderError("AI request timed out.");
        }
        const message =
          error instanceof Error ? error.message : "AI request failed.";
        throw new AiProviderError(message);
      } finally {
        clearTimeout(timeout);
      }
    }
  };
}

export async function listOpenAiCompatibleModels(
  config = readOpenAiCompatibleConfig()
): Promise<AiModelInfo[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Math.min(config.timeoutMs, 15000));

  try {
    const response = await fetch(`${config.baseUrl}/models`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {})
      },
      signal: controller.signal
    });

    const raw = (await response.json().catch(() => ({}))) as ListModelsResponse;
    if (!response.ok) {
      throw new AiProviderError(
        raw.error?.message || `AI model list request failed with status ${response.status}`,
        response.status
      );
    }

    return (raw.data || [])
      .map((model) => ({
        id: typeof model.id === "string" ? model.id.trim() : "",
        ownedBy: typeof model.owned_by === "string" ? model.owned_by : null
      }))
      .filter((model) => model.id);
  } catch (error) {
    if (error instanceof AiProviderError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new AiProviderError("AI model list request timed out.");
    }
    const message =
      error instanceof Error ? error.message : "AI model list request failed.";
    throw new AiProviderError(message);
  } finally {
    clearTimeout(timeout);
  }
}
