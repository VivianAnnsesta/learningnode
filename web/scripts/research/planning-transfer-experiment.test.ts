import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { createOpenAiCompatibleProvider } from "../../src/lib/ai/openaiCompatibleProvider";
import { evidenceSerializer } from "../../src/lib/ai/generationEvidence";
import {
  applyPlanningKnowledgeCorrections,
  buildPlanningKnowledgePrompt,
  planningKnowledgeDigest,
  validateGeneratedPlanningKnowledgeReview
} from "../../src/lib/ai/planningKnowledgeReview";
import { tutorSystemPolicy } from "../../src/lib/ai/tutorPolicy";
import { validationIssues } from "../../src/lib/ai/validationEvidence";
import type { AiGenerateTextInput } from "../../src/lib/ai/provider";

type TransferCase = { id: string; pair: string; domain: string; goal: string; planningText: string };
const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const teachingField = "stages[0].modules[0].items[0].concept.learningUnit.newKnowledge";
const caseSchema = {
  type: "array", minItems: 12, maxItems: 12,
  items: { type: "object", additionalProperties: false, required: ["id", "pair", "domain", "goal", "planningText"],
    properties: { id: { type: "string", pattern: "^[a-z0-9][a-z0-9_-]*$" }, pair: { type: "string", minLength: 1 },
      domain: { type: "string", minLength: 1 }, goal: { type: "string", minLength: 1 }, planningText: { type: "string", minLength: 1 } } },
  experimentConstraints: { uniqueIds: true, pairs: 6, casesPerPair: 2, pairedDomainAndGoalIdentical: true }
};

function parseCases(bytes: Buffer): TransferCase[] {
  const value: unknown = JSON.parse(bytes.toString("utf8"));
  if (!Array.isArray(value) || value.length !== 12) throw new Error("Planning transfer requires exactly 12 frozen cases (6 pairs).");
  const ids = new Set<string>(), pairs = new Map<string, TransferCase[]>();
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) throw new Error("Every case must be an object.");
    const fields = ["id", "pair", "domain", "goal", "planningText"];
    if (Object.keys(item).length !== fields.length || fields.some(key => typeof item[key] !== "string" || !item[key].trim())) throw new Error("Cases must contain only five nonempty string fields: id, pair, domain, goal, planningText.");
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(item.id) || ids.has(item.id)) throw new Error("Case IDs must be unique and safe as evidence filenames.");
    ids.add(item.id);
    const entries = pairs.get(item.pair) || [];
    entries.push(item as TransferCase); pairs.set(item.pair, entries);
  }
  if (pairs.size !== 6 || [...pairs.values()].some(entries => entries.length !== 2 || entries[0].domain !== entries[1].domain || entries[0].goal !== entries[1].goal)) throw new Error("Require 6 pairs of 2 cases, with identical domain and goal within each pair.");
  return value as TransferCase[];
}

// This is a minimal candidate for the production knowledge-review contract, not
// a structurally accepted course or a candidate authorized for formal map writes.
function wrapCase(entry: TransferCase) {
  return { goal: entry.goal, stages: [{ key: "research-stage", modules: [{ key: "research-module", items: [{
    key: "research-node", prerequisiteKeys: [], concept: { learningUnit: { newKnowledge: entry.planningText } }
  }] }] }] };
}
const fieldText = (draft: ReturnType<typeof wrapCase>) => draft.stages[0].modules[0].items[0].concept.learningUnit.newKnowledge;
const object = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const usageOf = (raw: unknown) => object(raw)?.usage ?? null;
const usageTotals = (records: Record<string, unknown>[]) => {
  const keys = ["prompt_tokens", "completion_tokens", "total_tokens", "prompt_cache_hit_tokens", "prompt_cache_miss_tokens"];
  return Object.fromEntries(keys.map(key => {
    const values = records.map(record => object(record.usage)?.[key]).filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    return [key, { knownSum: values.reduce((sum, value) => sum + value, 0), recordsWithValue: values.length, missingRecords: records.length - values.length }];
  }));
};
function publicEndpoint(raw: string) {
  const url = new URL(raw);
  url.username = ""; url.password = "";
  for (const key of [...url.searchParams.keys()]) url.searchParams.set(key, "[REDACTED]");
  return url.toString();
}

it.skipIf(process.env.ENGLISHNODE_PLANNING_TRANSFER !== "1")("frozen planning claims: one production review each with thinking off and on", async () => {
  // This opt-in test never loads .env, imports Prisma, invokes tutorService, or writes a product database.
  // The oracle is opaque bytes throughout; even its labels are not parsed by this harness.
  const casesPath = path.resolve("scripts/research/planning-transfer-cases.json");
  const oraclePath = path.resolve("scripts/research/planning-transfer-oracle.json");
  const casesBytes = fs.readFileSync(casesPath), oracleBytes = fs.readFileSync(oraclePath);
  const cases = parseCases(casesBytes);
  if (!oracleBytes.length) throw new Error("The separate oracle must exist before freezing the experiment.");
  if (process.env.AI_EXTRA_BODY_JSON?.trim()) throw new Error("Remove AI_EXTRA_BODY_JSON before this isolated comparison; it can override the thinking toggle.");
  const modulePaths = ["scripts/research/planning-transfer-experiment.test.ts", "src/lib/ai/planningKnowledgeReview.ts",
    "src/lib/ai/tutorPolicy.ts", "src/lib/ai/openaiCompatibleProvider.ts", "src/lib/ai/provider.ts",
    "src/lib/ai/settingsService.ts", "src/lib/ai/generationEvidence.ts", "src/lib/ai/validationEvidence.ts"];
  const moduleHashes = Object.fromEntries(modulePaths.map(file => [file, hash(fs.readFileSync(path.resolve(file)))]));
  const assertFrozenFiles = () => {
    if (hash(fs.readFileSync(casesPath)) !== hash(casesBytes) || hash(fs.readFileSync(oraclePath)) !== hash(oracleBytes)
      || modulePaths.some(file => hash(fs.readFileSync(path.resolve(file))) !== moduleHashes[file])) throw new Error("Frozen cases, oracle, or production/harness module changed; stop rather than mix experiment versions.");
  };
  const tests = cases.map(entry => {
    const draft = wrapCase(entry);
    const input = { draft, materials: [], learner: { domain: entry.domain, goal: entry.goal }, scope: "stage", stageKey: "research-stage" };
    const prompt = buildPlanningKnowledgePrompt(input);
    // Pure path/contract preflight. This synthetic uncertain report is never a
    // model result, semantic verdict, experimental observation, or model input.
    const probe = validateGeneratedPlanningKnowledgeReview({ summary: "仅检查实验包装路径，不核查命题。", limitations: ["未进行任何知识真伪核查。"], findings: [], claims: [{
      key: "contract-preflight", path: teachingField, quote: entry.planningText.slice(0, 100), conclusion: "尚未核查该教学文字。", premises: [], applicability: [],
      verdict: "uncertain", basis: { kind: "unverified", fragmentIds: [], reason: "纯合同路径预检；没有知识正确性结论。" }, reason: "未进行知识核查。"
    }] }, draft, []);
    if (planningKnowledgeDigest(applyPlanningKnowledgeCorrections(probe, draft)) !== planningKnowledgeDigest(draft) || !prompt.includes(teachingField)) throw new Error("Minimal review wrapper failed its production path preflight.");
    return { entry, input, prompt, promptHash: hash(prompt) };
  });
  const schedule = tests.flatMap((test, index) => (index % 2 ? [true, false] : [false, true]).map(thinking => ({ test, thinking })));
  const sourceSettings = process.env.ENGLISHNODE_RESEARCH_SETTINGS_SOURCE || path.join(process.env.LOCALAPPDATA || "", "Antigravity", "ai-settings.json");
  const original = fs.readFileSync(sourceSettings), sourceConfig = JSON.parse(original.toString("utf8")) as Record<string, unknown>;
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "englishnode-planning-transfer-"));
  const temporarySettings = path.join(temporaryRoot, "ai-settings.json");
  const oldSettings = process.env.AI_SETTINGS_PATH, oldThinking = process.env.AI_ENABLE_THINKING, oldFetch = globalThis.fetch;
  const output = path.resolve("test-results", `planning-transfer-2026-10-28-${Date.now()}`);
  fs.mkdirSync(output, { recursive: true });
  const safe = evidenceSerializer([typeof sourceConfig.apiKey === "string" ? sourceConfig.apiKey : undefined, process.env.ENGLISHNODE_LOCAL_API_TOKEN]);
  const write = (file: string, value: unknown) => fs.writeFileSync(path.join(output, file), safe.json(value) + "\n");
  const records: Record<string, unknown>[] = [];
  let providerStopReason: string | null = null;
  let active: { record: Record<string, unknown>; filename: string; thinking: boolean; id: string } | null = null;
  const requestDigests = new Map<string, string>();
  try {
    fs.writeFileSync(temporarySettings, original, { flag: "wx" });
    process.env.AI_SETTINGS_PATH = temporarySettings;
    const provider = createOpenAiCompatibleProvider();
    if (provider.config.provider !== "deepseek" || !provider.config.model.startsWith("deepseek-v4")) throw new Error("This comparison requires the verified configured DeepSeek v4 thinking-toggle path.");
    const { apiKey: omittedApiKey, ...publicConfig } = provider.config;
    void omittedApiKey;
    write("manifest.json", {
      frozenAt: new Date().toISOString(), casesSha256: hash(casesBytes), oracleSha256: hash(oracleBytes), caseSchema, caseSchemaSha256: hash(JSON.stringify(caseSchema)), moduleHashes,
      providerConfig: { ...publicConfig, baseUrl: publicEndpoint(publicConfig.baseUrl), apiKeyPresent: Boolean(provider.config.apiKey) },
      maxTokens: 10000, timeoutMs: 120000, responseFormat: "json_object", requiresWebResearch: false, plannedCalls: schedule.length,
      systemPrompt: tutorSystemPolicy, systemPromptSha256: hash(tutorSystemPolicy), teachingField,
      order: "One initial report per case per arm; sequential calls, alternate arm order by case index; no retries, report repair, or corrected-candidate re-review.",
      thinkingComparisonCaveat: "Requested temperature is identical; DeepSeek thinking mode may ignore it. This compares supported execution modes, not isolated internal reasoning under identical effective sampling.",
      wrapperLimit: "Minimal production knowledge-review input only; not an accepted course, full route evaluation, or structural course validation.",
      correctionLimit: "Only direct applyPlanningKnowledgeCorrections. No canonical projection or structural revalidation; successful application does not prove a correction is true.",
      outcomeLimit: "Diagnostic development pairs, not learners or a held-out set. The oracle stays opaque; interpretation and correction quality require independent reading.",
      costs: "Provider-reported usage and elapsed time retained. Missing usage is not zero. No monetary price estimate or success claim from test completion.",
      schedule: schedule.map(({ test, thinking }, index) => ({ index, id: test.entry.id, pair: test.entry.pair, thinking, promptHash: test.promptHash }))
    });
    write("cases-frozen.json", cases);
    write("oracle-frozen-opaque.json", { sha256: hash(oracleBytes), originalUtf8: oracleBytes.toString("utf8"), usedInPrompts: false, parsedByHarness: false });
    write("inputs.json", tests.map(test => ({ id: test.entry.id, input: test.input, prompt: test.prompt, promptHash: test.promptHash })));
    write("preflight.json", { cases: cases.length, pairs: 6, pathAcceptedByProductionValidator: true, emptyPatchPreservesCandidate: true, modelCalls: 0, knowledgeJudgementPerformed: false });
    // Observe the actual provider request without changing it. Persist before
    // fetch so interrupted calls still retain the submitted input and settings.
    globalThis.fetch = async (resource, init) => {
      if (!active || typeof init?.body !== "string") throw new Error("Unexpected fetch outside the single active planning call.");
      const requests = (active.record.transportRequests as unknown[]) || [];
      if (requests.length) throw new Error("More than one transport request in an arm is forbidden; no retries.");
      const body = JSON.parse(init.body) as Record<string, unknown>;
      if (object(body.thinking)?.type !== (active.thinking ? "enabled" : "disabled")) throw new Error("Provider did not encode the requested thinking arm.");
      const { thinking: omittedThinking, ...fixedBody } = body;
      void omittedThinking;
      const digest = hash(JSON.stringify(fixedBody)), prior = requestDigests.get(active.id);
      if (prior && prior !== digest) throw new Error("Paired actual requests differ beyond thinking; stop this call.");
      requestDigests.set(active.id, digest);
      const headers = new Headers(init.headers);
      requests.push({ endpoint: publicEndpoint(typeof resource === "string" ? resource : resource instanceof URL ? resource.toString() : resource.url),
        method: init.method, headers: { "Content-Type": headers.get("Content-Type"), Authorization: headers.has("Authorization") ? "[REDACTED]" : null },
        body, bodySha256: hash(init.body), bodyWithoutThinkingSha256: digest });
      active.record.transportRequests = requests;
      write(active.filename, active.record);
      const response = await oldFetch(resource, init);
      if ([401, 403, 429].includes(response.status)) providerStopReason = `Provider HTTP ${response.status}; stop the remaining research calls.`;
      return response;
    };
    console.log(`Planning transfer: ${output}; ${schedule.length} initial calls; oracle excluded from prompts.`);
    for (const [index, job] of schedule.entries()) {
      assertFrozenFiles();
      process.env.AI_ENABLE_THINKING = job.thinking ? "1" : "0";
      const request: AiGenerateTextInput = { taskType: "planning_knowledge_check", messages: [{ role: "system", content: tutorSystemPolicy }, { role: "user", content: job.test.prompt }],
        responseFormat: "json_object", maxTokens: 10000, timeoutMs: 120000, requiresWebResearch: false };
      const started = Date.now(), filename = `${String(index).padStart(2, "0")}-${job.test.entry.id}-${job.thinking ? "thinking" : "direct"}.json`;
      const record: Record<string, unknown> = { index, id: job.test.entry.id, pair: job.test.entry.pair, thinkingRequested: job.thinking,
        startedAt: new Date(started).toISOString(), status: "running", reportContractStatus: "not_received", correctionApplicationStatus: "not_attempted",
        promptHash: job.test.promptHash, request, originalDraft: job.test.input.draft, originalField: { path: teachingField, text: job.test.entry.planningText },
        transportRequests: [], usage: null };
      active = { record, filename, thinking: job.thinking, id: job.test.entry.id };
      write(filename, record);
      let phase = "provider";
      try {
        const result = await provider.generateText(request);
        record.rawOutput = result.text; record.providerResponse = result.raw; record.providerRequestId = result.providerRequestId ?? null;
        record.usage = usageOf(result.raw);
        const choices = object(result.raw)?.choices;
        record.reasoningReturned = Array.isArray(choices) && choices.some(choice => Boolean(object(object(choice)?.message)?.reasoning_content));
        record.finishReasons = Array.isArray(choices) ? choices.map(choice => object(choice)?.finish_reason ?? null) : [];
        phase = "output";
        if (Array.isArray(choices) && choices.some(choice => object(choice)?.finish_reason === "length")) throw new Error("Output token ceiling reached; no retry or continuation.");
        phase = "json";
        const parsed: unknown = JSON.parse(result.text);
        record.parsedReport = parsed;
        record.rawReportFields = { topLevelVerdict: object(parsed)?.verdict ?? null, summary: object(parsed)?.summary ?? null,
          limitations: object(parsed)?.limitations ?? null, claims: object(parsed)?.claims ?? null, findings: object(parsed)?.findings ?? null };
        phase = "contract";
        const review = validateGeneratedPlanningKnowledgeReview(parsed, job.test.input.draft, []);
        record.review = review; record.reportContractStatus = "valid";
        record.derivedVerdict = review.verdict;
        phase = "apply";
        const corrected = applyPlanningKnowledgeCorrections(review, job.test.input.draft);
        record.correctedDraft = corrected; record.correctedField = { path: teachingField, text: fieldText(corrected) };
        record.candidateChanged = planningKnowledgeDigest(corrected) !== planningKnowledgeDigest(job.test.input.draft);
        record.correctionApplicationStatus = review.findings.length ? "applied" : "no_findings_no_op";
        record.status = "complete";
      } catch (error) {
        record.status = `${phase}_error`; record.error = error instanceof Error ? error.message : String(error);
        if (phase === "contract") { record.reportContractStatus = "invalid"; record.validationIssues = validationIssues(error); }
        else if (phase === "json" || phase === "output") record.reportContractStatus = "not_parsed";
        if (phase === "apply") { record.correctionApplicationStatus = "failed"; record.applicationIssues = validationIssues(error); }
        const response = object(error)?.response;
        if (response) {
          record.providerFailureResponse = response;
          record.providerResponse = object(response)?.raw ?? response;
          record.rawOutput = object(response)?.text ?? record.rawOutput ?? null;
          record.providerRequestId = object(response)?.providerRequestId ?? null;
          record.usage = usageOf(object(response)?.raw ?? response);
        }
      }
      record.elapsedMs = Date.now() - started; records.push(record); active = null;
      write(filename, record);
      write("progress.json", { completed: records.length, planned: schedule.length, usage: usageTotals(records), last: { id: record.id, thinking: record.thinkingRequested, status: record.status } });
      console.log(`${records.length}/${schedule.length} ${record.id} thinking=${job.thinking} ${record.status} ${record.derivedVerdict || ""} ${record.elapsedMs}ms`);
      if (providerStopReason) throw new Error(providerStopReason);
    }
    assertFrozenFiles();
    write("summary.json", { records, completed: records.length, planned: schedule.length, usage: usageTotals(records), elapsedMs: records.reduce((sum, record) => sum + Number(record.elapsedMs || 0), 0),
      reportStatusCounts: records.reduce<Record<string, number>>((counts, record) => { const key = String(record.reportContractStatus); counts[key] = (counts[key] || 0) + 1; return counts; }, {}),
      semanticReviewRequired: true, oracleCompared: false, outcomeScope: "Initial production planning-review contract and pure correction application only. Test completion is not judgement accuracy, route quality, or learning efficacy." });
  } catch (error) {
    write("aborted.json", { completed: records.length, planned: schedule.length, error: error instanceof Error ? error.message : String(error), partialEvidenceRetained: true });
    throw error;
  } finally {
    globalThis.fetch = oldFetch;
    if (oldSettings === undefined) delete process.env.AI_SETTINGS_PATH; else process.env.AI_SETTINGS_PATH = oldSettings;
    if (oldThinking === undefined) delete process.env.AI_ENABLE_THINKING; else process.env.AI_ENABLE_THINKING = oldThinking;
    if (fs.existsSync(temporarySettings)) fs.unlinkSync(temporarySettings);
    fs.rmdirSync(temporaryRoot);
    const originalSettingsUnchanged = hash(fs.readFileSync(sourceSettings)) === hash(original);
    write("cleanup.json", { originalSettingsUnchanged, temporarySettingsDeleted: !fs.existsSync(temporarySettings), temporaryDirectoryDeleted: !fs.existsSync(temporaryRoot), environmentRestored: true, fetchRestored: globalThis.fetch === oldFetch, noProductDatabaseUsed: true });
    expect(originalSettingsUnchanged).toBe(true);
  }
}, 3600000);
