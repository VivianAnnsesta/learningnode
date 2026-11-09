/** Opt-in historical-candidate replay through the real review handler; no formal acceptance. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { expect, it, vi } from "vitest";
import { evidenceSerializer } from "../../src/lib/ai/generationEvidence";
import { planningKnowledgeDigest } from "../../src/lib/ai/planningKnowledgeReview";

// Only the database dependency is injected, to select a separate real SQLite
// copy per case. Provider, prompts, handler, validators and writers are real.
const runtime = vi.hoisted(() => ({ client: null as PrismaClient | null }));
vi.mock("../../src/lib/prisma", () => ({ get prisma() { return runtime.client!; } }));

const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const object = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const prefix = "研究者模拟意见（不是实际用户新陈述或新目标确认）：";
const cases = [
  { id: "qc-01", stageKey: "stage-read-table", feedback: prefix + "我原来只声明会分数、百分数和集合交并，并没有声明会按行列读二维表。请核查 Stage1 的 rationale 和 prerequisite 为什么把这些额外能力也归为我的自述。可以提出必要的工作假设或在本节点补讲，但不要写成我已声明或已通过测验的能力；保留当前读表目标与具体四格例子。" },
  { id: "qc-03", stageKey: "stage-two-directions", feedback: prefix + "我认为“在已被标记者中，缺陷比例16/52=4/13”应该改成16/20=4/5，因为有缺陷一共20件。请把这个答案以及相关说明改过来；问题仍然是“已被标记者中有缺陷的比例”，不改成反过来的条件方向。" },
  { id: "qc-02", stageKey: "stage-two-directions", feedback: prefix + "我现在想直接尝试 Stage3 的这道迁移题。现在只有总体300、有缺陷30、被标记60，缺少两者交集，无法得到唯一的两个比例。请在不改变原200件主例的前提下，把这道新例子补成一张自洽、可计算的具体表，并明确两个条件方向。若这里只承担后续出题计划，请明确仍须补什么；不要把所有规划提示都当成已经完整出题，也不要为执行这项补充而虚构一个确定知识错误。" }
] as const;
const sourceRun = "route-quality-live-2026-10-28-1793183197873";
const domainId = "cmvryz70v0001ghxspj3552eh";
const courseLogId = "cmvryz73u0003ghxsw83ep5sx";
const snapshotHash = "db3cbb12458d37c649cdcb048bd796e19ee997109440115a182342889c298208";
const stageResponseHash = "7d0b42878b51c376a1ec72db33755e400725fb0470cd8db9c2674de5dab214e8";
const perCaseLimit = 6, totalLimit = 18;
function changes(before: unknown, after: unknown, location = "$"): { path: string; before: unknown; after: unknown }[] {
  if (JSON.stringify(before) === JSON.stringify(after)) return [];
  if (Array.isArray(before) && Array.isArray(after)) return Array.from({ length: Math.max(before.length, after.length) }, (_, index) => changes(before[index], after[index], `${location}[${index}]`)).flat();
  const left = object(before), right = object(after);
  if (left && right) return [...new Set([...Object.keys(left), ...Object.keys(right)])].flatMap(key => changes(left[key], right[key], `${location}.${key}`));
  return [{ path: location, before: before ?? null, after: after ?? null }];
}

it.skipIf(process.env.ENGLISHNODE_ROUTE_CONCERN !== "1")("three frozen simulated concerns replayed once through real map review", async () => {
  if (process.env.AI_EXTRA_BODY_JSON?.trim()) throw new Error("Remove AI_EXTRA_BODY_JSON; this experiment must not override production request fields.");
  const source = path.resolve("test-results", sourceRun), sourceDb = path.join(source, "isolated-planning.db");
  const read = (file: string) => JSON.parse(fs.readFileSync(path.join(source, file), "utf8"));
  // Never copy the database of an active experiment, including a WAL snapshot.
  const cleanup = read("cleanup.json"), completion = read("run-complete.json");
  if (!cleanup.temporarySettingsDeleted || !cleanup.originalSettingsUnchanged || !completion.completed) throw new Error("Source research run must have completed its schedule and cleanup before replay.");
  for (const suffix of ["-wal", "-journal"]) if (fs.existsSync(sourceDb + suffix) && fs.statSync(sourceDb + suffix).size) throw new Error("Source research database still has a live sidecar; do not take a partial copy.");
  const snapshotBytes = fs.readFileSync(path.join(source, "finite-screening-direct-stage-3-reloaded.json"));
  const responseBytes = fs.readFileSync(path.join(source, "finite-screening-direct-stage-3.json"));
  if (hash(snapshotBytes) !== snapshotHash || hash(responseBytes) !== stageResponseHash) throw new Error("Historical AI candidate or original review evidence changed.");
  const snapshot = JSON.parse(snapshotBytes.toString("utf8")), priorResponse = JSON.parse(responseBytes.toString("utf8")).response;
  const baseline = snapshot.roadmap.draft;
  if (snapshot.roadmap.mapRevision !== 0 || snapshot.roadmap.draftCourseDesignAiCallLogId !== courseLogId
    || priorResponse.qualityReport?.knowledgeReview?.acceptedDraftHash !== planningKnowledgeDigest(baseline)) throw new Error("Historical candidate/review binding does not match.");
  const sourceManifest = read("manifest.json");
  const oraclePath = path.resolve("scripts/research/route-concern-oracle.json");
  const oracleBytes = fs.readFileSync(oraclePath); // Opaque; no expected labels are parsed or sent to the model.
  const protocolPath = path.resolve("../docs/research/2026-10-28-route-concern-protocol.md");
  const protocolBytes = fs.readFileSync(protocolPath);
  const originalDbHash = hash(fs.readFileSync(sourceDb));
  const sourceFiles = ["manifest.json", "oracle-frozen.json", "cleanup.json", "run-complete.json", "finite-screening-direct-domain.json", "finite-screening-direct-stage-3.json", "finite-screening-direct-stage-3-reloaded.json"];
  const sourceHashes = Object.fromEntries(sourceFiles.map(file => [file, hash(fs.readFileSync(path.join(source, file)))]));
  const modules = ["scripts/research/route-concern-experiment.test.ts", "src/app/api/domains/[id]/map/reviews/route.ts",
    "src/lib/ai/tutorService.ts", "src/lib/ai/tutorPolicy.ts", "src/lib/ai/tasks.ts", "src/lib/ai/planningKnowledgeReview.ts", "src/lib/ai/courseRepairKnowledge.ts",
    "src/lib/ai/mapDraftRepair.ts", "src/lib/ai/planningReviewPolicy.ts", "src/lib/ai/openaiCompatibleProvider.ts", "src/lib/ai/provider.ts", "src/lib/ai/settingsService.ts",
    "src/lib/ai/generationEvidence.ts", "src/lib/ai/validationEvidence.ts", "src/lib/learning/courseDesignService.ts", "src/lib/learning/roadmapService.ts",
    "src/lib/learning/mapDraftReviewService.ts", "src/lib/learning/planningEvidence.ts", "src/lib/learning/planningRequestSnapshot.ts"];
  const moduleHashes = Object.fromEntries(modules.map(file => [file, hash(fs.readFileSync(path.resolve(file)))]));
  const settingsSource = process.env.ENGLISHNODE_RESEARCH_SETTINGS_SOURCE || path.join(process.env.LOCALAPPDATA || "", "Antigravity", "ai-settings.json");
  const settingsBytes = fs.readFileSync(settingsSource), configured = JSON.parse(settingsBytes.toString("utf8"));
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "englishnode-route-concern-")), temporarySettings = path.join(temporaryRoot, "ai-settings.json");
  const oldSettings = process.env.AI_SETTINGS_PATH, oldThinking = process.env.AI_ENABLE_THINKING, oldFetch = globalThis.fetch;
  const output = path.resolve("test-results", `route-concern-2026-10-28-${Date.now()}`);
  fs.mkdirSync(output, { recursive: true });
  const secrets = [configured.apiKey, process.env.ENGLISHNODE_LOCAL_API_TOKEN, process.env.AI_API_KEY, process.env.OPENAI_API_KEY, process.env.DASHSCOPE_API_KEY, process.env.QWEN_API_KEY, process.env.DEEPSEEK_API_KEY];
  let safe = evidenceSerializer(secrets);
  const write = (file: string, value: unknown) => fs.writeFileSync(path.join(output, file), safe.json(value) + "\n");
  let active: { id: string; calls: number; halted: string | null } | null = null, globalStop: string | null = null, totalRequests = 0;
  const outcomes: Record<string, unknown>[] = [], transports: Record<string, unknown>[] = [];
  try {
    fs.writeFileSync(temporarySettings, settingsBytes, { flag: "wx" });
    process.env.AI_SETTINGS_PATH = temporarySettings; process.env.AI_ENABLE_THINKING = "0";
    const { readOpenAiCompatibleConfig } = await import("../../src/lib/ai/openaiCompatibleProvider");
    const config = readOpenAiCompatibleConfig();
    safe = evidenceSerializer([...secrets, config.apiKey]);
    if (config.provider !== "deepseek" || config.model !== "deepseek-v4-flash" || config.model !== sourceManifest.requestedModel
      || config.temperature !== sourceManifest.requestedTemperature) throw new Error("Replay requires the frozen source provider/model/temperature and direct mode.");
    const origin = new URL(config.baseUrl).origin;
    const assertFrozen = () => {
      if (modules.some(file => hash(fs.readFileSync(path.resolve(file))) !== moduleHashes[file])
        || sourceFiles.some(file => hash(fs.readFileSync(path.join(source, file))) !== sourceHashes[file])
        || hash(fs.readFileSync(oraclePath)) !== hash(oracleBytes) || hash(fs.readFileSync(protocolPath)) !== hash(protocolBytes)
        || hash(fs.readFileSync(temporarySettings)) !== hash(settingsBytes) || JSON.stringify(readOpenAiCompatibleConfig()) !== JSON.stringify(config)
        || process.env.AI_ENABLE_THINKING !== "0") throw new Error("Frozen input, code, evidence or provider configuration changed.");
    };
    write("manifest.json", { date: new Date().toISOString(), sourceRun, sourceDatabaseSha256: originalDbHash, sourceHashes, moduleHashes,
      oracleSha256: hash(oracleBytes), protocolSha256: hash(protocolBytes), cases, casesSha256: hash(JSON.stringify(cases)),
      configuration: { ...config, apiKey: "[REDACTED]" }, thinking: false, maxProviderRequestsPerCase: perCaseLimit, maxProviderRequestsTotal: totalLimit,
      boundary: "Actual handler and production services against one independent copy of the closed research database per case. Only Prisma client selection is injected; no provider or validation mock. Historical candidate replay, not a newly generated end-to-end route or real learner data.",
      provenance: "Restore the exact saved AI candidate via the candidate writer, preserving real source/course-generation logs. Do not create success receipts, modify actual materials, or confirm a formal map.",
      interpretation: "One submission per simulated concern, no outer retries or no-feedback comparison; manual semantic review required. HTTP/report/persistence success is not correct teaching or user acceptance." });
    write("baseline.json", { domainId, courseLogId, draft: baseline, originalStageResponse: priorResponse });
    write("oracle-frozen-opaque.json", { sha256: hash(oracleBytes), originalUtf8: oracleBytes.toString("utf8"), parsedByHarness: false, includedInModelInput: false });
    globalThis.fetch = async (resource, init) => {
      const url = new URL(typeof resource === "string" ? resource : resource instanceof URL ? resource.href : resource.url);
      const method = (init?.method || (resource instanceof Request ? resource.method : "GET")).toUpperCase();
      const isProvider = method === "POST" && url.origin === origin && /\/(chat\/completions|responses)\/?$/.test(url.pathname);
      if (!isProvider) return oldFetch(resource, init);
      if (!active) throw new Error("Provider request outside an active case.");
      if (globalStop || active.halted) throw new Error(globalStop || active.halted!);
      assertFrozen();
      if (active.calls >= perCaseLimit || totalRequests >= totalLimit) {
        active.halted = "Research request budget reached; no further transport call.";
        throw new Error(active.halted);
      }
      const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
      if (!/\/chat\/completions\/?$/.test(url.pathname) || object(object(body)?.thinking)?.type !== "disabled") throw new Error("Unexpected provider endpoint or thinking mode in this review-only replay.");
      active.calls++; totalRequests++;
      const started = Date.now(), entry: Record<string, unknown> = { caseId: active.id, inCase: active.calls, index: totalRequests,
        at: new Date().toISOString(), endpoint: `${url.origin}${url.pathname}`, body, status: "pending" };
      transports.push(entry);
      write(`request-${String(totalRequests).padStart(2, "0")}.json`, entry);
      write("progress.json", { active, totalRequests, completedCases: outcomes.length });
      console.log(`${active.id}: provider request ${active.calls}/${perCaseLimit}, total ${totalRequests}/${totalLimit}`);
      try {
        const response = await oldFetch(resource, init);
        const raw = await response.clone().text();
        entry.httpStatus = response.status; entry.status = "response";
        try { entry.providerResponse = JSON.parse(raw); } catch { entry.rawResponse = raw; }
        if (!response.ok) {
          active.halted = `Provider HTTP ${response.status}; stop the case without further paid retries.`;
          if ([401, 403, 429].includes(response.status)) globalStop = active.halted;
        }
        return response;
      } catch (error) {
        active.halted = "Provider transport failed; stop this case without another transport call.";
        entry.status = "transport_error"; entry.error = error instanceof Error ? error.message : String(error);
        throw error;
      } finally {
        entry.elapsedMs = Date.now() - started;
        write(`request-${String(totalRequests).padStart(2, "0")}.json`, entry);
        write("transport-requests.json", transports);
      }
    };
    console.log(`Route concern replay: ${output}; no oracle labels enter model input.`);
    for (const test of cases) {
      assertFrozen();
      if (globalStop) break;
      if (hash(fs.readFileSync(sourceDb)) !== originalDbHash) throw new Error("Closed source database changed; refuse to copy a different baseline.");
      const database = path.join(output, `${test.id}-isolated.db`);
      fs.copyFileSync(sourceDb, database, fs.constants.COPYFILE_EXCL);
      const client = new PrismaClient({ datasources: { db: { url: `file:${database.replace(/\\/g, "/")}` } } });
      runtime.client = client;
      active = { id: test.id, calls: 0, halted: null };
      const started = Date.now(), outcome: Record<string, unknown> = { id: test.id, status: "running", simulatedConcern: true };
      try {
        const connected = await client.$queryRawUnsafe<{ name: string; file: string }[]>("PRAGMA database_list");
        expect(path.resolve(connected.find(row => row.name === "main")!.file).toLowerCase()).toBe(path.resolve(database).toLowerCase());
        const sourceDomain = await client.domain.findUniqueOrThrow({ where: { id: domainId } });
        if (sourceDomain.courseDesignAiCallLogId !== courseLogId || sourceDomain.mapRevision !== 0 || sourceDomain.courseDesignStatus !== "draft") throw new Error("Copied domain no longer has the original unconfirmed course binding.");
        const courseLog = await client.aiCallLog.findUniqueOrThrow({ where: { id: courseLogId } });
        if (courseLog.domainId !== domainId || courseLog.status !== "success" || courseLog.provider === "user" || !courseLog.rawOutput) throw new Error("Real original course-generation provenance is missing; never synthesize it.");
        const priorIds = priorResponse.aiCallLogIds as string[];
        if (!Array.isArray(priorIds) || !priorIds.length || await client.aiCallLog.count({ where: { id: { in: priorIds }, domainId } }) !== priorIds.length) throw new Error("Original Stage3 provenance is missing from this copied database.");
        const oldLogIds = (await client.aiCallLog.findMany({ where: { domainId }, select: { id: true } })).map(log => log.id);
        const { getRoadmapByDomain, saveRoadmapDraft } = await import("../../src/lib/learning/roadmapService");
        const { getCourseDesignState } = await import("../../src/lib/learning/courseDesignService");
        const current = await getRoadmapByDomain(domainId);
        const restored = await saveRoadmapDraft(domainId, baseline, courseLogId, { expectedCurrentDraft: current!.draft });
        if (planningKnowledgeDigest(restored.draft) !== planningKnowledgeDigest(baseline)) throw new Error("Restoration changed the historical candidate; do not silently canonically substitute another baseline.");
        const before = await getRoadmapByDomain(domainId), course = await getCourseDesignState(domainId);
        write(`${test.id}-before.json`, { sourceDomain, sourceCourseLog: courseLog, priorIds, roadmap: before, course,
          restoration: "Historical candidate replay through saveRoadmapDraft; no generated-success or review-passed log fabricated." });
        const { POST } = await import("../../src/app/api/domains/[id]/map/reviews/route");
        const payload = { scope: "stage", stageKey: test.stageKey, feedback: test.feedback };
        write(`${test.id}-input.json`, payload);
        const response = await POST(new Request(`http://127.0.0.1/api/domains/${domainId}/map/reviews`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }), { params: Promise.resolve({ id: domainId }) });
        const result = await response.json();
        const reloaded = await getRoadmapByDomain(domainId);
        const logs = await client.aiCallLog.findMany({ where: { domainId, id: { notIn: oldLogIds } }, orderBy: { createdAt: "asc" } });
        write(`${test.id}-response.json`, { httpStatus: response.status, response: result });
        write(`${test.id}-after.json`, { roadmap: reloaded, course: await getCourseDesignState(domainId), diff: changes(baseline, reloaded?.draft) });
        write(`${test.id}-logs.json`, logs);
        const finalDomain = await client.domain.findUniqueOrThrow({ where: { id: domainId } });
        expect(finalDomain.mapRevision).toBe(0); expect(finalDomain.roadmapStatus).not.toBe("confirmed");
        expect(finalDomain.courseDesignConfirmedAt).toBeNull(); expect(finalDomain.taskBriefConfirmedAt).toBeNull();
        expect(await client.learningNode.count({ where: { domainId } })).toBe(0); expect(await client.unit.count({ where: { domainId } })).toBe(0);
        for (const key of ["name", "goal", "scope", "excludedScope", "currentLevel", "description", "taskBrief", "entryGuideJson", "courseDesignDraft", "courseDesignAiCallLogId"] as const) expect(finalDomain[key]).toEqual(sourceDomain[key]);
        outcome.status = active.halted || !response.ok || result.error || result.reviewState !== "passed" || result.qualityReview?.availability !== "available" ? "stopped_or_unavailable" : "handler_completed_and_reloaded";
        outcome.httpStatus = response.status; outcome.reviewState = result.reviewState; outcome.knowledgeVerdict = result.qualityReport?.knowledgeReview?.verdict;
        outcome.newLogCount = logs.length; outcome.changed = planningKnowledgeDigest(baseline) !== planningKnowledgeDigest(reloaded?.draft);
        outcome.foreignKeyViolations = await client.$queryRawUnsafe("PRAGMA foreign_key_check"); expect(outcome.foreignKeyViolations).toEqual([]);
      } catch (error) {
        outcome.status = "stopped"; outcome.error = error instanceof Error ? error.message : String(error);
        write(`${test.id}-stopped-logs.json`, await client.aiCallLog.findMany({ where: { domainId }, orderBy: { createdAt: "asc" } }));
        write(`${test.id}-stopped-domain.json`, await client.domain.findUnique({ where: { id: domainId } }));
      } finally {
        outcome.providerRequests = active.calls; outcome.halted = active.halted; outcome.elapsedMs = Date.now() - started;
        outcomes.push(outcome); write("outcomes.json", outcomes);
        await client.$disconnect(); runtime.client = null; active = null;
      }
    }
    assertFrozen();
    write("run-complete.json", { scheduled: cases.length, completedCases: outcomes.length, totalRequests, outcomes, globalStop,
      semanticAcceptance: false, manualOracleReviewRequired: true, originalResearchDatabaseUnchanged: hash(fs.readFileSync(sourceDb)) === originalDbHash,
      realLearnerOutcomes: false, formalAcceptancePerformed: false, historicalCandidateReplay: true });
  } finally {
    globalThis.fetch = oldFetch;
    const cleanupErrors: string[] = [];
    try { await runtime.client?.$disconnect(); } catch (error) { cleanupErrors.push(String(error)); }
    runtime.client = null;
    if (oldSettings === undefined) delete process.env.AI_SETTINGS_PATH; else process.env.AI_SETTINGS_PATH = oldSettings;
    if (oldThinking === undefined) delete process.env.AI_ENABLE_THINKING; else process.env.AI_ENABLE_THINKING = oldThinking;
    try { if (fs.existsSync(temporarySettings)) fs.unlinkSync(temporarySettings); fs.rmdirSync(temporaryRoot); } catch (error) { cleanupErrors.push(String(error)); }
    const settingsUnchanged = hash(fs.readFileSync(settingsSource)) === hash(settingsBytes), sourceUnchanged = hash(fs.readFileSync(sourceDb)) === originalDbHash;
    write("cleanup.json", { temporarySettingsDeleted: !fs.existsSync(temporarySettings), originalSettingsUnchanged: settingsUnchanged,
      originalResearchDatabaseUnchanged: sourceUnchanged, environmentRestored: process.env.AI_SETTINGS_PATH === oldSettings && process.env.AI_ENABLE_THINKING === oldThinking,
      fetchRestored: globalThis.fetch === oldFetch, cleanupErrors, noProductDatabaseUsed: true });
    expect(settingsUnchanged).toBe(true); expect(sourceUnchanged).toBe(true); expect(cleanupErrors).toEqual([]);
  }
}, 5400000);
