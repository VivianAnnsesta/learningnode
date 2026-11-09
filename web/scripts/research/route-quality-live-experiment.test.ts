/** Opt-in: actual planning handlers, isolated seed, synthetic research goals, no formal acceptance. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { evidenceSerializer } from "../../src/lib/ai/generationEvidence";

const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
const object = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const requestsPerRun = 24;
const requestsTotal = 96;
function requireAvailableCandidate(value: unknown, httpStatus: number, phase: string) {
  const payload = object(value), quality = object(payload?.qualityReport), receipt = object(payload?.qualityReview);
  if (httpStatus < 200 || httpStatus >= 300 || !payload || payload.error || payload.reviewState !== "passed"
    || payload.reviewAvailability === "unavailable" || receipt?.availability !== "available" || !quality
    || quality.status === "blocked" || object(quality.knowledgeReview)?.verdict === "confirmed_error") {
    throw new Error(`${phase} stopped at actual response gate: HTTP ${httpStatus}; state=${String(payload?.reviewState || "missing")}; availability=${String(payload?.reviewAvailability || receipt?.availability || "missing")}; ${String(payload?.error || quality?.summary || "No available reviewed candidate.")}`);
  }
}
function candidateStages(draft: unknown): { key: string; status: unknown }[] {
  const stages = object(draft)?.stages;
  if (!Array.isArray(stages) || !stages.length) throw new Error("Saved candidate has no stages.");
  const result = stages.map(stage => {
    const value = object(stage);
    if (typeof value?.key !== "string" || !value.key.trim()) throw new Error("Saved Stage key is missing.");
    return { key: value.key, status: value.status };
  });
  if (new Set(result.map(stage => stage.key)).size !== result.length) throw new Error("Saved Stage keys are not unique.");
  return result;
}
const scenarios = [
  {
    id: "finite-screening",
    name: "有限筛查表中的条件概率",
    goal: "学会从有限产品筛查表正确读取条件概率，区分两个条件方向，并解释筛查结果。我会分数、百分数和集合交并，但没学过概率。希望能先操作具体表格再概括；贝叶斯公式的代数推导只是选学，不应成为理解筛查例子的必经前置。",
    currentLevel: "学习者自述会分数、百分数和集合交并，未学过概率；未进行能力测验。",
    scope: "有限计数表、条件方向、基准比例与筛查结果；一段可完整学完的主题路线。",
    excludedScope: "连续分布、测度论、显著性检验；不把贝叶斯公式代数推导列为主线必需。",
    materials: "研究者提供的有限例子，数字为构造数据，不是实测产品质量：200个零件中20个有缺陷，其中16个被标记、4个未被标记；180个无缺陷，其中36个被标记、144个未被标记。被标记总数52，未被标记148。条件为‘已被标记’时分母为52，缺陷比例16/52=4/13；条件为‘有缺陷’时被标记比例16/20=4/5。两个条件方向不同，不能互换。可以用分组计数说明，无须先推导一般公式。这些数字与范围是输入材料，具体路线由AI规划。",
    feedback: "请保留我声明的基础；公式推导可选。不要把选学内容变成必学前置。"
  },
  {
    id: "python-list-sharing",
    name: "Python列表的引用与拷贝",
    goal: "我已会变量赋值、列表下标和简单for循环，想正确预测列表赋值、浅拷贝及嵌套列表修改的结果，并能解释共享发生在哪一层。深入deepcopy是选学，不应为了预测这些小例子先要求掌握类设计或内存管理。",
    currentLevel: "学习者自述会变量、列表下标、简单for循环；未进行能力测验。",
    scope: "普通Python内置list的绑定、浅拷贝、嵌套共享、修改元素与重新绑定的区别。",
    excludedScope: "自定义类拷贝协议、引用计数、垃圾回收实现；deepcopy细节只作选学。",
    materials: "研究者依据Python官方文档整理的说明，非逐字引文：https://docs.python.org/3/library/copy.html 。赋值把名字绑定到对象，不创建对象副本。普通列表的浅拷贝创建新的外层列表，并保留对原来元素的引用；嵌套可变对象因此仍可能共享。具体代码：a=[[1],[2]]; b=a.copy(); b[0].append(9)之后a与b都是[[1,9],[2]]；随后b[1]=[7]只替换b的第二个元素，此时a是[[1,9],[2]]，b是[[1,9],[7]]。独立的新例子a=[1,2]; b=a; b.append(3)使二者均为[1,2,3]。不要把内层共享等同于外层对象相同。具体路线和教学任务由AI规划。",
    feedback: "先满足预测和解释实际代码的目标，深拷贝保持选学；相关概念可合讲，不要求每个术语单独节点。"
  }
] as const;

it.skipIf(process.env.ENGLISHNODE_ROUTE_QUALITY_LIVE !== "1")("complete candidate routes through actual services under two runtime modes", async () => {
  if (process.env.AI_EXTRA_BODY_JSON) throw new Error("Remove the extra request body before this controlled runtime comparison.");
  const output = path.resolve("test-results", `route-quality-live-2026-10-28-${Date.now()}`);
  fs.mkdirSync(output, { recursive: true });
  const settingsSource = process.env.ENGLISHNODE_RESEARCH_SETTINGS_SOURCE || path.join(process.env.LOCALAPPDATA || "", "Antigravity", "ai-settings.json");
  const originalSettings = fs.readFileSync(settingsSource);
  const originalEnv = { DATABASE_URL: process.env.DATABASE_URL, AI_SETTINGS_PATH: process.env.AI_SETTINGS_PATH, AI_ENABLE_THINKING: process.env.AI_ENABLE_THINKING };
  const configured = JSON.parse(originalSettings.toString("utf8"));
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "englishnode-route-research-"));
  const temporarySettings = path.join(temporaryRoot, "ai-settings.json");
  const secrets = [configured.apiKey, process.env.ENGLISHNODE_LOCAL_API_TOKEN, process.env.AI_API_KEY,
    process.env.OPENAI_API_KEY, process.env.DASHSCOPE_API_KEY, process.env.QWEN_API_KEY, process.env.DEEPSEEK_API_KEY];
  let safe = evidenceSerializer(secrets);
  const write = (file: string, data: unknown) => fs.writeFileSync(path.join(output, file), safe.json(data) + "\n");
  const databasePath = path.join(output, "isolated-planning.db");
  const originalFetch = globalThis.fetch;
  let client: Awaited<typeof import("../../src/lib/prisma")>["prisma"] | undefined;
  let activeRun: { id: string; phase: string; calls: number; halted?: string } | undefined;
  const outcomes: Record<string, unknown>[] = [];
  let providerOrigin = "";
  let totalProviderRequests = 0;
  let assertFrozenSources: (() => void) | undefined;
  const transports: Record<string, unknown>[] = [];
  try {
    if ((globalThis as { prisma?: unknown }).prisma) throw new Error("Run this opt-in file in a fresh dedicated process; an existing Prisma client could target another database.");
    fs.copyFileSync(path.resolve("prisma/seed.db"), databasePath, fs.constants.COPYFILE_EXCL);
    fs.writeFileSync(temporarySettings, originalSettings, { flag: "wx" });
    process.env.AI_SETTINGS_PATH = temporarySettings;
    process.env.DATABASE_URL = `file:${databasePath.replace(/\\/g, "/")}`;
    const { readOpenAiCompatibleConfig } = await import("../../src/lib/ai/openaiCompatibleProvider");
    const providerConfig = readOpenAiCompatibleConfig();
    safe = evidenceSerializer([...secrets, providerConfig.apiKey]);
    if (providerConfig.provider !== "deepseek" || !providerConfig.model.toLowerCase().startsWith("deepseek-v4")) throw new Error("This runtime comparison requires the supported DeepSeek v4 thinking-toggle path.");
    providerOrigin = new URL(providerConfig.baseUrl).origin;
    const { createLearningDomain } = await import("../../src/lib/learning/domainService");
    const { getCourseDesignState } = await import("../../src/lib/learning/courseDesignService");
    const { getRoadmapByDomain } = await import("../../src/lib/learning/roadmapService");
    const planningRoute = await import("../../src/app/api/domains/[id]/planning/route");
    const aiDraftRoute = await import("../../src/app/api/domains/[id]/map/ai-draft/route");
    client = (await import("../../src/lib/prisma")).prisma;
    const connected = await client.$queryRawUnsafe<{ name: string; file: string }[]>("PRAGMA database_list");
    expect(path.resolve(connected.find(item => item.name === "main")!.file).toLowerCase()).toBe(path.resolve(databasePath).toLowerCase());
    expect(await client.domain.count()).toBe(0);
    const oraclePath = path.resolve("scripts/research/route-quality-oracle.json");
    const oracleBytes = fs.readFileSync(oraclePath);
    const modulePaths = ["scripts/research/route-quality-live-experiment.test.ts", "scripts/research/route-quality-oracle.json", "src/lib/prisma.ts", "prisma/seed.db",
      "src/lib/ai/tutorService.ts", "src/lib/ai/tutorPolicy.ts", "src/lib/ai/tasks.ts", "src/lib/ai/planningKnowledgeReview.ts",
      "src/lib/ai/openaiCompatibleProvider.ts", "src/lib/ai/provider.ts", "src/lib/ai/settingsService.ts", "src/lib/ai/generationEvidence.ts",
      "src/lib/ai/validationEvidence.ts", "src/lib/ai/roadmapPlanningQuality.ts", "src/lib/ai/courseRepairKnowledge.ts", "src/lib/learning/courseDesignService.ts",
      "src/lib/learning/domainService.ts", "src/lib/learning/roadmapService.ts", "src/lib/learning/mapDraftReviewService.ts",
      "src/lib/learning/planningEvidence.ts", "src/lib/learning/planningRequestSnapshot.ts", "src/lib/learning/nodeTeachingRoute.ts",
      "src/app/api/domains/[id]/planning/route.ts", "src/app/api/domains/[id]/map/ai-draft/route.ts"];
    const sourceHashes = Object.fromEntries(modulePaths.map(file => [file, hash(fs.readFileSync(path.resolve(file)))]));
    assertFrozenSources = () => {
      if (modulePaths.some(file => hash(fs.readFileSync(path.resolve(file))) !== sourceHashes[file])) throw new Error("Frozen source or seed changed during experiment; stop without mixing versions.");
      if (hash(fs.readFileSync(temporarySettings)) !== hash(originalSettings)) throw new Error("Temporary provider settings changed during experiment.");
      if (JSON.stringify(readOpenAiCompatibleConfig()) !== JSON.stringify(providerConfig)) throw new Error("Effective provider configuration changed during experiment.");
    };
    const schedule = scenarios.flatMap((scenario, index) => (index % 2 ? [true, false] : [false, true]).map(thinking => ({ scenario, thinking })));
    write("manifest.json", {
      date: new Date().toISOString(), provider: providerConfig.provider, requestedModel: providerConfig.model,
      requestedTemperature: providerConfig.temperature, scenarios, schedule: schedule.map(item => ({ id: item.scenario.id, thinking: item.thinking })),
      sourceHashes, scenarioHash: hash(JSON.stringify(scenarios)), oracleSha256: hash(oracleBytes), oracleUsedInModelInput: false,
      maxProviderRequestsPerRun: requestsPerRun, maxProviderRequestsTotal: requestsTotal, originalSettingsHash: hash(originalSettings),
      effectiveProviderConfiguration: { ...providerConfig, apiKey: "[REDACTED]" },
      scope: "Actual handlers called in-process against isolated seed. Synthetic researcher-authored goals/materials. All generated Stage candidates attempted unless an actual gate or bounded research cap stops that run. No formal user confirmation, map writes, UI or learner outcomes.",
      comparisonLimits: "Four independent generated routes, one per domain/mode; outputs are not identical paired candidates. Thinking mode ignores temperature. Production time/token budgets unchanged. DeepSeek /responses web-research calls do not encode AI_ENABLE_THINKING in this provider; actual request modes are logged, so these are runtime-policy arms, not a claim that every call switches mode. The request cap is an experiment budget, not a new production gate.",
      sourceNote: "Python material is researcher paraphrase checked against official copy documentation and finite runtime examples; network source retrieval is separately recorded by the actual service. Finite-screening material is explicitly constructed, with arithmetic checked separately."
    });
    fs.copyFileSync(oraclePath, path.join(output, "oracle-frozen.json"), fs.constants.COPYFILE_EXCL);
    globalThis.fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      const method = (init?.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
      const isProvider = url.origin === providerOrigin && method === "POST" && /\/(chat\/completions|responses)\/?$/.test(url.pathname);
      if (isProvider) {
        if (!activeRun) throw new Error("Provider request outside an active research run.");
        if (activeRun.halted) throw new Error(activeRun.halted);
        try { assertFrozenSources!(); } catch (error) { activeRun.halted = "Frozen experiment configuration changed; no more provider requests."; throw error; }
        if (activeRun.calls >= requestsPerRun || totalProviderRequests >= requestsTotal) { activeRun.halted = "Research request budget reached; retain partial route without claiming completion."; throw new Error(activeRun.halted); }
        const requestBody = typeof init?.body === "string" ? JSON.parse(init.body) : null;
        if (/\/chat\/completions\/?$/.test(url.pathname) && object(object(requestBody)?.thinking)?.type !== (process.env.AI_ENABLE_THINKING === "1" ? "enabled" : "disabled")) throw new Error("Actual chat-completion request did not encode the requested thinking mode.");
        activeRun.calls += 1;
        totalProviderRequests += 1;
        transports.push({ runId: activeRun.id, phase: activeRun.phase, requestInRun: activeRun.calls, totalProviderRequests,
          at: new Date().toISOString(), endpoint: `${url.origin}${url.pathname}`, requestBody,
          thinkingRequested: process.env.AI_ENABLE_THINKING === "1", thinkingEncoded: object(requestBody)?.thinking ?? null });
        write("transport-requests.json", transports);
        write("progress.json", { ...activeRun, totalProviderRequests, completedRuns: outcomes.length, at: new Date().toISOString() });
        console.log(`${activeRun.id}: ${activeRun.phase}, provider request ${activeRun.calls}/${requestsPerRun}`);
      }
      const response = await originalFetch(input, init);
      if (isProvider && activeRun) {
        transports[transports.length - 1].httpStatus = response.status;
        write("transport-requests.json", transports);
        if ([401, 403, 429].includes(response.status)) activeRun.halted = `Provider HTTP ${response.status}; stop this research run without repeated paid calls.`;
      }
      return response;
    };
    console.log(`Route quality experiment: ${output}`);
    for (const job of schedule) {
      const runId = `${job.scenario.id}-${job.thinking ? "thinking" : "direct"}`;
      activeRun = { id: runId, phase: "create", calls: 0 };
      process.env.AI_ENABLE_THINKING = job.thinking ? "1" : "0";
      const started = Date.now();
      const outcome: Record<string, unknown> = { id: runId, thinking: job.thinking, stages: [], status: "running" };
      let domainId: string | undefined;
      const checkpoint = async (phase: string, payload: unknown) => {
        write(`${runId}-${phase}.json`, payload);
        if (domainId) {
          write(`${runId}-logs.json`, await client!.aiCallLog.findMany({ where: { OR: [{ domainId }, { canvasId: domainId }] }, orderBy: { createdAt: "asc" } }));
          write(`${runId}-domain.json`, await client!.domain.findUnique({ where: { id: domainId } }));
        }
      };
      const canStartPhase = () => {
        assertFrozenSources!();
        if (activeRun!.halted) throw new Error(activeRun!.halted);
        if (activeRun!.calls >= requestsPerRun || totalProviderRequests >= requestsTotal) {
          activeRun!.halted = "Research request budget reached; retain partial route without claiming completion.";
          throw new Error(activeRun!.halted);
        }
      };
      try {
        canStartPhase();
        const { id: scenarioId, materials, feedback, ...domainInput } = job.scenario;
        const domain = await createLearningDomain({ ...domainInput, description: `Synthetic researcher-authored scenario ${scenarioId}; not a real learner statement or confirmed user goal.`, planningInput: { materials, feedback } });
        domainId = domain.id;
        outcome.domainId = domainId;
        const context = { params: Promise.resolve({ id: domainId }) };
        activeRun.phase = "planning";
        const planningResponse = await planningRoute.POST(new Request(`http://127.0.0.1/api/domains/${domainId}/planning`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }), context);
        const planned = await planningResponse.json();
        await checkpoint("planning", { httpStatus: planningResponse.status, response: planned });
        requireAvailableCandidate(planned, planningResponse.status, "Planning");
        if (activeRun.halted) throw new Error(activeRun.halted);
        let roadmap = await getRoadmapByDomain(domainId);
        if (!roadmap?.draft || !roadmap.draft.stages?.length) throw new Error("Planning did not save a real candidate skeleton.");
        const plannedKeys = candidateStages(roadmap.draft).map(stage => stage.key);
        outcome.plannedStages = plannedKeys;
        for (const [index, stageKey] of plannedKeys.entries()) {
          canStartPhase();
          activeRun.phase = `stage-${index + 1}-${stageKey}`;
          const course = await getCourseDesignState(domainId);
          roadmap = await getRoadmapByDomain(domainId);
          if (!roadmap?.draft || !course.draft || !course.aiCallLogId) throw new Error("Lost saved course or candidate binding.");
          if (JSON.stringify(candidateStages(roadmap.draft).map(stage => stage.key)) !== JSON.stringify(plannedKeys)) throw new Error("Saved Stage set changed; cannot silently omit or invent stages in this run.");
          const response = await aiDraftRoute.POST(new Request(`http://127.0.0.1/api/domains/${domainId}/map/ai-draft`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ step: "stage", stageKey, baseRevision: roadmap.mapRevision, courseDesign: course.draft, courseDesignAiCallLogId: course.aiCallLogId }) }), context);
          const payload = await response.json();
          await checkpoint(`stage-${index + 1}`, { stageKey, httpStatus: response.status, response: payload });
          (outcome.stages as unknown[]).push({ stageKey, httpStatus: response.status, reviewState: payload.reviewState, knowledgeVerdict: payload.qualityReport?.knowledgeReview?.verdict });
          requireAvailableCandidate(payload, response.status, `Stage ${stageKey}`);
          if (activeRun.halted) throw new Error(activeRun.halted);
          const reloaded = await getRoadmapByDomain(domainId);
          if (candidateStages(reloaded?.draft).find(stage => stage.key === stageKey)?.status !== "expanded") throw new Error(`Stage ${stageKey} did not persist as expanded.`);
          await checkpoint(`stage-${index + 1}-reloaded`, { stageKey, roadmap: reloaded });
        }
        roadmap = await getRoadmapByDomain(domainId);
        expect(candidateStages(roadmap?.draft).map(stage => stage.key)).toEqual(plannedKeys);
        expect(candidateStages(roadmap?.draft).every(stage => stage.status === "expanded")).toBe(true);
        assertFrozenSources!();
        outcome.status = "all-candidates-generated-and-reloaded";
        await checkpoint("final", { roadmap, course: await getCourseDesignState(domainId), semanticAcceptance: "Requires independent review of actual generated route, tasks, prerequisites and optional boundaries." });
      } catch (error) {
        outcome.status = "stopped";
        outcome.error = error instanceof Error ? error.message : String(error);
        await checkpoint("stopped", { error: outcome.error });
      }
      outcome.providerRequests = activeRun.calls;
      outcome.elapsedMs = Date.now() - started;
      outcome.halted = activeRun.halted || null;
      if (domainId) {
        outcome.formalNodes = await client.learningNode.count({ where: { domainId } });
        expect(outcome.formalNodes).toBe(0);
        const savedDomain = await client.domain.findUniqueOrThrow({ where: { id: domainId } });
        expect(savedDomain.mapRevision).toBe(0);
        expect(savedDomain.roadmapStatus).not.toBe("confirmed");
        expect(savedDomain.courseDesignConfirmedAt).toBeNull();
        expect(savedDomain.taskBriefConfirmedAt).toBeNull();
        expect(await client.unit.count({ where: { domainId } })).toBe(0);
      }
      outcomes.push(outcome);
      write("outcomes.json", outcomes);
      console.log(`${runId}: ${outcome.status}; ${outcome.providerRequests} requests; ${outcome.elapsedMs}ms`);
      if (activeRun.halted?.startsWith("Provider HTTP")) break;
    }
    assertFrozenSources();
    const foreignKeyViolations = await client.$queryRawUnsafe("PRAGMA foreign_key_check");
    write("run-complete.json", { completed: outcomes.length === schedule.length, allCandidateRoutesGenerated: outcomes.length === schedule.length && outcomes.every(outcome => outcome.status === "all-candidates-generated-and-reloaded"),
      outcomes, totalProviderRequests, maxProviderRequestsTotal: requestsTotal, aiCalls: await client.aiCallLog.count(), foreignKeyViolations,
      frozenSourcesUnchanged: true, semanticAcceptance: false, realLearnerOutcomes: false, formalAcceptancePerformed: false });
    expect(foreignKeyViolations).toEqual([]);
  } finally {
    globalThis.fetch = originalFetch;
    const cleanupErrors: string[] = [];
    try { await client?.$disconnect(); } catch (error) { cleanupErrors.push(error instanceof Error ? error.message : String(error)); }
    for (const [key, value] of Object.entries(originalEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    try { if (fs.existsSync(temporarySettings)) fs.unlinkSync(temporarySettings); fs.rmdirSync(temporaryRoot); }
    catch (error) { cleanupErrors.push(error instanceof Error ? error.message : String(error)); }
    const settingsUnchanged = hash(fs.readFileSync(settingsSource)) === hash(originalSettings);
    write("cleanup.json", { temporarySettingsDeleted: !fs.existsSync(temporarySettings), temporaryDirectoryDeleted: !fs.existsSync(temporaryRoot), originalSettingsUnchanged: settingsUnchanged,
      environmentRestored: Object.entries(originalEnv).every(([key, value]) => process.env[key] === value), fetchRestored: globalThis.fetch === originalFetch,
      cleanupErrors, database: "isolated seed retained with original AI evidence" });
    expect(settingsUnchanged).toBe(true);
    expect(cleanupErrors).toEqual([]);
  }
}, 5400000);
