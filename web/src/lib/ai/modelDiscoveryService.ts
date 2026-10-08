import {
  aiProviderDefaultBaseUrls,
  aiProviderDefaultModelIds,
  isAiProviderName,
  requiresApiKey,
  type AiProviderConfig,
  type AiProviderName
} from "./provider";
import {
  listOpenAiCompatibleModels,
  type AiModelInfo
} from "./openaiCompatibleProvider";
import { readAiProviderConfigFromSettings } from "./settingsService";

export type AiModelDiscoveryInput = {
  provider?: string | null;
  baseUrl?: string | null;
  apiKey?: string | null;
  model?: string | null;
  timeoutMs?: number | string | null;
};

export type AiModelDiscoveryResult = {
  provider: AiProviderName;
  baseUrl: string;
  models: AiModelInfo[];
  source: "api" | "preset";
  selectedModel: string;
  warning: string | null;
};

const normalizeText = (value?: string | null) => {
  const next = value?.trim();
  return next ? next : undefined;
};

const normalizeProvider = (value?: string | null): AiProviderName | undefined => {
  const next = value?.trim().toLowerCase();
  return next && isAiProviderName(next) ? next : undefined;
};

const normalizeNumber = (value: number | string | null | undefined, fallback: number) => {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const presetModels = (provider: AiProviderName) =>
  aiProviderDefaultModelIds[provider].map((id) => ({ id, ownedBy: provider }));

const nonChatModelPatterns = [
  "image",
  "asr",
  "tts",
  "ocr",
  "audio",
  "speech",
  "realtime",
  "livetranslate",
  "embedding",
  "rerank",
  "vl-ocr"
];

const preferredChatModelPatterns = [
  "glm",
  "deepseek-v4-flash",
  "deepseek-chat",
  "deepseek-v4-pro",
  "qwen-plus",
  "qwen-max",
  "qwen-turbo",
  "qwen-flash",
  "qwen-long",
  "kimi",
  "deepseek",
  "coder"
];

const isLikelyChatModel = (model: AiModelInfo) => {
  const id = model.id.toLowerCase();
  return !nonChatModelPatterns.some((pattern) => id.includes(pattern));
};

const rankModel = (model: AiModelInfo) => {
  const id = model.id.toLowerCase();
  const preferredIndex = preferredChatModelPatterns.findIndex((pattern) =>
    id.includes(pattern)
  );
  return preferredIndex === -1 ? preferredChatModelPatterns.length : preferredIndex;
};

const normalizeDiscoveredModels = (models: AiModelInfo[]) => {
  const unique = new Map<string, AiModelInfo>();
  for (const model of models) {
    if (!model.id.trim() || !isLikelyChatModel(model)) continue;
    unique.set(model.id, model);
  }
  return Array.from(unique.values()).sort((left, right) => {
    const rankDiff = rankModel(left) - rankModel(right);
    return rankDiff !== 0 ? rankDiff : left.id.localeCompare(right.id);
  });
};

const chooseModel = (
  models: AiModelInfo[],
  preferred?: string | null,
  provider?: AiProviderName
) => {
  const wanted = preferred?.trim();
  if (wanted && models.some((model) => model.id === wanted)) return wanted;
  if (wanted && provider === "deepseek") return wanted;
  if (wanted && models.length === 0) return wanted;
  if (provider === "deepseek") return aiProviderDefaultModelIds.deepseek[0];
  return models[0]?.id || wanted || "";
};

export async function discoverAiModels(
  input: AiModelDiscoveryInput = {}
): Promise<AiModelDiscoveryResult> {
  const saved = readAiProviderConfigFromSettings();
  const provider =
    normalizeProvider(input.provider) ||
    saved?.provider ||
    (normalizeText(input.baseUrl) ? "openai-compatible" : "lmstudio");
  const baseUrl =
    normalizeText(input.baseUrl) ||
    saved?.baseUrl ||
    aiProviderDefaultBaseUrls[provider];
  const apiKey = normalizeText(input.apiKey) || saved?.apiKey;
  const preferredModel = normalizeText(input.model) || saved?.model;

  if (!baseUrl) {
    return {
      provider,
      baseUrl,
      models: presetModels(provider),
      source: "preset",
      selectedModel: chooseModel(presetModels(provider), preferredModel, provider),
      warning: "请先填写接口地址，再读取模型列表。"
    };
  }

  if (requiresApiKey(provider) && !apiKey) {
    const models = presetModels(provider);
    return {
      provider,
      baseUrl,
      models,
      source: "preset",
      selectedModel: chooseModel(models, preferredModel, provider),
      warning: "填写 API Key 后可以自动读取该账号可用模型。"
    };
  }

  try {
    const config: AiProviderConfig = {
      provider,
      baseUrl: baseUrl.replace(/\/+$/, ""),
      apiKey,
      model: preferredModel || presetModels(provider)[0]?.id || "model",
      temperature: 0,
      timeoutMs: normalizeNumber(input.timeoutMs, saved?.timeoutMs || 15000)
    };
    const models = normalizeDiscoveredModels(
      await listOpenAiCompatibleModels(config)
    );
    const selectedModel = chooseModel(models, preferredModel, provider);
    const preservedDeepSeekDefault =
      provider === "deepseek" &&
      Boolean(selectedModel) &&
      !models.some((model) => model.id === selectedModel);
    return {
      provider,
      baseUrl: config.baseUrl,
      models,
      source: "api",
      selectedModel,
      warning: preservedDeepSeekDefault
        ? "默认或当前 DeepSeek 模型未出现在接口列表中；系统不会自动切换 V4 Pro，请确认后手动选择。"
        : models.length
          ? null
          : "接口返回了空模型列表，请手动填写模型 ID。"
    };
  } catch (error) {
    const models = presetModels(provider);
    return {
      provider,
      baseUrl,
      models,
      source: "preset",
      selectedModel: chooseModel(models, preferredModel, provider),
      warning:
        error instanceof Error
          ? `读取模型列表失败，已使用内置推荐：${error.message}`
          : "读取模型列表失败，已使用内置推荐。"
    };
  }
}
