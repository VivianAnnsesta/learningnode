import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AiConfigurationError,
  normalizeTimeoutMs
} from "./provider";
import {
  createOpenAiCompatibleProvider,
  listOpenAiCompatibleModels
} from "./openaiCompatibleProvider";

const createRawResponse = (raw: unknown) => new Response(JSON.stringify(raw), { status: 200 });
const createResponse = (content: string) => createRawResponse({ choices: [{ message: { content } }] });

describe("createOpenAiCompatibleProvider", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("adds OpenAI web search tooling for web research tasks", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(createResponse('{"ok":true}'));
    const provider = createOpenAiCompatibleProvider({
      provider: "openai",
      baseUrl: "https://api.openai.com/v1",
      apiKey: "test-key",
      model: "gpt-4.1-mini",
      temperature: 0.25,
      timeoutMs: 1000
    });

    await provider.generateText({
      taskType: "course_design_research",
      messages: [{ role: "user", content: "research a course" }],
      responseFormat: "json_object",
      requiresWebResearch: true
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.tools).toEqual([{ type: "web_search_preview" }]);
    expect(body.tool_choice).toBe("auto");
  });

  it("enables DashScope Qwen web search for web research tasks", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(createResponse('{"ok":true}'));
    const provider = createOpenAiCompatibleProvider({
      provider: "qwen",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey: "test-key",
      model: "qwen3.7MAX",
      temperature: 0.25,
      timeoutMs: 1000
    });

    await provider.generateText({
      taskType: "course_design_research",
      messages: [{ role: "user", content: "research a course" }],
      responseFormat: "json_object",
      requiresWebResearch: true
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.enable_search).toBe(true);
    expect(body.search_options).toEqual({ forced_search: true });
  });

  it("uses DeepSeek Responses web search and returns provider source evidence", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      createRawResponse({
        id: "resp-deepseek-1",
        output: [
          {
            type: "web_search_call",
            action: {
              sources: [
                {
                  type: "url",
                  url: "https://example.edu/exam-syllabus",
                  title: "考试大纲"
                }
              ]
            }
          },
          {
            type: "message",
            content: [
              {
                type: "output_text",
                text: '{"ok":true}',
                annotations: [
                  {
                    type: "url_citation",
                    url: "https://example.edu/exam-syllabus",
                    title: "考试大纲"
                  }
                ]
              }
            ]
          }
        ]
      })
    );
    const provider = createOpenAiCompatibleProvider({
      provider: "deepseek",
      baseUrl: "https://api.deepseek.com",
      apiKey: "test-key",
      model: "deepseek-v4-flash",
      temperature: 0.25,
      timeoutMs: 1000
    });

    const result = await provider.generateText({
      taskType: "course_design_research",
      messages: [{ role: "user", content: "research an exam course" }],
      responseFormat: "json_object",
      requiresWebResearch: true
    });

    expect(fetchMock.mock.calls[0][0]).toBe("https://api.deepseek.com/responses");
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.tools).toEqual([{ type: "web_search" }]);
    expect(body.tool_choice).toBe("required");
    expect(body.text).toEqual({ format: { type: "json_object" } });
    expect(result).toMatchObject({
      text: '{"ok":true}',
      providerRequestId: "resp-deepseek-1",
      sources: [
        {
          url: "https://example.edu/exam-syllabus",
          title: "考试大纲"
        }
      ]
    });
  });

  it("lets Qwen research extra body override default search options", async () => {
    vi.stubEnv(
      "AI_RESEARCH_EXTRA_BODY_JSON",
      '{"search_options":{"forced_search":false},"enable_search":false}'
    );
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(createResponse('{"ok":true}'));
    const provider = createOpenAiCompatibleProvider({
      provider: "qwen",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey: "test-key",
      model: "qwen3.7MAX",
      temperature: 0.25,
      timeoutMs: 1000
    });

    await provider.generateText({
      taskType: "course_design_research",
      messages: [{ role: "user", content: "research a course" }],
      responseFormat: "json_object",
      requiresWebResearch: true
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.enable_search).toBe(false);
    expect(body.search_options).toEqual({ forced_search: false });
  });

  it("can disable Qwen web search through environment", async () => {
    vi.stubEnv("AI_DISABLE_QWEN_WEB_SEARCH", "true");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(createResponse('{"ok":true}'));
    const provider = createOpenAiCompatibleProvider({
      provider: "qwen",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey: "test-key",
      model: "qwen3.7MAX",
      temperature: 0.25,
      timeoutMs: 1000
    });

    await provider.generateText({
      taskType: "course_design_research",
      messages: [{ role: "user", content: "research a course" }],
      responseFormat: "json_object",
      requiresWebResearch: true
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.enable_search).toBeUndefined();
    expect(body.search_options).toBeUndefined();
  });

  it("allows compatible providers to inject their own research request body", async () => {
    vi.stubEnv(
      "AI_RESEARCH_EXTRA_BODY_JSON",
      '{"web_search_options":{"search_context_size":"high"}}'
    );
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(createResponse('{"ok":true}'));
    const provider = createOpenAiCompatibleProvider({
      provider: "openai-compatible",
      baseUrl: "https://example.com/v1",
      apiKey: "test-key",
      model: "search-model",
      temperature: 0.25,
      timeoutMs: 1000
    });

    await provider.generateText({
      taskType: "course_design_research",
      messages: [{ role: "user", content: "research a course" }],
      responseFormat: "json_object",
      requiresWebResearch: true
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.tools).toBeUndefined();
    expect(body.web_search_options).toEqual({ search_context_size: "high" });
  });

  it("rejects invalid custom research request body JSON", async () => {
    vi.stubEnv("AI_RESEARCH_EXTRA_BODY_JSON", "{bad json");
    const provider = createOpenAiCompatibleProvider({
      provider: "openai-compatible",
      baseUrl: "https://example.com/v1",
      apiKey: "test-key",
      model: "search-model",
      temperature: 0.25,
      timeoutMs: 1000
    });

    await expect(
      provider.generateText({
        taskType: "course_design_research",
        messages: [{ role: "user", content: "research a course" }],
        requiresWebResearch: true
      })
    ).rejects.toThrow(AiConfigurationError);
  });

  it("lists models through the OpenAI-compatible models endpoint", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { id: "qwen-plus", owned_by: "qwen" },
          { id: "qwen-max", owned_by: "qwen" }
        ]
      })
    } as Response);

    const models = await listOpenAiCompatibleModels({
      provider: "qwen",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey: "sk-test",
      model: "qwen-plus",
      temperature: 0.25,
      timeoutMs: 1000
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://dashscope.aliyuncs.com/compatible-mode/v1/models",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer sk-test"
        })
      })
    );
    expect(models).toEqual([
      { id: "qwen-plus", ownedBy: "qwen" },
      { id: "qwen-max", ownedBy: "qwen" }
    ]);
  });

  it("clamps max_tokens to the supported provider range before sending", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(createResponse("ok"));
    const provider = createOpenAiCompatibleProvider({
      provider: "deepseek",
      baseUrl: "https://api.deepseek.com",
      apiKey: "test-key",
      model: "deepseek-v4-pro",
      temperature: 0.25,
      timeoutMs: 1000,
      maxTokens: 200000
    });

    await provider.generateText({
      taskType: "provider_test",
      messages: [{ role: "user", content: "ping" }]
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.max_tokens).toBe(131072);
  });

  it("lets task-level max_tokens override a large saved provider setting", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(createResponse("ok"));
    const provider = createOpenAiCompatibleProvider({
      provider: "qwen",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey: "test-key",
      model: "glm-5.2",
      temperature: 0.25,
      timeoutMs: 45000,
      maxTokens: 130000
    });

    await provider.generateText({
      taskType: "task_brief_generation",
      messages: [{ role: "user", content: "ping" }],
      maxTokens: 1800
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.max_tokens).toBe(1800);
  });

  it("disables thinking by default for DashScope GLM structured tasks", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(createResponse('{"ok":true}'));
    const provider = createOpenAiCompatibleProvider({
      provider: "qwen",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey: "test-key",
      model: "glm-5.2",
      temperature: 0.25,
      timeoutMs: 45000
    });

    await provider.generateText({
      taskType: "roadmap_generation",
      messages: [{ role: "user", content: "make a roadmap" }],
      responseFormat: "json_object"
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.enable_thinking).toBe(false);
  });

  it("uses DeepSeek's thinking parameter for structured V4 tasks", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(createResponse('{"ok":true}'));
    const provider = createOpenAiCompatibleProvider({
      provider: "deepseek",
      baseUrl: "https://api.deepseek.com",
      apiKey: "test-key",
      model: "deepseek-v4-flash",
      temperature: 0.25,
      timeoutMs: 45000
    });

    await provider.generateText({
      taskType: "roadmap_skeleton_generation",
      messages: [{ role: "user", content: "make a roadmap" }],
      responseFormat: "json_object"
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.thinking).toEqual({ type: "disabled" });
    expect(body.enable_thinking).toBeUndefined();
  });

  it("maps explicit thinking configuration to DeepSeek's parameter", async () => {
    vi.stubEnv("AI_ENABLE_THINKING", "true");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(createResponse('{"ok":true}'));
    const provider = createOpenAiCompatibleProvider({
      provider: "deepseek",
      baseUrl: "https://api.deepseek.com",
      apiKey: "test-key",
      model: "deepseek-v4-flash",
      temperature: 0.25,
      timeoutMs: 45000
    });

    await provider.generateText({
      taskType: "roadmap_skeleton_generation",
      messages: [{ role: "user", content: "make a roadmap" }],
      responseFormat: "json_object"
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.thinking).toEqual({ type: "enabled" });
    expect(body.enable_thinking).toBeUndefined();
  });

  it("does not automatically disable thinking for research tasks", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(createResponse('{"ok":true}'));
    const provider = createOpenAiCompatibleProvider({
      provider: "qwen",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey: "test-key",
      model: "glm-5.2",
      temperature: 0.25,
      timeoutMs: 45000
    });

    await provider.generateText({
      taskType: "course_design_research",
      messages: [{ role: "user", content: "research a course" }],
      responseFormat: "json_object",
      requiresWebResearch: true
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body.enable_thinking).toBeUndefined();
  });

  it("reports when reasoning exhausts max_tokens before final content", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      createRawResponse({
        choices: [
          {
            finish_reason: "length",
            message: {
              role: "assistant",
              content: "",
              reasoning_content: "thinking..."
            }
          }
        ]
      })
    );
    const provider = createOpenAiCompatibleProvider({
      provider: "qwen",
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
      apiKey: "test-key",
      model: "glm-5.2",
      temperature: 0.25,
      timeoutMs: 45000,
      maxTokens: 64
    });

    await expect(
      provider.generateText({
        taskType: "roadmap_generation",
        messages: [{ role: "user", content: "make json" }]
      })
    ).rejects.toThrow(
      "AI response exhausted max_tokens during reasoning before final answer."
    );
  });

  it("clamps timeout settings to a bounded range", () => {
    expect(normalizeTimeoutMs(4500000)).toBe(300000);
    expect(normalizeTimeoutMs(100)).toBe(1000);
    expect(normalizeTimeoutMs(undefined, 45000)).toBe(45000);
  });

  it("keeps HTTP error bodies and request ids for failure analysis", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("upstream temporarily unavailable", { status: 503, headers: { "x-request-id": "failed-request-1" } }));
    const provider = createOpenAiCompatibleProvider({ provider: "qwen", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", apiKey: "test-key", model: "qwen3", temperature: 0.25, timeoutMs: 1000 });
    await expect(provider.generateText({ taskType: "roadmap_skeleton_generation", messages: [{ role: "user", content: "plan" }] })).rejects.toMatchObject({ status: 503, response: { text: "", providerRequestId: "failed-request-1", raw: { responseText: "upstream temporarily unavailable" } } });
  });

  it("keeps reasoning and finish reason when there is no usable assistant output", async () => {
    const raw = { id: "no-answer-1", choices: [{ finish_reason: "length", message: { content: "", reasoning_content: "unfinished analysis" } }], usage: { completion_tokens: 64 } };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(createRawResponse(raw));
    const provider = createOpenAiCompatibleProvider({ provider: "qwen", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", apiKey: "test-key", model: "qwen3", temperature: 0.25, timeoutMs: 1000 });
    await expect(provider.generateText({ taskType: "roadmap_skeleton_generation", messages: [{ role: "user", content: "plan" }] })).rejects.toMatchObject({ response: { text: "", providerRequestId: "no-answer-1", raw } });
  });
});
