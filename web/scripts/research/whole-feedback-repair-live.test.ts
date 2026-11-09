import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { createOpenAiCompatibleProvider } from "../../src/lib/ai/openaiCompatibleProvider";
import { evidenceSerializer } from "../../src/lib/ai/generationEvidence";
import { buildLearningFeedbackReviewPrompt, validateLearningFeedbackReview, type LearningFeedbackReviewInput } from "../../src/lib/learning/learningFeedbackReview";
import type { LearningReply } from "../../src/lib/learning/flexibleTeaching";

const hash = (value: string | Buffer) => createHash("sha256").update(value).digest("hex");
type Log = { requestMessagesJson: string; promptVersion: string; taskType: string };
const section = (prompt: string, label: string) => JSON.parse(prompt.split("\n").find(line => line.includes(label))!.split(label).at(-1)!);

it.skipIf(process.env.ENGLISHNODE_WHOLE_FEEDBACK_LIVE !== "1")("real review of preserved and deliberately corrupted whole replies", async () => {
  const origin = path.resolve("test-results/feedback-service-live-2026-10-28-1793178365861");
  const logs = JSON.parse(fs.readFileSync(path.join(origin, "ai-logs.json"), "utf8")) as Log[];
  const fromCase = (id: string): LearningFeedbackReviewInput => {
    const scenario = JSON.parse(fs.readFileSync(path.join(origin, `${id}.json`), "utf8"));
    const interactionId = scenario.storedInteractions[0].id;
    const log = logs.find(item => item.promptVersion === "learning-feedback-whole-reply-v1" && item.requestMessagesJson.includes(interactionId))!;
    const prompt = JSON.parse(log.requestMessagesJson).find((item: { role: string }) => item.role === "user").content;
    return { reply: section(prompt, "当前候选反馈（唯一可替换对象）："), context: section(prompt, "当次只读交互证据及真实范围："),
      sources: section(prompt, "实际资料片段："), kind: scenario.testCase.kind,
      actionContext: { targets: section(prompt, "实际可进入身份："), pendingPlans: section(prompt, "尚未准备的框架计划（仅供安排对照，不可作为 step 目标）："), nodeIds: section(prompt, "允许的实际节点：") } };
  };
  const correct = fromCase("correct-challenge"), open = fromCase("open-observation");
  const tests = [
    { id: "unchanged-correct", input: correct, expectedFirst: "no_error_found", expectedFinalVerdict: "correct" },
    { id: "only-verdict-wrong", input: { ...correct, reply: { ...correct.reply, verdict: "needs_work" } as LearningReply }, expectedFirst: "confirmed_error", expectedFinalVerdict: "correct" },
    { id: "only-observation-wrong", input: { ...correct, reply: { ...correct.reply, observation: "用户的原话明确声称复合函数恒为1，并坚持参考答案1是正确的。" } }, expectedFirst: "confirmed_error", expectedFinalVerdict: "correct" },
    { id: "only-uncertainty-wrong", input: { ...correct, reply: { ...correct.reply, uncertainty: "系统将这次回答保存为 assistance=2，也就是提交前已看参考解答。" } }, expectedFirst: "confirmed_error", expectedFinalVerdict: "correct" },
    { id: "optional-activity-control", input: open, expectedFirst: "no_error_found", expectedFinalVerdict: open.reply.verdict },
  ];
  const settingsSource = process.env.ENGLISHNODE_RESEARCH_SETTINGS_SOURCE || path.join(process.env.LOCALAPPDATA || "", "Antigravity", "ai-settings.json");
  const original = fs.readFileSync(settingsSource), config = JSON.parse(original.toString("utf8"));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "englishnode-whole-review-")), settings = path.join(root, "ai-settings.json");
  const previousSettings = process.env.AI_SETTINGS_PATH;
  const output = path.resolve("test-results", `whole-feedback-repair-2026-10-28-${Date.now()}`);
  fs.mkdirSync(output, { recursive: true });
  const safe = evidenceSerializer([config.apiKey, process.env.ENGLISHNODE_LOCAL_API_TOKEN]);
  const write = (name: string, value: unknown) => fs.writeFileSync(path.join(output, name), safe.json(value) + "\n");
  try {
    fs.writeFileSync(settings, original, { flag: "wx" }); process.env.AI_SETTINGS_PATH = settings;
    const provider = createOpenAiCompatibleProvider();
    write("manifest.json", { design: "Diagnostic component exercise: preserved real model replies from constructed service cases, plus researcher-injected single-field errors. Not naturally occurring model failures, not held-out or learner data.",
      model: provider.config.model, temperature: provider.config.temperature, sourceHash: hash(fs.readFileSync(path.resolve("src/lib/learning/learningFeedbackReview.ts"))),
      repetitions: 2, maxReviewCallsPerCase: 3, maxTokens: 6000, timeoutMs: 120000, tests });
    console.log(`Whole reply diagnostic: ${output}`);
    const outcomes: unknown[] = [];
    for (const test of tests) for (let repetition = 0; repetition < 2; repetition++) {
      let reply = structuredClone(test.input.reply), previousReview: unknown = null, finalStatus = "budget_exhausted";
      const calls: Record<string, unknown>[] = [];
      for (let attempt = 0; attempt < 3; attempt++) {
        const prompt = buildLearningFeedbackReviewPrompt({ ...test.input, reply, previousReview });
        const record: Record<string, unknown> = { attempt, prompt, candidate: structuredClone(reply) };
        const started = Date.now();
        try {
          const result = await provider.generateText({ taskType: "node_knowledge_check", messages: [{ role: "system", content: "独立核对完整教学反馈及当次证据。只返回约定JSON，不将参考或旧报告当成真值。" }, { role: "user", content: prompt }], responseFormat: "json_object", maxTokens: 6000, timeoutMs: 120000, requiresWebResearch: false });
          record.rawOutput = result.text; record.providerResponse = result.raw;
          const envelope = result.raw as { choices?: { finish_reason?: string }[] };
          if (envelope.choices?.some(choice => choice.finish_reason === "length")) throw new Error("truncated");
          const review = validateLearningFeedbackReview(JSON.parse(result.text), reply, test.input.actionContext, test.input.kind);
          record.review = review;
          if (review.verdict === "confirmed_error") { reply = review.replacement!; previousReview = review; }
          else finalStatus = review.verdict;
        } catch (error) { record.error = error instanceof Error ? error.message : String(error); finalStatus = "invalid_or_failed"; }
        record.elapsedMs = Date.now() - started; calls.push(record);
        if (finalStatus !== "budget_exhausted") break;
      }
      const first = (calls[0]?.review as { verdict?: string })?.verdict;
      const outcome = { id: test.id, repetition, expectedFirst: test.expectedFirst, firstVerdict: first, firstMatches: first === test.expectedFirst,
        finalStatus, finalReply: reply, finalVerdictMatches: reply.verdict === test.expectedFinalVerdict, calls };
      outcomes.push(outcome); write(`${test.id}-r${repetition}.json`, outcome);
      console.log(`${test.id} r${repetition}: first=${first || "failed"}, final=${finalStatus}, reply=${reply.verdict}, calls=${calls.length}`);
    }
    write("summary.json", { outcomes, semanticReview: "Pending independent reading of replacements; matching labels alone is not verification of all fields", productDatabaseUsed: false });
  } finally {
    if (previousSettings === undefined) delete process.env.AI_SETTINGS_PATH; else process.env.AI_SETTINGS_PATH = previousSettings;
    if (fs.existsSync(settings)) fs.unlinkSync(settings); fs.rmdirSync(root);
    const unchanged = hash(fs.readFileSync(settingsSource)) === hash(original);
    write("cleanup.json", { originalSettingsUnchanged: unchanged, temporarySettingsDeleted: !fs.existsSync(settings) });
    expect(unchanged).toBe(true);
  }
}, 1800000);
