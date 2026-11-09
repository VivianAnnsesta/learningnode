import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { createOpenAiCompatibleProvider } from "../../src/lib/ai/openaiCompatibleProvider";
import { evidenceSerializer } from "../../src/lib/ai/generationEvidence";
import { buildLearningFeedbackReviewPrompt, validateLearningFeedbackReview, type LearningFeedbackReviewInput } from "../../src/lib/learning/learningFeedbackReview";

const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
it.skipIf(process.env.ENGLISHNODE_THINKING_COMPARISON !== "1")("same frozen whole-feedback tasks with thinking disabled and enabled", async () => {
  const sourceManifest = path.resolve("test-results/whole-feedback-repair-2026-10-28-1793179109821/manifest.json");
  const tests = JSON.parse(fs.readFileSync(sourceManifest, "utf8")).tests as { id: string; input: LearningFeedbackReviewInput; expectedFirst: string }[];
  const sourceSettings = process.env.ENGLISHNODE_RESEARCH_SETTINGS_SOURCE || path.join(process.env.LOCALAPPDATA || "", "Antigravity", "ai-settings.json");
  const original = fs.readFileSync(sourceSettings), config = JSON.parse(original.toString("utf8"));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "englishnode-thinking-research-")), settings = path.join(root, "ai-settings.json");
  const oldSettings = process.env.AI_SETTINGS_PATH, oldThinking = process.env.AI_ENABLE_THINKING;
  const output = path.resolve("test-results", `thinking-comparison-2026-10-28-${Date.now()}`);
  fs.mkdirSync(output, { recursive: true });
  const safe = evidenceSerializer([config.apiKey, process.env.ENGLISHNODE_LOCAL_API_TOKEN]);
  const write = (file: string, value: unknown) => fs.writeFileSync(path.join(output, file), safe.json(value) + "\n");
  try {
    if (process.env.AI_EXTRA_BODY_JSON) throw new Error("Explicit extra request body must be removed before this isolated comparison to avoid overriding the thinking toggle.");
    fs.writeFileSync(settings, original, { flag: "wx" }); process.env.AI_SETTINGS_PATH = settings;
    const provider = createOpenAiCompatibleProvider();
    if (provider.config.provider !== "deepseek" || !provider.config.model.startsWith("deepseek-v4")) throw new Error("This comparison requires the verified configured DeepSeek v4 toggle path.");
    const schedule = tests.flatMap((test, index) => [0, 1].flatMap(repetition => ((index + repetition) % 2 ? [true, false] : [false, true]).map(thinking => ({ test, repetition, thinking, prompt: buildLearningFeedbackReviewPrompt(test.input) }))));
    write("manifest.json", { date: new Date().toISOString(), sourceManifestHash: hash(fs.readFileSync(sourceManifest)), promptModuleHash: hash(fs.readFileSync(path.resolve("src/lib/learning/learningFeedbackReview.ts"))),
      provider: provider.config.provider, model: provider.config.model, requestedTemperature: provider.config.temperature,
      officialParameterNote: "DeepSeek thinking mode ignores temperature; this compares supported execution modes, not isolated internal reasoning with identical effective sampling.",
      docs: "https://api-docs.deepseek.com/guides/thinking_mode/", maxTokens: 10000, timeoutMs: 120000, plannedCalls: schedule.length,
      order: "Sequential, alternate arm order within case repetitions; one initial report per arm, no automatic retries or replacement re-review.",
      interpretation: "Constructed diagnostic and intentionally corrupted model replies; developer set. Original candidate controls have documented interpretation-sensitive activity wording. No real learner or population success-rate claim.", tests });
    write("prompts.json", schedule.map(({ test, prompt, repetition, thinking }) => ({ id: test.id, repetition, thinking, prompt, promptHash: hash(prompt) })));
    console.log(`Thinking comparison: ${output}, ${schedule.length} calls`);
    const records: Record<string, unknown>[] = [];
    for (const [index, job] of schedule.entries()) {
      process.env.AI_ENABLE_THINKING = job.thinking ? "1" : "0";
      const start = Date.now();
      const record: Record<string, unknown> = { index, id: job.test.id, repetition: job.repetition, thinkingRequested: job.thinking, expectedFirst: job.test.expectedFirst, promptHash: hash(job.prompt) };
      try {
        const result = await provider.generateText({ taskType: "node_knowledge_check", messages: [{ role: "system", content: "独立核对完整教学反馈及当次证据。只返回约定JSON，不将参考或旧报告当成真值。" }, { role: "user", content: job.prompt }], responseFormat: "json_object", maxTokens: 10000, timeoutMs: 120000, requiresWebResearch: false });
        record.rawOutput = result.text; record.providerResponse = result.raw;
        const raw = result.raw as { choices?: { finish_reason?: string; message?: { reasoning_content?: string } }[] };
        record.reasoningReturned = Boolean(raw.choices?.[0]?.message?.reasoning_content);
        if (raw.choices?.some(choice => choice.finish_reason === "length")) throw new Error("Output token ceiling reached");
        const review = validateLearningFeedbackReview(JSON.parse(result.text), job.test.input.reply, job.test.input.actionContext, job.test.input.kind);
        record.review = review; record.status = "complete"; record.firstMatches = review.verdict === job.test.expectedFirst;
      } catch (error) {
        record.status = record.rawOutput ? "contract_error" : "provider_error";
        record.error = error instanceof Error ? error.message : String(error);
        const response = (error as { response?: unknown })?.response;
        if (response) record.providerResponse = response;
      }
      record.elapsedMs = Date.now() - start; records.push(record);
      write(`${String(index).padStart(2, "0")}-${job.test.id}-${job.thinking ? "thinking" : "direct"}-r${job.repetition}.json`, record);
      write("progress.json", { completed: records.length, planned: schedule.length });
      console.log(`${records.length}/${schedule.length} ${job.test.id} thinking=${job.thinking} ${record.status} ${(record.review as { verdict?: string })?.verdict || ""} ${record.elapsedMs}ms`);
    }
    write("summary.json", { records, semanticReviewRequired: true, outcomeScope: "First report usability and field-specific repair on development cases; not teaching efficacy or whole production loop." });
  } finally {
    if (oldSettings === undefined) delete process.env.AI_SETTINGS_PATH; else process.env.AI_SETTINGS_PATH = oldSettings;
    if (oldThinking === undefined) delete process.env.AI_ENABLE_THINKING; else process.env.AI_ENABLE_THINKING = oldThinking;
    if (fs.existsSync(settings)) fs.unlinkSync(settings); fs.rmdirSync(root);
    const unchanged = hash(fs.readFileSync(sourceSettings)) === hash(original);
    write("cleanup.json", { originalSettingsUnchanged: unchanged, temporarySettingsDeleted: !fs.existsSync(settings), noProductDatabaseUsed: true });
    expect(unchanged).toBe(true);
  }
}, 3600000);
