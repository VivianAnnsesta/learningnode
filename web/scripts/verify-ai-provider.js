const fs = require("fs");
const path = require("path");
const {
  loadAiVerificationSettings
} = require("./ai-provider-verification-settings");

const root = path.resolve(__dirname, "..");

const usage = `Usage:
  node scripts/verify-ai-provider.js [options]

Options:
  --provider <openai|qwen|deepseek|lmstudio|openai-compatible>
  --base-url <url>
  --model <model>
  --api-key <key>
  --timeout-ms <number>
  --research
  --ignore-settings
  --help

Examples:
  npm run verify:ai-provider
  npm run verify:ai-provider:lmstudio -- --model your-loaded-model-id
  npm run verify:ai-provider:openai -- --model gpt-4o-mini --api-key sk-...
  npm run verify:ai-provider:qwen -- --model qwen-plus --api-key sk-...
  npm run verify:ai-provider:deepseek -- --model deepseek-v4-pro --api-key sk-...
`;

const parseArgs = (argv) => {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    if (key === "help") {
      args.help = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      args[key] = "";
      continue;
    }
    args[key] = value;
    index += 1;
  }
  return args;
};

const loadDotEnv = () => {
  const envPath = path.join(root, ".env");
  if (!fs.existsSync(envPath)) return {};
  const result = {};
  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    result[key] = rawValue.replace(/^["']|["']$/g, "");
  }
  return result;
};

const trimTrailingSlash = (value) => value.replace(/\/+$/, "");

const firstText = (...values) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
};

const firstNumber = (...values) => {
  for (const value of values) {
    if (value === undefined || value === null || value === "") continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
};

const normalizeProvider = (value, baseUrl) => {
  const provider = value?.trim().toLowerCase();
  if (
    provider === "openai" ||
    provider === "qwen" ||
    provider === "deepseek" ||
    provider === "lmstudio" ||
    provider === "openai-compatible"
  ) {
    return provider;
  }
  return baseUrl ? "openai-compatible" : undefined;
};

const defaultBaseUrlForProvider = (provider) => {
  if (provider === "lmstudio") return "http://localhost:1234/v1";
  if (provider === "qwen") return "https://dashscope.aliyuncs.com/compatible-mode/v1";
  if (provider === "deepseek") return "https://api.deepseek.com";
  if (provider === "openai") return "https://api.openai.com/v1";
  return "";
};

const providerRequiresApiKey = (provider) =>
  provider === "openai" || provider === "qwen" || provider === "deepseek";

const truthyEnv = (value) => {
  const normalized = value?.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
};

const parseJsonObjectEnv = (env, name) => {
  const raw = env[name]?.trim();
  if (!raw) return {};
  const parsed = JSON.parse(raw);
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed
    : {};
};

const buildResearchBody = (config, env) => {
  const extraBody = parseJsonObjectEnv(env, "AI_RESEARCH_EXTRA_BODY_JSON");
  if (config.provider === "qwen" && !truthyEnv(env.AI_DISABLE_QWEN_WEB_SEARCH)) {
    return {
      enable_search: true,
      search_options: {
        forced_search: true
      },
      ...extraBody
    };
  }

  if (
    config.provider === "openai" &&
    !truthyEnv(env.AI_DISABLE_OPENAI_WEB_SEARCH)
  ) {
    return {
      tools: [{ type: "web_search_preview" }],
      tool_choice: "auto",
      ...extraBody
    };
  }

  return extraBody;
};

const maskSecret = (value) => {
  if (!value) return "";
  if (value.length <= 8) return "********";
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
};

const buildConfig = (args) => {
  const dotEnv = loadDotEnv();
  const env = { ...dotEnv, ...process.env };
  const loadedSettings =
    args["ignore-settings"] !== undefined
      ? { settings: {}, settingsPath: undefined }
      : loadAiVerificationSettings({ env, root });
  const settings = loadedSettings.settings;

  const baseUrl = firstText(
    args["base-url"],
    settings.baseUrl,
    env.AI_BASE_URL
  );
  const provider = normalizeProvider(
    firstText(args.provider, settings.provider, env.AI_PROVIDER),
    baseUrl
  );
  const effectiveBaseUrl =
    baseUrl ||
    defaultBaseUrlForProvider(provider);
  const apiKey = firstText(
    args["api-key"],
    settings.apiKey,
    env.AI_API_KEY,
    env.OPENAI_API_KEY,
    env.DASHSCOPE_API_KEY,
    env.QWEN_API_KEY,
    env.DEEPSEEK_API_KEY
  );
  const model = firstText(args.model, settings.model, env.AI_MODEL);
  const timeoutMs = firstNumber(args["timeout-ms"], settings.timeoutMs, env.AI_TIMEOUT_MS, 15000);

  if (!provider) {
    throw new Error(
      "AI provider is not configured. Set AI_PROVIDER or pass --provider."
    );
  }
  if (!model) {
    throw new Error("AI model is not configured. Set AI_MODEL or pass --model.");
  }
  if (!effectiveBaseUrl) {
    throw new Error("AI base URL is not configured. Set AI_BASE_URL or pass --base-url.");
  }
  if (providerRequiresApiKey(provider) && !apiKey) {
    throw new Error(`${provider} provider requires AI_API_KEY, a provider-specific API key, or --api-key.`);
  }

  return {
    provider,
    baseUrl: trimTrailingSlash(effectiveBaseUrl),
    apiKey,
    model,
    timeoutMs,
    env,
    settingsPath: loadedSettings.settingsPath
  };
};

const requestText = async (config, options = {}) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
  const startedAt = Date.now();
  const researchBody = options.research ? buildResearchBody(config, config.env) : {};

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {})
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: "system",
            content: options.research
              ? "Use web search if the request enables it. Reply with one short Chinese sentence and include one URL or source title when available."
              : "Reply with one short sentence."
          },
          {
            role: "user",
            content: options.research
              ? "Search for the current official TypeScript Handbook page and say the AI web research verification passed in Chinese."
              : "Say AI provider verification passed in Chinese."
          }
        ],
        temperature: 0,
        stream: false,
        ...researchBody
      }),
      signal: controller.signal
    });

    const raw = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = raw?.error?.message || `HTTP ${response.status}`;
      throw new Error(message);
    }

    const content = raw?.choices?.[0]?.message?.content;
    const text = typeof content === "string" ? content.trim() : "";
    if (!text) {
      throw new Error("Provider returned no assistant text.");
    }

    return {
      latencyMs: Date.now() - startedAt,
      text
    };
  } catch (error) {
    if (error && error.name === "AbortError") {
      throw new Error(`Provider request timed out after ${config.timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
};

(async () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage);
    return;
  }

  const config = buildConfig(args);
  console.log("AI provider verification");
  console.log(`- provider: ${config.provider}`);
  console.log(`- baseUrl: ${config.baseUrl}`);
  console.log(`- model: ${config.model}`);
  console.log(`- apiKey: ${config.apiKey ? maskSecret(config.apiKey) : "(none)"}`);
  console.log(`- timeoutMs: ${config.timeoutMs}`);
  console.log(`- research: ${args.research !== undefined ? "enabled" : "disabled"}`);
  console.log(
    `- settings: ${
      args["ignore-settings"] !== undefined
        ? "ignored"
        : `enabled (${config.settingsPath})`
    }`
  );

  const result = await requestText(config, {
    research: args.research !== undefined
  });
  console.log(`Verification passed in ${result.latencyMs}ms.`);
  console.log(`Response preview: ${result.text.slice(0, 160)}`);
})().catch((error) => {
  console.error("AI provider verification failed.");
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
