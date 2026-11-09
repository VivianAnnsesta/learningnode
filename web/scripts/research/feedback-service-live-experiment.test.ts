/** Opt-in production-service exercise using constructed learner inputs and an isolated seed. */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import type { LearningFramework, LearningMaterial } from "../../src/lib/learning/flexibleTeaching";
import { evidenceSerializer } from "../../src/lib/ai/generationEvidence";

const hash = (data: string | Buffer) => createHash("sha256").update(data).digest("hex");
const cases = [
  { id: "correct-challenge", kind: "answer", focus: "按实际定义判断复合函数极限", prompt: "F(t)=1（t≠0），F(0)=2，g(x)=0。求 x→0 时 F(g(x)) 的极限。",
    reference: "极限为1，因为外层去心极限为1。", explanation: "当前参考曾按外层去心极限直接代入；参考可能有误，应核对原定义。",
    input: "我认为你的参考有误。g恒为0，所以每个x都得到F(g(x))=F(0)=2，极限也是2，不能用外层去心极限1代替。",
    expected: "承认用户推理正确和参考错误；给出复合恒2，不继续把用户判成needs_work或补不存在的困难。" },
  { id: "point-limit-confusion", kind: "answer", focus: "按实际定义判断复合函数极限", prompt: "F(t)=1（t≠0），F(0)=2，g(x)=x²。求 x→0 时 F(g(x)) 的极限。",
    reference: "极限为1。", explanation: "求极限时区分x趋于0与x等于0，按去心邻域中的值判断。",
    input: "x等于0时g也是0，所以F(g(0))=2，我认为极限就是2。",
    expected: "指出点值与极限混淆；x≠0时复合恒1，因此极限1；不沿用上一场景恒等内函数的条件。" },
  { id: "unit-conversion", kind: "answer", focus: "统一单位后计算长度", prompt: "一段绳子长2米，另一段长30厘米，接起来总长多少米？忽略连接损耗。",
    reference: "32米。", explanation: "先确认计量单位，再做数量相加；参考回应也须核对。",
    input: "30厘米等于0.3米，所以总长2.3米。参考把不同单位的数字直接相加，32米不成立。",
    expected: "支持用户2.3米及单位换算推理，纠正错误参考；不虚构用户算术困难。" },
  { id: "open-observation", kind: "question", focus: "公共空间观察中的证据与解释", prompt: "虚构观察：周一上午A广场记录12人停留，周日下午B广场记录16人停留；B有长椅，天气和人群不同。怎样解释？",
    reference: null, explanation: "记录能描述差异，是否由某个设施引起需要进一步比较。讨论没有唯一设计价值偏好。",
    input: "这两次记录相差4人，但我不能只凭这点确定长椅造成差异。天气和时段也不同。我想知道怎样补充观察，而不是先给长椅下结论。",
    expected: "忠实保留用户未作因果断言的立场，提供能减少混杂的具体后续观察，不批评用户已经断言因果。" }
] as const;

it.skipIf(process.env.ENGLISHNODE_FEEDBACK_SERVICE_LIVE !== "1")("real provider through feedback service, persistence and reload", async () => {
  const output = path.resolve("test-results", `feedback-service-live-2026-10-28-${Date.now()}`);
  fs.mkdirSync(output, { recursive: true });
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "englishnode-service-research-"));
  const settingsSource = process.env.ENGLISHNODE_RESEARCH_SETTINGS_SOURCE || path.join(process.env.LOCALAPPDATA || "", "Antigravity", "ai-settings.json");
  const originalSettings = fs.readFileSync(settingsSource);
  const temporarySettings = path.join(tempRoot, "ai-settings.json");
  const dbPath = path.join(output, "isolated-learning.db");
  const originalEnv = { DATABASE_URL: process.env.DATABASE_URL, AI_SETTINGS_PATH: process.env.AI_SETTINGS_PATH };
  let client: Awaited<typeof import("../../src/lib/prisma")>["prisma"] | undefined;
  const configured = JSON.parse(originalSettings.toString("utf8"));
  const safe = evidenceSerializer([configured.apiKey, process.env.ENGLISHNODE_LOCAL_API_TOKEN]);
  const write = (file: string, value: unknown) => fs.writeFileSync(path.join(output, file), safe.json(value) + "\n");
  try {
    fs.copyFileSync(path.resolve("prisma/seed.db"), dbPath, fs.constants.COPYFILE_EXCL);
    fs.writeFileSync(temporarySettings, originalSettings, { flag: "wx" });
    process.env.AI_SETTINGS_PATH = temporarySettings;
    process.env.DATABASE_URL = `file:${dbPath.replace(/\\/g, "/")}`;
    expect(process.env.DATABASE_URL).toContain("/test-results/feedback-service-live-");
    const service = await import("../../src/lib/learning/learningSessionService");
    client = (await import("../../src/lib/prisma")).prisma;
    const connected = await client.$queryRawUnsafe<{ name: string; file: string }[]>("PRAGMA database_list");
    expect(path.resolve(connected.find(item => item.name === "main")!.file).toLowerCase()).toBe(path.resolve(dbPath).toLowerCase());
    expect(await client.nodeTeachingSession.count()).toBe(0);
    const codePaths = ["learningSessionService.ts", "learningInteractionEvidence.ts", "learningFeedbackReview.ts"];
    write("manifest.json", { date: new Date().toISOString(), design: "Constructed scenarios; real provider, actual service and isolated SQLite. No real learner or formal map.",
      provider: configured.provider, configuredModel: configured.model, temperature: configured.temperature, cases,
      sourceHashes: Object.fromEntries(codePaths.map(file => [file, hash(fs.readFileSync(path.resolve("src/lib/learning", file)))])),
      originalSettingsHash: hash(originalSettings), assessment: "Semantic results require inspecting persisted complete replies and review logs; script assertions check isolation and reload only." });
    console.log(`Live service experiment: ${output}`);
    for (const testCase of cases) {
      let session = (await service.createLearningSession({ requestId: `research-create-${testCase.id}`, question: testCase.focus })).session;
      const framework: LearningFramework = { schemaVersion: 4, title: testCase.focus, purpose: "根据当前问题解释", scope: testCase.focus,
        mainIdea: testCase.explanation, prerequisites: [], limitations: ["研究者构造的诊断输入，不是真实学习者数据。"],
        segments: [{ key: "part", title: "当前问题", goal: testCase.focus, steps: [{ key: "step", goal: testCase.focus, requiredOutput: "none" }] }] };
      const material: LearningMaterial = { schemaVersion: 4, title: testCase.focus, summary: testCase.explanation, limitations: ["研究夹具参考可有意含错，用于检验用户正确质疑。"],
        steps: [{ key: "step", goal: testCase.focus, explanation: testCase.explanation, example: "", basis: "unverified", sourceIds: [],
          activities: [{ key: "activity", kind: testCase.kind === "answer" ? "question" : "discussion", prompt: testCase.prompt, answer: testCase.reference,
            criteria: ["按本题给定条件独立判断，参考不能替代推导。"], hints: [], required: false }] }] };
      await client.nodeTeachingSession.update({ where: { id: session.id }, data: { lessonJson: JSON.stringify(framework), status: "ready", lessonVersion: 1 } });
      const segment = await client.teachingSegment.create({ data: { sessionId: session.id, key: "l1--part", requestId: `research-material-${testCase.id}`,
        status: "ready", version: 1, sourceRevision: 0, sourceSnapshotJson: "[]", materialJson: JSON.stringify(material), reviewJson: JSON.stringify({ researchFixture: true }) } });
      session = (await service.getLearningSession(session.id)).session;
      const submitted = await service.submitLearningInteraction(session.id, { requestId: `research-input-${testCase.id}`, revision: session.revision,
        kind: testCase.kind, input: testCase.input, segmentId: segment.id, stepKey: "step", exerciseKey: "activity", materialVersion: 1 });
      const reloaded = await service.getLearningSession(session.id);
      const interaction = reloaded.session.interactions.find(item => item.requestId === `research-input-${testCase.id}`);
      expect(interaction?.input).toBe(testCase.input);
      expect(interaction?.response).toEqual(submitted.session.interactions.find(item => item.id === interaction?.id)?.response);
      write(`${testCase.id}.json`, { testCase, session: reloaded.session,
        storedInteractions: await client.teachingInteraction.findMany({ where: { sessionId: session.id } }),
        storedSegments: await client.teachingSegment.findMany({ where: { sessionId: session.id } }) });
      write("ai-logs.json", await client.aiCallLog.findMany({ orderBy: { createdAt: "asc" } }));
      console.log(`${testCase.id}: ${interaction?.status}, verdict=${interaction?.response?.verdict}; ${interaction?.error || "saved and reloaded"}`);
    }
    const violations = await client.$queryRawUnsafe("PRAGMA foreign_key_check");
    expect(violations).toEqual([]);
    write("run-complete.json", { completed: true, scenarios: cases.length, aiCalls: await client.aiCallLog.count(), foreignKeyViolations: violations,
      semanticAcceptance: "Pending inspection of actual output; not inferred from script completion", realLearnerOutcomes: false });
  } finally {
    await client?.$disconnect();
    for (const [key, value] of Object.entries(originalEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
    if (fs.existsSync(temporarySettings)) fs.unlinkSync(temporarySettings);
    fs.rmdirSync(tempRoot);
    const settingsUnchanged = hash(fs.readFileSync(settingsSource)) === hash(originalSettings);
    write("cleanup.json", { temporarySettingsDeleted: !fs.existsSync(temporarySettings), originalSettingsUnchanged: settingsUnchanged, database: "isolated seed retained with experiment evidence" });
    expect(settingsUnchanged).toBe(true);
  }
}, 1800000);
