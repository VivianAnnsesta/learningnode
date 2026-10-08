import fs from "node:fs";
import path from "node:path";
import {
  aiProviderDefaultBaseUrls,
  isAiProviderName,
  normalizeMaxTokens,
  normalizeTimeoutMs,
  requiresApiKey,
  type AiProviderConfig,
  type AiProviderName
} from "./provider";
import { isAllowedAiProviderUrl } from "../security/aiProviderUrl";

export type AiSettingsInput = {
  provider?: string | null;
  baseUrl?: string | null;
  apiKey?: string | null;
  model?: string | null;
  temperature?: number | string | null;
  timeoutMs?: number | string | null;
  maxTokens?: number | string | null;
};

export type PersistedAiSettings = {
  provider?: AiProviderName;
  baseUrl?: string;
  apiKey?: string;
  model?: string;
  temperature?: number;
  timeoutMs?: number;
  maxTokens?: number;
  updatedAt?: string;
};

const settingsPath = () => process.env.AI_SETTINGS_PATH?.trim() || null;

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

const normalizeProvider = (value?: string | null): AiProviderName | undefined => {
  const next = value?.trim().toLowerCase();
  if (next && isAiProviderName(next)) {
    return next;
  }
  return undefined;
};

const normalizeText = (value?: string | null) => {
  const next = value?.trim();
  return next ? next : undefined;
};

const normalizeNumber = (
  value: number | string | null | undefined,
  fallback?: number
) => {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeOptionalMaxTokens = (value: number | string | null | undefined) => {
  const parsed = normalizeNumber(value);
  return normalizeMaxTokens(parsed);
};

const maskApiKey = (apiKey?: string) => {
  if (!apiKey) return "";
  if (apiKey.length <= 8) return "********";
  return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
};

export function readPersistedAiSettings(): PersistedAiSettings | null {
  const filePath = settingsPath();
  if (!filePath || !fs.existsSync(filePath)) return null;

  try {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf8")) as PersistedAiSettings;
    return raw && typeof raw === "object" ? raw : null;
  } catch {
    return null;
  }
}

export function writePersistedAiSettings(input: AiSettingsInput) {
  const current = readPersistedAiSettings();
  const provider = normalizeProvider(input.provider) ?? current?.provider;
  const apiKeyInput = input.apiKey;
  const baseUrl = normalizeText(input.baseUrl);
  if (!baseUrl || !isAllowedAiProviderUrl(baseUrl)) {
    throw new Error("AI 服务地址必须是 HTTPS，或本机回环地址上的 HTTP 服务。");
  }
  const filePath = settingsPath();
  if (!filePath) {
    throw new Error("AI 设置只能由桌面运行时写入用户数据目录。");
  }
  const next: PersistedAiSettings = {
    provider,
    baseUrl,
    apiKey:
      apiKeyInput === undefined
        ? current?.apiKey
        : normalizeText(apiKeyInput) || undefined,
    model: normalizeText(input.model),
    temperature: normalizeNumber(input.temperature, 0.25),
    timeoutMs: normalizeTimeoutMs(normalizeNumber(input.timeoutMs), 45000),
    maxTokens: normalizeOptionalMaxTokens(input.maxTokens),
    updatedAt: new Date().toISOString()
  };

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2), "utf8");
  return next;
}

export function deletePersistedAiSettings() {
  const filePath = settingsPath();
  if (filePath && fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

export function readAiProviderConfigFromSettings(): AiProviderConfig | null {
  const saved = readPersistedAiSettings();
  if (!saved?.provider && !saved?.baseUrl && !saved?.model) return null;

  const provider =
    saved.provider ||
    normalizeProvider(process.env.AI_PROVIDER) ||
    (saved.baseUrl ? "openai-compatible" : undefined);
  if (!provider) return null;

  const baseUrl =
    saved.baseUrl ||
    process.env.AI_BASE_URL?.trim() ||
    aiProviderDefaultBaseUrls[provider];
  const apiKey =
    saved.apiKey ||
    process.env.AI_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    process.env.DASHSCOPE_API_KEY?.trim() ||
    process.env.QWEN_API_KEY?.trim() ||
    process.env.DEEPSEEK_API_KEY?.trim() ||
    undefined;
  const model = saved.model || process.env.AI_MODEL?.trim();

  if (!model) return null;
  if (!baseUrl || !isAllowedAiProviderUrl(baseUrl)) return null;
  if (requiresApiKey(provider) && !apiKey) return null;

  return {
    provider,
    baseUrl: trimTrailingSlash(baseUrl),
    apiKey,
    model,
    temperature: saved.temperature ?? normalizeNumber(process.env.AI_TEMPERATURE, 0.25) ?? 0.25,
    timeoutMs: normalizeTimeoutMs(
      saved.timeoutMs ?? normalizeNumber(process.env.AI_TIMEOUT_MS),
      45000
    ),
    maxTokens: normalizeMaxTokens(
      saved.maxTokens ?? normalizeNumber(process.env.AI_MAX_TOKENS)
    )
  };
}

export function getAiSettingsView() {
  const saved = readPersistedAiSettings();
  const effective = readAiProviderConfigFromSettings();
  return {
    saved: saved
      ? {
          provider: saved.provider || "",
          baseUrl: saved.baseUrl || "",
          hasApiKey: Boolean(saved.apiKey),
          apiKeyMasked: maskApiKey(saved.apiKey),
          model: saved.model || "",
          temperature: saved.temperature ?? 0.25,
          timeoutMs: normalizeTimeoutMs(saved.timeoutMs, 45000),
          maxTokens: normalizeMaxTokens(saved.maxTokens) ?? ""
        }
      : null,
    effective: effective
      ? {
          provider: effective.provider,
          baseUrl: effective.baseUrl,
          hasApiKey: Boolean(effective.apiKey),
          apiKeyMasked: maskApiKey(effective.apiKey),
          model: effective.model,
          temperature: effective.temperature,
          timeoutMs: effective.timeoutMs,
          maxTokens: effective.maxTokens ?? ""
        }
      : null,
    source: saved ? "local-settings" : "env",
    env: {
      hasAiProvider: Boolean(process.env.AI_PROVIDER?.trim()),
      hasAiBaseUrl: Boolean(process.env.AI_BASE_URL?.trim()),
      hasAiModel: Boolean(process.env.AI_MODEL?.trim()),
      hasApiKey: Boolean(
        process.env.AI_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim()
      )
    }
  };
}
