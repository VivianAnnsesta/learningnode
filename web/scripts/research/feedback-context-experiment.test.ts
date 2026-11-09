/** Diagnostic experiment, explicitly opt-in. Does not use a product database. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { buildLearningKnowledgeReviewPrompt } from "./feedback-review-baseline-2026-10-28";
import { buildLearningKnowledgeReviewPrompt as buildScopedReviewPrompt } from "../../src/lib/learning/learningKnowledgeReviewPrompt";
import { createOpenAiCompatibleProvider } from "../../src/lib/ai/openaiCompatibleProvider";
import { evidenceSerializer } from "../../src/lib/ai/generationEvidence";
import { validateFocusedReview, applyContentFindings } from "../../src/lib/learning/learningContentReview";
import type { LearningFramework } from "../../src/lib/learning/flexibleTeaching";

type Case = { id: string; pair: string; focus: string; candidateText: string; interaction: Record<string, unknown> };
type Oracle = { id: string; expected: "confirmed_error" | "no_error_found"; reason: string; derivation: string };
const sha = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const repetitions = 2;
const maxTokens = 4096;
const timeoutMs = 120000;
const systemPrompt = "你是资深教师。按当前问题和真实用户输入提供准确、易懂的帮助。不要伪造来源、已掌握事实或唯一标准答案。不要求九维五段。只返回约定 JSON。";
const scopeExperiment = process.env.ENGLISHNODE_CONTEXT_SCOPE_EXPERIMENT === "1";

it.skipIf(process.env.ENGLISHNODE_CONTEXT_EXPERIMENT !== "1")("frozen paired feedback review: missing context versus actual interaction", async () => {
  const researchDir = path.resolve("scripts/research");
  const casesFile = path.join(researchDir, "feedback-context-cases.json");
  const oracleFile = path.join(researchDir, "feedback-context-oracle.json");
  const cases = JSON.parse(fs.readFileSync(casesFile, "utf8")) as Case[];
  const oracle = JSON.parse(fs.readFileSync(oracleFile, "utf8")) as Oracle[];
  const labels = new Map(oracle.map(item => [item.id, item]));
  expect(cases).toHaveLength(12);
  expect(labels.size).toBe(12);
  const pairs = [...new Set(cases.map(item => item.pair))];
  for (const pair of pairs) {
    const group = cases.filter(item => item.pair === pair);
    expect(group).toHaveLength(2);
    expect(group[0].focus).toBe(group[1].focus);
    expect(group[0].candidateText).toBe(group[1].candidateText);
    expect(labels.get(group[0].id)?.expected).not.toBe(labels.get(group[1].id)?.expected);
  }

  // Research launcher reads the installed Electron settings, then isolates its copy.
  // The production provider still obtains settings exclusively via AI_SETTINGS_PATH.
  const sourceSettings = process.env.ENGLISHNODE_RESEARCH_SETTINGS_SOURCE
    || path.join(process.env.LOCALAPPDATA || "", "Antigravity", "ai-settings.json");
  const originalSettings = fs.readFileSync(sourceSettings);
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "englishnode-context-research-"));
  const temporarySettings = path.join(tempRoot, "ai-settings.json");
  const previousSettingsPath = process.env.AI_SETTINGS_PATH;
  const output = path.resolve("test-results", `feedback-context-2026-10-28-${Date.now()}`);
  fs.mkdirSync(output, { recursive: true });
  const records: Record<string, unknown>[] = [];
  const startedAt = new Date().toISOString();
  let stopped: string | null = null;
  let settingsDeleted = false;
  try {
    fs.writeFileSync(temporarySettings, originalSettings, { flag: "wx" });
    process.env.AI_SETTINGS_PATH = temporarySettings;
    const provider = createOpenAiCompatibleProvider();
    const safe = evidenceSerializer([provider.config.apiKey, process.env.ENGLISHNODE_LOCAL_API_TOKEN]);
    const write = (name: string, value: unknown) => fs.writeFileSync(path.join(output, name), safe.json(value) + "\n");
    const schedule = cases.flatMap((item, caseIndex) => Array.from({ length: repetitions }, (_, repetition) => {
      const alternatives = scopeExperiment ? ["context", "context_scope"] : ["baseline", "context"];
      const arms = (caseIndex + repetition) % 2 ? [...alternatives].reverse() : alternatives;
      return arms.map(arm => ({ item, arm, repetition }));
    })).flat();
    const prompts = schedule.map((entry, index) => {
      const framework: LearningFramework = { schemaVersion: 4, title: "当前反馈", purpose: "回应当前问题", scope: entry.item.focus,
        mainIdea: entry.item.candidateText, prerequisites: [], limitations: [], segments: [] };
      const context = { schemaVersion: 4, focus: entry.item.focus, domain: null, task: null, record: null, returnTo: null };
      const builder = entry.arm === "context_scope" ? buildScopedReviewPrompt : buildLearningKnowledgeReviewPrompt;
      const prompt = builder({ framework, material: null, sources: [], frameworkIsCandidate: true,
        context: entry.arm !== "baseline" ? { ...context, currentInteraction: entry.item.interaction } : context });
      return { index, id: entry.item.id, pair: entry.item.pair, arm: entry.arm, repetition: entry.repetition,
        framework, prompt, promptHash: sha(prompt), promptChars: prompt.length };
    });
    for (const pair of pairs) {
      const baseline = prompts.filter(item => item.pair === pair && item.arm === "baseline");
      if (baseline.length) expect(new Set(baseline.map(item => item.promptHash)).size).toBe(1);
    }
    // Freeze all inputs and labels before the first network request. Labels are never sent.
    write("manifest.json", { startedAt, design: "Six contrasting pairs, two arms, two repetitions. Diagnostic development set, not unseen holdout or real learner data.",
      intervention: scopeExperiment ? "Both arms receive the same currentInteraction; context_scope adds generic review responsibilities for truthful attribution, reference fallibility and whole-candidate verdict consistency. Developed after inspecting the first diagnostic run; not held-out validation." : "Only add currentInteraction to the existing read-only context; prompt wording, candidate, model, sampling and output contract remain unchanged.",
      harnessHash: sha(fs.readFileSync(path.join(researchDir, "feedback-context-experiment.test.ts"))),
      scopedSourceHash: sha(fs.readFileSync(path.resolve("src/lib/learning/learningKnowledgeReviewPrompt.ts"))),
      baselineSourceHash: sha(fs.readFileSync(path.join(researchDir, "feedback-review-baseline-2026-10-28.ts"))),
      casesHash: sha(fs.readFileSync(casesFile)), oracleHash: sha(fs.readFileSync(oracleFile)),
      provider: provider.config.provider, model: provider.config.model, temperature: provider.config.temperature,
      maxTokens, timeoutMs, repetitions, plannedCalls: prompts.length, parallelism: 2,
      scoring: "Report correct error detection, false accusations, abstentions, contract/transport failures separately. Corrections require qualitative inspection; verdict accuracy alone is not repair or learning efficacy.",
      sourceSettingsHash: sha(originalSettings) });
    write("cases.json", cases); write("oracle.json", oracle); write("prompts.json", prompts);
    console.log(`Experiment initialized: ${output}; ${prompts.length} planned calls; ${provider.config.provider}/${provider.config.model}`);
    let cursor = 0;
    const worker = async () => {
      while (cursor < prompts.length && !stopped) {
        const task = prompts[cursor++];
        const start = Date.now();
        const record: Record<string, unknown> = { index: task.index, id: task.id, pair: task.pair, arm: task.arm, repetition: task.repetition,
          promptHash: task.promptHash, expected: labels.get(task.id)!.expected, startedAt: new Date(start).toISOString() };
        try {
          const result = await provider.generateText({ taskType: "node_knowledge_check", messages: [{ role: "system", content: systemPrompt }, { role: "user", content: task.prompt }],
            responseFormat: "json_object", maxTokens, timeoutMs, requiresWebResearch: false });
          record.rawOutput = result.text; record.providerResponse = result.raw; record.providerRequestId = result.providerRequestId;
          try {
            const envelope = result.raw as { choices?: { finish_reason?: string }[] };
            if (envelope.choices?.some(choice => choice.finish_reason === "length")) throw new Error("Output truncated by token limit");
            const parsed = JSON.parse(result.text.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, ""));
            record.parsed = parsed;
            const review = validateFocusedReview(parsed, task.framework, null);
            record.review = review;
            record.correctedCandidate = applyContentFindings(review, task.framework, null).framework?.mainIdea;
            record.status = "complete";
            record.decisionMatches = review.verdict === labels.get(task.id)!.expected;
          } catch (error) {
            record.status = "contract_error";
            record.error = error instanceof Error ? error.message : String(error);
          }
        } catch (error) {
          record.status = "transport_error";
          record.error = error instanceof Error ? error.message : String(error);
          const details = error as { status?: number; response?: unknown };
          if (details.response) record.providerResponse = details.response;
          if ([401, 402, 403, 429].includes(details.status || 0)) stopped = `Provider status ${details.status}; stop without retrying`;
        }
        record.elapsedMs = Date.now() - start;
        records.push(record);
        write(`${String(task.index).padStart(3, "0")}-${task.id}-${task.arm}-r${task.repetition}.json`, record);
        write("progress.json", { startedAt, completed: records.length, planned: prompts.length, stopped });
        console.log(`${records.length}/${prompts.length} ${task.id} ${task.arm} ${record.status} ${(record.review as { verdict?: string })?.verdict || ""} ${record.elapsedMs}ms`);
      }
    };
    await Promise.all([worker(), worker()]);
    const metrics = (scopeExperiment ? ["context", "context_scope"] : ["baseline", "context"]).map(arm => {
      const runs = records.filter(item => item.arm === arm);
      const verdict = (item: Record<string, unknown>) => (item.review as { verdict?: string })?.verdict;
      return { arm, planned: prompts.filter(item => item.arm === arm).length, attempted: runs.length,
        correctDecisions: runs.filter(item => item.decisionMatches === true).length,
        confirmedErrorsDetected: runs.filter(item => item.expected === "confirmed_error" && verdict(item) === "confirmed_error").length,
        errorsMissedAsNoError: runs.filter(item => item.expected === "confirmed_error" && verdict(item) === "no_error_found").length,
        falseAccusations: runs.filter(item => item.expected === "no_error_found" && verdict(item) === "confirmed_error").length,
        correctRetentions: runs.filter(item => item.expected === "no_error_found" && verdict(item) === "no_error_found").length,
        abstentions: runs.filter(item => verdict(item) === "uncertain").length,
        contractErrors: runs.filter(item => item.status === "contract_error").length,
        transportErrors: runs.filter(item => item.status === "transport_error").length,
        totalLatencyMs: runs.reduce((total, item) => total + Number(item.elapsedMs), 0),
        usage: runs.map(item => (item.providerResponse as { usage?: unknown })?.usage || null) };
    });
    write("summary.json", { startedAt, finishedAt: new Date().toISOString(), stopped, metrics,
      limitations: ["Constructed diagnostic pairs, not prevalence estimates or held-out testing", "No real learner outcomes", "Review decision matching is not semantic verification of replacements", "No production API, database, or bounded retry flow exercised", "Unknown billed cost; provider token usage retained"] });
    console.log(JSON.stringify({ output, metrics: metrics.map(({ usage: _usage, ...rest }) => rest), stopped }));
  } finally {
    if (previousSettingsPath === undefined) delete process.env.AI_SETTINGS_PATH; else process.env.AI_SETTINGS_PATH = previousSettingsPath;
    if (fs.existsSync(temporarySettings)) fs.unlinkSync(temporarySettings);
    settingsDeleted = !fs.existsSync(temporarySettings);
    fs.rmdirSync(tempRoot);
    const unchanged = sha(fs.readFileSync(sourceSettings)) === sha(originalSettings);
    fs.writeFileSync(path.join(output, "cleanup.json"), JSON.stringify({ settingsDeleted, originalSettingsUnchanged: unchanged, noProductDatabaseUsed: true }, null, 2));
    expect(unchanged).toBe(true); expect(settingsDeleted).toBe(true);
  }
}, 3600000);
