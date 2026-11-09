import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { it, expect } from "vitest";
import { createOpenAiCompatibleProvider } from "../../src/lib/ai/openaiCompatibleProvider";
import type { AiMessage } from "../../src/lib/ai/provider";
import { evidenceSerializer } from "../../src/lib/ai/generationEvidence";
import { buildPlanningKnowledgePrompt, validateGeneratedPlanningKnowledgeReview, applyPlanningKnowledgeCorrections } from "../../src/lib/ai/planningKnowledgeReview";

const hash = (v: string | Buffer) => createHash("sha256").update(v).digest("hex");
const sourceDir = "test-results/route-quality-live-2026-10-28-1793183197873";
const record = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
type Body = { model: string; messages: AiMessage[]; temperature: number; max_tokens: number; [key: string]: unknown };
type Transport = { runId: string; requestInRun: number; requestBody: Body };
type Mode = "direct" | "low" | "high";
function lineData(prompt: string, prefix: string) {
  const line = prompt.split("\n").find(value => value.startsWith(prefix));
  if (!line) throw new Error(`Missing exact archived prompt field: ${prefix}`);
  return JSON.parse(line.slice(prefix.length));
}
function comparable(body: Body) {
  const copy = { ...body }; delete copy.thinking; delete copy.reasoning_effort;
  return JSON.stringify(copy);
}

it.skipIf(!["1", "preflight"].includes(process.env.ENGLISHNODE_PLANNING_EFFORT || ""))("replay three actual planning inputs at fixed budget with direct, low and high effort", async () => {
  // Diagnostic sample selected after observing failures, not an unbiased evaluation set.
  // No Prisma, .env, model-generated executable code, or product database is used.
  const transportFile = path.join(sourceDir, "transport-requests.json");
  const transportBytes = fs.readFileSync(transportFile), transportHash = hash(transportBytes);
  const transports = JSON.parse(transportBytes.toString("utf8")) as Transport[];
  const definitions = [
    { id: "skeleton-control", request: 6, file: "finite-screening-thinking-planning.json", key: "skeleton", modes: ["direct", "low", "high"] },
    { id: "stage2-empty-final", request: 13, file: "finite-screening-thinking-stage-2.json", key: "draft", modes: ["low", "high", "direct"] },
    { id: "stage3-truncated-final", request: 16, file: "finite-screening-thinking-stage-3.json", key: "draft", modes: ["high", "direct", "low"] }
  ] as const;
  const samples = definitions.map(item => {
    const original = transports.find(t => t.runId === "finite-screening-thinking" && t.requestInRun === item.request);
    if (!original || original.requestBody.messages.length !== 2 || original.requestBody.messages[0].role !== "system" || original.requestBody.messages[1].role !== "user" || original.requestBody.max_tokens !== 12000) throw new Error("Archived request identity/budget mismatch.");
    const source = fs.readFileSync(path.join(sourceDir, item.file));
    const draft = JSON.parse(source.toString("utf8")).response[item.key];
    const userPrompt = original.requestBody.messages[1].content;
    const scope = lineData(userPrompt, "任务范围（只读）：");
    const materials = lineData(userPrompt, "实际正文片段：");
    const previousCorrections = lineData(userPrompt, "此前局部更正（只读）：");
    const reconstructed = buildPlanningKnowledgePrompt({ draft, materials, ...scope, previousCorrections });
    if (reconstructed !== userPrompt) throw new Error(`${item.id}: checkpoint cannot reconstruct archived prompt byte-for-byte; do not guess its candidate.`);
    return { ...item, draft, materials, body: original.requestBody, sourceHash: hash(source), promptHash: hash(userPrompt), promptByteExact: reconstructed === userPrompt };
  });
  if (process.env.ENGLISHNODE_PLANNING_EFFORT === "preflight") {
    const preflight = { samples: samples.map(s => ({ id: s.id, sourceHash: s.sourceHash, promptHash: s.promptHash, promptByteExact: s.promptByteExact })), allArchivedTextPathsAndContextMatch: true, originalPromptUsedVerbatim: true, providerCalls: 0 };
    fs.writeFileSync("test-results/planning-effort-preflight-2026-10-28.json", JSON.stringify(preflight, null, 2));
    console.log(JSON.stringify(preflight));
    return;
  }
  if (!fs.existsSync(path.join(sourceDir, "run-complete.json")) || !fs.existsSync(path.join(sourceDir, "cleanup.json"))) throw new Error("Wait for the full route experiment to terminate and clean up before extra provider calls.");
  const sourceCompletion = JSON.parse(fs.readFileSync(path.join(sourceDir, "run-complete.json"), "utf8"));
  const sourceCleanup = JSON.parse(fs.readFileSync(path.join(sourceDir, "cleanup.json"), "utf8"));
  if (sourceCompletion.completed !== true || sourceCompletion.frozenSourcesUnchanged !== true || sourceCleanup.temporarySettingsDeleted !== true || sourceCleanup.originalSettingsUnchanged !== true || sourceCleanup.environmentRestored !== true || sourceCleanup.fetchRestored !== true || !Array.isArray(sourceCleanup.cleanupErrors) || sourceCleanup.cleanupErrors.length) throw new Error("The original experiment has not confirmed termination, source integrity and cleanup.");
  if (process.env.AI_EXTRA_BODY_JSON?.trim()) throw new Error("Remove the ambient request override before controlled replay.");
  const modulePaths = ["scripts/research/planning-effort-experiment.test.ts", "src/lib/ai/openaiCompatibleProvider.ts", "src/lib/ai/settingsService.ts", "src/lib/ai/provider.ts", "src/lib/ai/planningKnowledgeReview.ts", "src/lib/ai/generationEvidence.ts"];
  const moduleHashes = Object.fromEntries(modulePaths.map(file => [file, hash(fs.readFileSync(file))]));
  const sourceSettings = process.env.ENGLISHNODE_RESEARCH_SETTINGS_SOURCE || path.join(process.env.LOCALAPPDATA || "", "Antigravity", "ai-settings.json");
  const originalSettings = fs.readFileSync(sourceSettings), settingsData = JSON.parse(originalSettings.toString("utf8"));
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "englishnode-effort-")), temporarySettings = path.join(temporaryRoot, "ai-settings.json");
  const output = path.resolve("test-results", `planning-effort-2026-10-28-${Date.now()}`); fs.mkdirSync(output);
  const safe = evidenceSerializer([settingsData.apiKey, process.env.AI_API_KEY, process.env.OPENAI_API_KEY, process.env.DASHSCOPE_API_KEY, process.env.QWEN_API_KEY, process.env.DEEPSEEK_API_KEY, process.env.ENGLISHNODE_LOCAL_API_TOKEN]);
  const write = (name: string, value: unknown) => fs.writeFileSync(path.join(output, name), safe.json(value) + "\n");
  const oldEnv = Object.fromEntries(["AI_SETTINGS_PATH", "AI_ENABLE_THINKING", "AI_EXTRA_BODY_JSON"].map(key => [key, process.env[key]]));
  const oldFetch = globalThis.fetch, results: Record<string, unknown>[] = [];
  let active: { sample: typeof samples[number]; mode: Mode; calls: number; evidence: Record<string, unknown> } | null = null;
  let stopped: string | null = null, requests = 0;
  const assertFrozen = () => {
    if (hash(fs.readFileSync(transportFile)) !== transportHash || modulePaths.some(file => hash(fs.readFileSync(file)) !== moduleHashes[file]) || samples.some(s => hash(fs.readFileSync(path.join(sourceDir, s.file))) !== s.sourceHash)) throw new Error("Frozen replay source changed.");
    if (hash(fs.readFileSync(temporarySettings)) !== hash(originalSettings)) throw new Error("Temporary settings changed.");
  };
  try {
    fs.writeFileSync(temporarySettings, originalSettings, { flag: "wx" }); process.env.AI_SETTINGS_PATH = temporarySettings;
    const provider = createOpenAiCompatibleProvider();
    if (provider.config.provider !== "deepseek" || provider.config.model !== samples[0].body.model) throw new Error("Provider/model differs from archived inputs.");
    const providerOrigin = new URL(provider.config.baseUrl).origin;
    write("manifest.json", { frozenAt: new Date().toISOString(), sourceDir, transportHash, moduleHashes, settingsHash: hash(originalSettings), samples: samples.map(s => ({ id: s.id, originalRequest: s.request, file: s.file, sourceHash: s.sourceHash, promptHash: s.promptHash, modes: s.modes })), plannedCalls: 9, maxTokens: 12000, timeoutMs: 180000, semanticAcceptance: false, limits: "Three post-failure selected real prompts. One call per mode, no retry/correction re-review. Same archived request except thinking/effort. Direct/low/high orders rotated by case. Original routes, learner outcomes and arbitrary-domain accuracy are not tested. DeepSeek ignores temperature when thinking is enabled. No automatic product configuration change." });
    write("inputs.json", samples.map(s => ({ id: s.id, draft: s.draft, materials: s.materials, originalBody: s.body })));
    globalThis.fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (url.origin !== providerOrigin || url.pathname !== "/chat/completions" || init?.method !== "POST" || !active) throw new Error("Unexpected network request in fixed replay.");
      if (stopped || active.calls || requests >= 9) throw new Error(stopped || "Research call bound reached.");
      assertFrozen();
      const body = JSON.parse(String(init.body)) as Body;
      if (comparable(body) !== comparable(active.sample.body)) throw new Error("Actual replay body changed outside the two controlled mode parameters.");
      if (record(body.thinking).type !== (active.mode === "direct" ? "disabled" : "enabled") || (active.mode !== "direct" && body.reasoning_effort !== active.mode)) throw new Error("Actual mode was not encoded.");
      active.calls++; requests++; active.evidence.requestBody = body;
      write("progress.json", { id: active.sample.id, mode: active.mode, requests, at: new Date().toISOString() });
      const response = await oldFetch(input, init); active.evidence.httpStatus = response.status;
      if ([401, 403, 429].includes(response.status)) stopped = `Provider HTTP ${response.status}; stop entire replay.`;
      return response;
    };
    console.log(`Planning effort replay: ${output}`);
    for (const sample of samples) for (const mode of sample.modes) {
      if (stopped) break;
      process.env.AI_ENABLE_THINKING = mode === "direct" ? "0" : "1";
      process.env.AI_EXTRA_BODY_JSON = mode === "direct" ? "{}" : JSON.stringify({ reasoning_effort: mode });
      const evidence: Record<string, unknown> = { id: sample.id, mode, promptHash: sample.promptHash };
      active = { sample, mode, calls: 0, evidence }; const started = Date.now();
      try {
        const result = await provider.generateText({ taskType: "planning_knowledge_check", messages: sample.body.messages, temperature: sample.body.temperature, responseFormat: "json_object", maxTokens: 12000, timeoutMs: 180000, requiresWebResearch: false });
        evidence.raw = result.raw; evidence.text = result.text; evidence.usage = record(result.raw).usage;
        const choices = record(result.raw).choices as { finish_reason?: string }[] | undefined;
        if (choices?.some(choice => choice.finish_reason === "length")) throw new Error("Response truncated at fixed output budget.");
        const parsed = JSON.parse(result.text); evidence.parsedReport = parsed;
        const review = validateGeneratedPlanningKnowledgeReview(parsed, sample.draft, sample.materials);
        evidence.review = review; evidence.correctedDraft = applyPlanningKnowledgeCorrections(review, sample.draft);
        evidence.status = "contract-valid-and-applied";
      } catch (error) {
        evidence.status = "failed"; evidence.error = error instanceof Error ? error.message : String(error);
        const response = record(record(error).response);
        if (response.raw !== undefined) { evidence.raw = response.raw; evidence.text = response.text; evidence.providerRequestId = response.providerRequestId; evidence.usage = record(response.raw).usage; }
      }
      evidence.elapsedMs = Date.now() - started; evidence.requests = active.calls;
      results.push(evidence); write(`${String(results.length).padStart(2, "0")}-${sample.id}-${mode}.json`, evidence);
      write("summary.json", { results, requests, stopped, completed: results.length === 9, semanticAcceptance: false });
    }
    assertFrozen(); expect(requests).toBeLessThanOrEqual(9);
  } finally {
    globalThis.fetch = oldFetch;
    for (const [key, value] of Object.entries(oldEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    fs.rmSync(temporarySettings, { force: true }); fs.rmdirSync(temporaryRoot);
    const settingsUnchanged = hash(fs.readFileSync(sourceSettings)) === hash(originalSettings);
    write("cleanup.json", { temporarySettingsDeleted: !fs.existsSync(temporarySettings), settingsUnchanged, productDatabaseAccessed: false, requests });
    expect(settingsUnchanged).toBe(true);
  }
}, 1800000);
