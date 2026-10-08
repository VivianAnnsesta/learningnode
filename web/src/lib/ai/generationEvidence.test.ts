import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runJsonTask } from "./tutorService";
import { AiTaskValidationError, validateRoadmapSkeletonDraft } from "./tasks";
import { AiProviderError } from "./provider";
import { AiLogPersistenceError } from "./generationEvidence";
import { aiFailureReference } from "./validationEvidence";

const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), generateText: vi.fn() }));
vi.mock("../prisma", () => ({ prisma: { aiCallLog: { create: mocks.create, update: mocks.update } } }));
vi.mock("./openaiCompatibleProvider", () => ({
  readOpenAiCompatibleConfig: () => ({ provider: "deepseek", model: "fixture", apiKey: "private-provider-key" }),
  createOpenAiCompatibleProvider: (config: unknown) => ({ config, generateText: mocks.generateText })
}));

describe("retained AI generation evidence", () => {
  let records: Record<string, Record<string, unknown>>;
  const task = (overrides = {}) => ({
    domainId: "domain-1", taskType: "roadmap_skeleton_generation" as const,
    userPrompt: "Plan a calculus course.", inputSummary: "Calculus", promptVersion: "fixture-v1",
    validate: (value: unknown) => value, ...overrides
  });
  const response = (text: string) => ({ text, raw: { id: "response-1", choices: [{ message: { content: text } }] }, providerRequestId: "response-1" });

  beforeEach(() => {
    vi.resetAllMocks();
    records = {};
    mocks.create.mockImplementation(async ({ data }) => {
      const id = `log-${Object.keys(records).length + 1}`;
      records[id] = { id, ...data };
      return records[id];
    });
    mocks.update.mockImplementation(async ({ where, data }) => {
      Object.assign(records[where.id], data);
      return { ...records[where.id] };
    });
  });
  afterEach(() => vi.unstubAllEnvs());

  it("retains full original text before validation and separates the normalized output", async () => {
    const raw = JSON.stringify({ explanation: "微积分".repeat(1800), extra: "unchanged evidence" });
    mocks.generateText.mockImplementation(async () => {
      expect(records["log-1"].status).toBe("pending");
      return response(raw);
    });
    const result = await runJsonTask(task({ validate: () => {
      expect(records["log-1"].rawOutput).toBe(raw);
      expect(JSON.parse(String(records["log-1"].parsedOutputJson))).toHaveProperty("extra");
      return { explanation: "Normalized short result" };
    } }));
    expect(result.log).toMatchObject({ status: "success", attempt: 1, providerRequestId: "response-1", rawOutput: raw });
    expect(JSON.parse(String(result.log.validatedOutputJson))).toEqual(result.data);
    expect(result.log.finishedAt).toBeInstanceOf(Date);
  });

  it("keeps the failed candidate and passes its precise defects to a bounded repair", async () => {
    const invalid = '{"goalKeys":["wrong-goal"],"explanation":"keep this content"}';
    mocks.generateText.mockResolvedValueOnce(response(invalid)).mockResolvedValueOnce(response('{"goalKeys":["limit-goal"]}'));
    const issue = { code: "invalid_module_goals", path: "stages[0].moduleBlueprints[1].goalKeys", stageKey: "limits", moduleKey: "limit-definition", message: "模块需要关联所属阶段的目标。", actualGoalKeys: ["wrong-goal"], allowedGoalKeys: ["limit-goal"] };
    const result = await runJsonTask(task({ validate: (value: { goalKeys: string[] }) => {
      if (value.goalKeys[0] !== "limit-goal") throw new AiTaskValidationError(issue.message, [issue]);
      return value;
    } }));
    expect(records["log-1"]).toMatchObject({ rawOutput: invalid, status: "failed", failureStage: "validation" });
    expect(JSON.parse(String(records["log-1"].validationIssuesJson))).toEqual([issue]);
    expect(records["log-2"]).toMatchObject({ status: "success", attempt: 2, retryOfLogId: "log-1", retryReason: "validation", runId: records["log-1"].runId });
    const repairPrompt = mocks.generateText.mock.calls[1][0].messages[1].content;
    expect(repairPrompt).toContain("keep this content");
    expect(repairPrompt).toContain(issue.path);
    expect(repairPrompt).toContain("wrong-goal");
    expect(repairPrompt).toContain("limit-goal");
    expect(result.aiCallLogIds).toEqual(["log-1", "log-2"]);
  });

  it("preserves both failed attempts when repair also fails, without infinite regeneration", async () => {
    mocks.generateText.mockResolvedValue(response('{"bad":true}'));
    const error = await runJsonTask(task({ validate: () => { throw new AiTaskValidationError("Invalid goal references"); } })).catch(error => error);
    expect(mocks.generateText).toHaveBeenCalledTimes(2);
    expect(Object.values(records).every(record => record.status === "failed" && record.rawOutput)).toBe(true);
    expect(aiFailureReference(error)).toMatchObject({ aiCallLogId: "log-2", aiCallLogIds: ["log-1", "log-2"] });
  });

  it("logs a Stage-only repair response separately from the full merged skeleton", async () => {
    const learningGoals=[{key:"goal-1",description:"解释变化。",contentQuestions:[
      {key:"cq-limit",question:"极限表达什么？",contentRequirements:["给出含义及示例。"],dimensionKeys:["definition"]},
      {key:"cq-derivative",question:"导数表达什么？",contentRequirements:["说明变化率及条件。"],dimensionKeys:["definition"]}
    ]}];
    const stages=["limit","derivative"].map(key=>({
      key,title:key,goal:"说明概念与条件。",coreTopics:[key],prerequisiteStageKeys:[],
      problem:{question:"如何描述变化？",steps:["说明条件"]},
      moduleBlueprints:[{key:`m-${key}`,title:key,goal:"解释本概念。",keyQuestions:[{key:`q-${key}`,contentQuestionKey:`cq-${key}`}]}]
    }));
    const invalid={planningVersion:3,contentCoverageVersion:1,title:"微积分",learningGoals,stages:structuredClone(stages)};
    invalid.stages[0].moduleBlueprints[0].keyQuestions[0].contentQuestionKey="unknown";
    const patch={stage:stages[0]};
    mocks.generateText.mockResolvedValueOnce(response(JSON.stringify(invalid))).mockResolvedValueOnce(response(JSON.stringify(patch)));
    const result=await runJsonTask({...task(),validate:validateRoadmapSkeletonDraft});
    expect(result.data.learningGoals).toEqual(learningGoals);
    expect(result.data.stages[1].key).toBe("derivative");
    expect(result.data.stages[0].goalKeys).toEqual(["goal-1"]);
    expect(records["log-1"]).toMatchObject({status:"failed",failureStage:"validation",rawOutput:JSON.stringify(invalid)});
    expect(JSON.parse(String(records["log-2"].parsedOutputJson))).toEqual(patch);
    expect(JSON.parse(String(records["log-2"].validatedOutputJson))).toEqual(result.data);
    expect(mocks.generateText.mock.calls[1][0].messages[1].content).toContain("Repair ONLY the skeleton Stage");
    expect(mocks.generateText).toHaveBeenCalledTimes(2);
  });

  it("retains invalid JSON without creating a parsed candidate", async () => {
    mocks.generateText.mockResolvedValue(response("Not JSON: a truncated course outline"));
    await expect(runJsonTask(task({ singleAttempt: true }))).rejects.toThrow();
    expect(records["log-1"]).toMatchObject({ status: "failed", failureStage: "json_parse", rawOutput: "Not JSON: a truncated course outline" });
    expect(records["log-1"].parsedOutputJson).toBeUndefined();
    expect(JSON.parse(String(records["log-1"].validationIssuesJson))).toHaveLength(1);
    expect(mocks.generateText).toHaveBeenCalledTimes(1);
  });

  it("records each transport failure and keeps the provider error response", async () => {
    const raw = { id: "rate-limit-response", error: { message: "Quota temporarily exceeded" } };
    mocks.generateText.mockRejectedValueOnce(new AiProviderError("Rate limit", 429, { text: "", raw, providerRequestId: raw.id }))
      .mockResolvedValueOnce(response('{"ok":true}'));
    await runJsonTask(task());
    expect(records["log-1"]).toMatchObject({ status: "failed", failureStage: "provider", rawOutput: "", providerRequestId: raw.id });
    expect(JSON.parse(String(records["log-1"].providerResponseJson))).toEqual(raw);
    expect(records["log-2"]).toMatchObject({ attempt: 2, retryReason: "transport", retryOfLogId: "log-1", status: "success" });
  });

  it("redacts known runtime credentials in messages, text, response fields and errors", async () => {
    vi.stubEnv("ENGLISHNODE_LOCAL_API_TOKEN", "private-local-token");
    const raw = { apiKey: "another-key", authorization: "Bearer another-key", explanation: "private-provider-key private-local-token" };
    mocks.generateText.mockResolvedValue(response(JSON.stringify(raw)));
    await runJsonTask(task({ userPrompt: "private-provider-key private-local-token", inputSummary: "private-provider-key" }));
    const all = JSON.stringify(records);
    expect(all).not.toContain("private-provider-key");
    expect(all).not.toContain("private-local-token");
    expect(all).not.toContain("another-key");
    // Credential-shaped JSON fields are redacted even when their value is not the active key.
    expect(JSON.parse(String(records["log-1"].providerResponseJson)).choices[0].message.content).toContain("[REDACTED]");
    expect(JSON.parse(String(records["log-1"].parsedOutputJson)).apiKey).toBe("[REDACTED]");
  });

  it("does not call the provider if the starting log cannot be saved", async () => {
    mocks.create.mockRejectedValue(new Error("Database is unavailable"));
    await expect(runJsonTask(task())).rejects.toBeInstanceOf(AiLogPersistenceError);
    expect(mocks.generateText).not.toHaveBeenCalled();
  });

  it("does not validate or use a response whose original evidence failed to save", async () => {
    const validate = vi.fn();
    mocks.generateText.mockResolvedValue(response('{"ok":true}'));
    mocks.update.mockRejectedValue(new Error("Disk full"));
    await expect(runJsonTask(task({ validate }))).rejects.toBeInstanceOf(AiLogPersistenceError);
    expect(validate).not.toHaveBeenCalled();
    expect(mocks.generateText).toHaveBeenCalledTimes(1);
    expect(records["log-1"].status).toBe("pending");
  });
});
