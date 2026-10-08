export const aiProviderNames = [
  "openai",
  "qwen",
  "deepseek",
  "lmstudio",
  "openai-compatible"
] as const;

export type AiProviderName = (typeof aiProviderNames)[number];

export const aiMaxTokensRange = {
  min: 1,
  max: 131072
} as const;

export const aiTimeoutMsRange = {
  min: 1000,
  max: 300000
} as const;

export const aiProviderDefaultBaseUrls: Record<AiProviderName, string> = {
  openai: "https://api.openai.com/v1",
  qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  deepseek: "https://api.deepseek.com",
  lmstudio: "http://localhost:1234/v1",
  "openai-compatible": ""
};

export const aiProviderDefaultModelIds: Record<AiProviderName, string[]> = {
  openai: ["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini"],
  qwen: ["qwen-plus", "qwen-max", "qwen-turbo", "qwen-coder-plus"],
  deepseek: ["deepseek-v4-flash", "deepseek-v4-pro", "deepseek-chat"],
  lmstudio: [],
  "openai-compatible": []
};

export function isAiProviderName(value: string): value is AiProviderName {
  return aiProviderNames.includes(value as AiProviderName);
}

export function requiresApiKey(provider: AiProviderName) {
  return provider === "openai" || provider === "qwen" || provider === "deepseek";
}

export function normalizeMaxTokens(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return undefined;
  }
  const rounded = Math.floor(value);
  if (rounded < aiMaxTokensRange.min) return aiMaxTokensRange.min;
  if (rounded > aiMaxTokensRange.max) return aiMaxTokensRange.max;
  return rounded;
}

export function normalizeTimeoutMs(value?: number | null, fallback = 45000) {
  const candidate =
    value === null || value === undefined || !Number.isFinite(value)
      ? fallback
      : Math.floor(value);
  if (candidate < aiTimeoutMsRange.min) return aiTimeoutMsRange.min;
  if (candidate > aiTimeoutMsRange.max) return aiTimeoutMsRange.max;
  return candidate;
}

export type AiTaskType =
  | "task_brief_generation"
  | "course_design_research"
  | "course_design_repair"
  | "course_design_critique"
  | "source_relevance_check"
  | "course_design_regeneration"
  | "roadmap_skeleton_generation"
  | "roadmap_skeleton_critique"
  | "roadmap_skeleton_repair"
  | "roadmap_stage_generation"
  | "roadmap_stage_critique"
  | "roadmap_stage_repair"
  | "roadmap_generation"
  | "diagnostic_generation"
  | "answer_evaluation"
  | "learning_feedback"
  | "hint_generation"
  | "practice_generation"
  | "node_segment_preparation"
  | "node_lesson_review"
  | "node_knowledge_check"
  | "node_framework_correction"
  | "node_lesson_repair"
  | "node_lesson_preparation"
  | "node_lesson_feedback"
  | "node_lesson_help"
  | "relation_candidate_generation"
  | "knowledge_graph_organization"
  | "relation_explanation"
  | "transfer_challenge_generation"
  | "reactivation_plan_generation"
  | "long_term_review_generation"
  | "provider_test";

export type AiMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export type AiProviderConfig = {
  provider: AiProviderName;
  baseUrl: string;
  apiKey?: string;
  model: string;
  temperature: number;
  timeoutMs: number;
  maxTokens?: number;
};

export type AiGenerateTextInput = {
  taskType: AiTaskType;
  messages: AiMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: "text" | "json_object";
  timeoutMs?: number;
  requiresWebResearch?: boolean;
};

export type AiGenerateTextResult = {
  text: string;
  raw: unknown;
  providerRequestId?: string;
  sources?: AiResearchSource[];
};

export type AiResearchSource = {
  url: string;
  title?: string;
};

export type AiProvider = {
  config: AiProviderConfig;
  generateText(input: AiGenerateTextInput): Promise<AiGenerateTextResult>;
};

export class AiConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiConfigurationError";
  }
}

export class AiProviderError extends Error {
  status?: number;

  constructor(message: string, status?: number, readonly response?: AiGenerateTextResult) {
    super(message);
    this.name = "AiProviderError";
    this.status = status;
  }
}

export const truncateForLog = (value: string, maxLength = 1200) =>
  value.length <= maxLength ? value : `${value.slice(0, maxLength)}...`;
