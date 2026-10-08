"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActionButton,
  AppShell,
  PageHeader,
  SectionPanel
} from "../../components/ui";

type AiSettingsView = {
  saved: null | {
    provider: string;
    baseUrl: string;
    hasApiKey: boolean;
    apiKeyMasked: string;
    model: string;
    temperature: number;
    timeoutMs: number;
    maxTokens: number | string;
  };
  effective: null | {
    provider: string;
    baseUrl: string;
    hasApiKey: boolean;
    apiKeyMasked: string;
    model: string;
    temperature: number;
    timeoutMs: number;
    maxTokens: number | string;
  };
  source: "local-settings" | "env";
  env: {
    hasAiProvider: boolean;
    hasAiBaseUrl: boolean;
    hasAiModel: boolean;
    hasApiKey: boolean;
  };
};

type AiSettingsDraft = {
  provider: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: string;
  timeoutMs: string;
  maxTokens: string;
};

type AiProviderTestResult = {
  ok: boolean;
  provider: string;
  baseUrl: string;
  model: string;
  latencyMs: number;
  responsePreview: string | null;
  aiCallLogId: string | null;
  error: string | null;
};

type AiModelOption = {
  id: string;
  ownedBy: string | null;
};

type AiModelDiscoveryResult = {
  provider: string;
  baseUrl: string;
  models: AiModelOption[];
  source: "api" | "preset";
  selectedModel: string;
  warning: string | null;
};

const emptyDraft: AiSettingsDraft = {
  provider: "lmstudio",
  baseUrl: "http://localhost:1234/v1",
  apiKey: "",
  model: "",
  temperature: "0.25",
  timeoutMs: "45000",
  maxTokens: "1800"
};

const draftFromView = (view: AiSettingsView | null): AiSettingsDraft => {
  const source = view?.saved || view?.effective;
  if (!source) return emptyDraft;
  return {
    provider: source.provider || "lmstudio",
    baseUrl: source.baseUrl || "http://localhost:1234/v1",
    apiKey: "",
    model: source.model || "",
    temperature: String(source.temperature ?? 0.25),
    timeoutMs: String(source.timeoutMs ?? 45000),
    maxTokens: String(source.maxTokens || "1800")
  };
};

const providerLabelMap: Record<string, string> = {
  lmstudio: "LM Studio",
  openai: "OpenAI",
  qwen: "Qwen / 阿里云百炼",
  deepseek: "DeepSeek",
  "openai-compatible": "兼容 OpenAI 的服务"
};

const providerDefaultBaseUrlMap: Record<string, string> = {
  lmstudio: "http://localhost:1234/v1",
  openai: "https://api.openai.com/v1",
  qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1",
  deepseek: "https://api.deepseek.com",
  "openai-compatible": ""
};

const providerDefaultModelMap: Record<string, string[]> = {
  lmstudio: [],
  openai: ["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini"],
  qwen: ["qwen-plus", "qwen-max", "qwen-turbo", "qwen-coder-plus"],
  deepseek: ["deepseek-v4-flash", "deepseek-v4-pro", "deepseek-chat"],
  "openai-compatible": []
};

const providerHelpMap: Record<string, string> = {
  openai: "使用 OpenAI 官方云端 API，需要 OPENAI_API_KEY 或在此保存 API Key。",
  qwen:
    "使用阿里云百炼 OpenAI 兼容接口。课程设计研究会默认传 enable_search 联网搜索；可用 AI_DISABLE_QWEN_WEB_SEARCH 或 AI_RESEARCH_EXTRA_BODY_JSON 调整。",
  deepseek:
    "使用 DeepSeek API，默认模型为 V4 Flash；课程研究通过 Responses API 联网检索。你仍可手动切换 V4 Pro，系统不会自动升级模型。",
  lmstudio: "使用本地 LM Studio OpenAI-compatible server，通常不需要 API Key。",
  "openai-compatible": "用于 SiliconFlow、火山方舟等其他兼容 OpenAI Chat Completions 的服务。"
};

export default function AiSettingsPage() {
  const [view, setView] = useState<AiSettingsView | null>(null);
  const [draft, setDraft] = useState<AiSettingsDraft>(emptyDraft);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<AiProviderTestResult | null>(null);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelOptions, setModelOptions] = useState<AiModelOption[]>([]);
  const [modelSource, setModelSource] = useState<"api" | "preset">("preset");
  const [modelWarning, setModelWarning] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const draftRef = useRef(draft);
  const draftTouchedRef = useRef(false);
  const modelRequestIdRef = useRef(0);
  const modelAbortRef = useRef<AbortController | null>(null);

  const invalidateModelRequest = () => {
    modelRequestIdRef.current += 1;
    modelAbortRef.current?.abort();
    modelAbortRef.current = null;
    setLoadingModels(false);
  };

  const loadModelOptions = useCallback(
    async (nextDraft: AiSettingsDraft, autoSelect = true) => {
      const requestId = modelRequestIdRef.current + 1;
      modelRequestIdRef.current = requestId;
      modelAbortRef.current?.abort();

      const controller = new AbortController();
      modelAbortRef.current = controller;
      const isCurrentRequest = () => modelRequestIdRef.current === requestId;
      const fallbackModels = providerDefaultModelMap[nextDraft.provider] || [];
      if (!nextDraft.baseUrl.trim()) {
        if (!isCurrentRequest()) return;
        setModelOptions(fallbackModels.map((id) => ({ id, ownedBy: nextDraft.provider })));
        setModelSource("preset");
        setModelWarning("请先填写接口地址，再读取模型列表。");
        setLoadingModels(false);
        return;
      }

      setLoadingModels(true);
      setModelWarning("");
      let response: Response;
      try {
        response = await fetch("/api/ai/models", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            provider: nextDraft.provider,
            baseUrl: nextDraft.baseUrl,
            apiKey: nextDraft.apiKey || undefined,
            model: nextDraft.model,
            timeoutMs: nextDraft.timeoutMs
          }),
          signal: controller.signal
        });
      } catch (error) {
        if (!isCurrentRequest()) return;
        setLoadingModels(false);
        setModelOptions(fallbackModels.map((id) => ({ id, ownedBy: nextDraft.provider })));
        setModelSource("preset");
        setModelWarning(
          error instanceof Error
            ? `读取模型列表失败，已使用内置推荐：${error.message}`
            : "读取模型列表失败，已使用内置推荐。"
        );
        return;
      }
      if (!isCurrentRequest()) return;
      setLoadingModels(false);

      const data = (await response.json().catch(() => ({}))) as
        | AiModelDiscoveryResult
        | { error?: string };
      if (!isCurrentRequest()) return;
      if (!response.ok || !("models" in data)) {
        const errorData = data as { error?: string };
        setModelOptions(fallbackModels.map((id) => ({ id, ownedBy: nextDraft.provider })));
        setModelSource("preset");
        setModelWarning(errorData.error || "读取模型列表失败，已保留当前模型设置。");
        return;
      }

      setModelOptions(data.models);
      setModelSource(data.source);
      setModelWarning(data.warning || "");

      if (!autoSelect || !data.selectedModel) return;
      setDraft((prev) => {
        if (
          prev.provider !== nextDraft.provider ||
          prev.baseUrl !== nextDraft.baseUrl ||
          prev.apiKey !== nextDraft.apiKey
        ) {
          return prev;
        }

        const providerDefaults = providerDefaultModelMap[prev.provider] || [];
        const shouldFill =
          !prev.model.trim() ||
          (providerDefaults.includes(prev.model) && prev.model !== data.selectedModel);

        return shouldFill ? { ...prev, model: data.selectedModel } : prev;
      });
    },
    []
  );

  const loadSettings = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/ai/settings");
      if (!response.ok) {
        setError("读取 AI 设置失败。");
        return;
      }
      const data = (await response.json()) as AiSettingsView;
      setView(data);
      if (!draftTouchedRef.current) {
        setDraft(draftFromView(data));
      }
    } catch {
      setError("读取 AI 设置失败：无法连接到应用服务。");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadSettings();
  }, []);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    if (loading) return;
    const timer = window.setTimeout(() => {
      void loadModelOptions(draftRef.current);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [draft.provider, draft.baseUrl, draft.apiKey, loading, loadModelOptions]);

  const updateDraft = (key: keyof AiSettingsDraft, value: string) => {
    draftTouchedRef.current = true;
    setDraft((prev) => {
      const next = { ...prev, [key]: value };
      if (key === "provider") {
        const currentDefault = providerDefaultBaseUrlMap[prev.provider];
        const nextDefault = providerDefaultBaseUrlMap[value];
        if (!prev.baseUrl.trim() || prev.baseUrl === currentDefault) {
          next.baseUrl = nextDefault;
        }
        const currentModelDefaults = providerDefaultModelMap[prev.provider] || [];
        const nextDefaultModel = providerDefaultModelMap[value]?.[0] || "";
        if (!prev.model.trim() || currentModelDefaults.includes(prev.model)) {
          next.model = nextDefaultModel;
        }
      }
      return next;
    });
  };

  const saveSettings = async () => {
    invalidateModelRequest();
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/ai/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: draft.provider,
          baseUrl: draft.baseUrl,
          apiKey: draft.apiKey || undefined,
          model: draft.model,
          temperature: draft.temperature,
          timeoutMs: draft.timeoutMs,
          maxTokens: draft.maxTokens
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "保存 AI 设置失败。");
        return;
      }
      setView(data);
      draftTouchedRef.current = false;
      setDraft(draftFromView(data));
      setMessage("AI 设置已保存。本地设置会优先生效。");
    } catch {
      setError("保存 AI 设置失败：无法连接到应用服务。");
    } finally {
      setSaving(false);
    }
  };

  const resetSettings = async () => {
    invalidateModelRequest();
    setSaving(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/ai/settings", { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "重置 AI 设置失败。");
        return;
      }
      setView(data);
      draftTouchedRef.current = false;
      setDraft(draftFromView(data));
      setMessage("已清空本地 AI 设置，当前回退到 .env。");
    } catch {
      setError("重置 AI 设置失败：无法连接到应用服务。");
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true);
    setMessage("");
    setError("");
    setTestResult(null);
    try {
      const response = await fetch("/api/ai/test", { method: "POST" });
      const data = (await response.json().catch(() => ({}))) as AiProviderTestResult;
      setTestResult(data);
      if (!data.ok) {
        setMessage("AI 连接测试失败，但不会影响手动学习流程。");
        return;
      }
      setMessage("AI 连接测试成功。");
    } catch {
      setMessage("AI 连接测试失败，但不会影响手动学习流程。");
      setTestResult({
        ok: false,
        provider: view?.effective?.provider || draft.provider,
        baseUrl: view?.effective?.baseUrl || draft.baseUrl,
        model: view?.effective?.model || draft.model,
        latencyMs: 0,
        responsePreview: null,
        aiCallLogId: null,
        error: "无法连接到应用服务。"
      });
    } finally {
      setTesting(false);
    }
  };

  const effective = view?.effective;

  return (
    <AppShell className="max-w-4xl gap-6">
      <PageHeader
        kicker="AI 配置"
        title="AI 设置"
        description="配置云端 API、兼容 OpenAI 的服务或本地 LM Studio。保存后的本地设置优先于 .env。"
        actions={
          <Link href="/" className="workshop-button-secondary px-3 py-2 text-sm">
            返回首页
          </Link>
        }
      />

      {loading ? (
        <div className="rounded border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
          正在读取 AI 设置...
        </div>
      ) : null}
      {error ? (
        <div className="rounded border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          {message}
        </div>
      ) : null}

      <SectionPanel>
        <h2 className="text-base font-semibold text-slate-900">当前生效配置</h2>
        {effective ? (
          <div className="mt-3 grid gap-3 text-sm md:grid-cols-2">
            <div>来源：{view?.source === "local-settings" ? "本地设置" : ".env"}</div>
            <div>服务提供方：{providerLabelMap[effective.provider] || effective.provider}</div>
            <div>接口地址：{effective.baseUrl}</div>
            <div>模型：{effective.model}</div>
            <div>API 密钥：{effective.hasApiKey ? effective.apiKeyMasked : "未设置"}</div>
            <div>温度：{effective.temperature}</div>
          </div>
        ) : (
          <div className="mt-3 text-sm text-amber-700">
            当前 AI 尚未配置完整。至少需要服务提供方、接口地址和模型；OpenAI
            云端服务还需要 API 密钥。
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          <ActionButton
            type="button"
            variant="secondary"
            onClick={testConnection}
            disabled={testing || saving || !effective}
          >
            {testing ? "测试中..." : "测试 AI 连接"}
          </ActionButton>
        </div>
        {testResult ? (
          <div
            className={`mt-4 rounded border px-4 py-3 text-sm ${
              testResult.ok
                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                : "border-amber-200 bg-amber-50 text-amber-900"
            }`}
          >
            <div className="font-medium">
              {testResult.ok ? "测试成功" : "测试失败"}
            </div>
            <div className="mt-2 grid gap-2 md:grid-cols-2">
              <div>服务：{providerLabelMap[testResult.provider] || testResult.provider}</div>
              <div>模型：{testResult.model || "未配置"}</div>
              <div>耗时：{testResult.latencyMs} ms</div>
              <div>日志：{testResult.aiCallLogId || "未写入"}</div>
            </div>
            {testResult.responsePreview ? (
              <div className="mt-2">返回：{testResult.responsePreview}</div>
            ) : null}
            {testResult.error ? (
              <div className="mt-2">错误：{testResult.error}</div>
            ) : null}
          </div>
        ) : null}
      </SectionPanel>

      <SectionPanel strong>
        <h2 className="text-base font-semibold text-slate-900">编辑本地设置</h2>
        <fieldset className="grid gap-3 border-0 p-0 md:grid-cols-2" disabled={saving}>
          <label className="space-y-1 text-xs font-medium text-slate-500">
            服务提供方
            <select
              value={draft.provider}
              onChange={(event) => updateDraft("provider", event.target.value)}
              className="w-full rounded border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900"
            >
              <option value="lmstudio">LM Studio</option>
              <option value="openai">OpenAI</option>
              <option value="qwen">Qwen / 阿里云百炼</option>
              <option value="deepseek">DeepSeek</option>
              <option value="openai-compatible">兼容 OpenAI 的服务</option>
            </select>
            <span className="block text-xs font-normal leading-5 text-slate-500">
              {providerHelpMap[draft.provider]}
            </span>
          </label>
          <label className="space-y-1 text-xs font-medium text-slate-500">
            <div className="flex items-center justify-between gap-2">
              <span>模型</span>
              <button
                type="button"
                onClick={() => void loadModelOptions(draft)}
                disabled={loadingModels || !draft.baseUrl.trim()}
                className="rounded border border-slate-200 px-2 py-1 text-xs font-normal text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loadingModels ? "读取中..." : "读取可用模型"}
              </button>
            </div>
            <input
              value={draft.model}
              onChange={(event) => updateDraft("model", event.target.value)}
              list="ai-model-options"
              placeholder="例如 gpt-4.1-mini 或 LM Studio 当前模型 ID"
              className="w-full rounded border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900"
            />
            <datalist id="ai-model-options">
              {modelOptions.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.ownedBy || model.id}
                </option>
              ))}
            </datalist>
            <span className="block text-xs font-normal leading-5 text-slate-500">
              {modelSource === "api"
                ? "已从接口读取该账号可用模型。"
                : "当前显示内置推荐模型；填写 API Key 后可自动读取账号可用模型。"}
              {modelWarning ? ` ${modelWarning}` : ""}
            </span>
          </label>
          <label className="space-y-1 text-xs font-medium text-slate-500 md:col-span-2">
            接口地址
            <input
              value={draft.baseUrl}
              onChange={(event) => updateDraft("baseUrl", event.target.value)}
              placeholder={providerDefaultBaseUrlMap[draft.provider] || "https://api.example.com/v1"}
              className="w-full rounded border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900"
            />
          </label>
          <label className="space-y-1 text-xs font-medium text-slate-500 md:col-span-2">
            API 密钥
            <input
              value={draft.apiKey}
              onChange={(event) => updateDraft("apiKey", event.target.value)}
              placeholder={
                view?.saved?.hasApiKey
                  ? "留空则保留已保存的密钥"
                  : draft.provider === "lmstudio"
                    ? "LM Studio 通常可留空"
                    : "云端厂商需要填写 API Key"
              }
              type="password"
              className="w-full rounded border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900"
            />
          </label>
          <label className="space-y-1 text-xs font-medium text-slate-500">
            温度
            <input
              value={draft.temperature}
              onChange={(event) => updateDraft("temperature", event.target.value)}
              className="w-full rounded border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900"
            />
          </label>
          <label className="space-y-1 text-xs font-medium text-slate-500">
            超时时间（毫秒）
            <input
              value={draft.timeoutMs}
              onChange={(event) => updateDraft("timeoutMs", event.target.value)}
              type="number"
              min="1000"
              max="300000"
              step="1000"
              className="w-full rounded border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900"
            />
            <span className="block text-xs font-normal leading-5 text-slate-500">
              允许范围 1000-300000 毫秒；长研究任务会使用任务级超时策略。
            </span>
          </label>
          <label className="space-y-1 text-xs font-medium text-slate-500">
            最大令牌数
            <input
              value={draft.maxTokens}
              onChange={(event) => updateDraft("maxTokens", event.target.value)}
              type="number"
              min="1"
              max="131072"
              step="1"
              className="w-full rounded border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900"
            />
            <span className="block text-xs font-normal leading-5 text-slate-500">
              允许范围 1-131072；留空则不主动传 max_tokens。
            </span>
          </label>
        </fieldset>

        <div className="flex flex-wrap justify-end gap-2">
          <ActionButton
            type="button"
            onClick={resetSettings}
            disabled={saving}
            variant="secondary"
          >
            清空本地设置
          </ActionButton>
          <ActionButton
            type="button"
            onClick={saveSettings}
            disabled={saving || !draft.model.trim()}
          >
            {saving ? "保存中..." : "保存 AI 设置"}
          </ActionButton>
        </div>
      </SectionPanel>
    </AppShell>
  );
}
