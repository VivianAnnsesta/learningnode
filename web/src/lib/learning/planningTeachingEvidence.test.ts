/**
 * Isolated regression of the planning -> teaching handoff; original red artifacts are retained.
 * Run explicitly: npx vitest run src/lib/learning/planningTeachingEvidence.test.ts
 * Uses a copied blank seed and a protocol fixture, never a real provider/user DB.
 * Assertions describe required evidence behavior, not a proposed JSON schema.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createLearningSession, prepareLearningSession, prepareLearningSegment
} from "./learningSessionService";
import { recordMapDraftQualityReview } from "./mapDraftReviewService";
import { saveRoadmapDraft } from "./roadmapService";
import { confirmDomainMap } from "./domainMapService";
import { currentCourse, currentRoadmap } from "./currentRoadmap.fixture";
import { planningKnowledgeDigest } from "../ai/planningKnowledgeReview";
import type { MapDraftQualityReport } from "../ai/tasks";
import type { CourseContentQuestion } from "./roadmapPlanningTypes";

const deps = vi.hoisted(() => ({ client: null as PrismaClient | null, run: vi.fn() }));
vi.mock("../prisma", () => ({ get prisma() { return deps.client!; } }));
vi.mock("../ai/tutorService", () => ({ runJsonTask: deps.run }));

const example = "原节点例子：200 件中被标记 52 件，其中缺陷 16 件，比例为 16/52。";
const mistake = "原节点误区：把已被标记中的缺陷比例误用总体 200 作分母。";
const transfer = "原节点迁移：总体 300、有缺陷 30、被标记 60，分别计算两个条件方向的比例。";
const missingCell = "具体待核实疑点：迁移题没有给出缺陷且被标记的交叉计数，须在实际活动中补表或明确讨论数据不足。";
const oldReason = "旧候选确定错误：在已被标记条件下使用总体计数作为分母。";
const badKnowledge = "给定已被标记条件，缺陷比例以总体计数作分母。";
const correctedKnowledge = "给定已被标记条件，缺陷比例不以总体计数作分母，而以被标记总数作分母。";
const quote = "以总体计数作分母";
const checkedKnowledge = "被标记者中有缺陷 16 件、总数 52 件，比例 16/52=4/13。";
const checkedOldOnly = "已复算的原表局部主张：16/52 约分为 4/13；适用范围只有本题给定表格与原有条件方向责任。";
type ReportKind = "transfer" | "known" | "empty" | "checked";
const baseConcept = () => ({
  name: "条件计数", aliases: [], scope: "有限计数表", problemRole: "区分两个方向",
  learningUnit: {
    version: 1, newKnowledge: badKnowledge, assumedKnowledge: ["分数"],
    teachingTasks: ["明确本题条件集合并计算占比"], example, references: []
  }
});

function candidate(otherExpanded = false) {
  return {
    planningVersion: 3, title: "隔离研究路线", status: "draft", baseRevision: 0,
    stages: [{
      key: "stage-table", title: "有限计数表", status: "expanded", goal: "明确条件",
      prerequisiteStageKeys: [], moduleDirections: ["条件计数"], moduleBlueprints: [],
      modules: [{ key: "module-table", title: "条件计数", items: [{
        key: "node-table", title: "条件计数", objective: "区分分母", keyQuestion: "如何选分母",
        prerequisiteKeys: [], planningQuestionKeys: [], commonMistake: mistake,
        transferPrompt: transfer, concept: baseConcept()
      }] }]
    }, {
      key: "stage-other", title: "另一阶段", status: otherExpanded ? "expanded" : "planned",
      prerequisiteStageKeys: [], moduleDirections: ["另一职责"], moduleBlueprints: [],
      modules: otherExpanded ? [{ key: "module-other", title: "另一职责", items: [] }] : []
    }]
  };
}

function report(draft: unknown, kind: ReportKind): MapDraftQualityReport {
  const target = kind === "transfer"
    ? "stages[0].modules[0].items[0].transferPrompt"
    : "stages[0].modules[0].items[0].concept.learningUnit.newKnowledge";
  const verdict = kind === "known" ? "confirmed_error" : kind === "checked" ? "no_error_found" : "uncertain";
  const reason = kind === "transfer" ? missingCell : kind === "checked" ? checkedOldOnly : oldReason;
  return {
    reviewPolicyVersion: 1, status: "passed", summary: "研究协议夹具；非真实质量证明",
    blockingIssues: [], warnings: kind === "transfer" ? [{
      code: "singleExampleTransfer", targetKey: "node-table",
      message: "迁移表后续须补足具体条件", suggestion: "按实际活动明确补表或讨论数据不足"
    }] : [],
    knowledgeReview: {
      reviewVersion: 1, draftDigest: planningKnowledgeDigest(draft), materialsDigest: planningKnowledgeDigest([]),
      verdict,
      summary: "实际范围内的协议夹具", limitations: kind === "empty" ? ["另一阶段本轮核对未完成"] : [],
      claims: kind === "empty" ? [] : [{
        key: "current-node-claim", path: target, quote: kind === "transfer" ? transfer : kind === "checked" ? "16/52=4/13" : quote,
        conclusion: kind === "transfer" ? "迁移题要求两个比例" : kind === "checked" ? "原表分数约分正确" : "使用总体作分母",
        premises: [], applicability: kind === "checked" ? ["本题给定表格", "content-direction requirementIndices[0]"] : ["本节点、本题的条件范围"],
        verdict,
        basis: { kind: kind === "transfer" ? "unverified" : "derivation", fragmentIds: [], reason },
        reason
      }],
      findings: kind === "known" ? [{ path: target, quote, replacement: "以被标记总数作分母", reason: oldReason }] : []
    }
  };
}

const framework = () => ({
  title: "条件计数", purpose: "区分分母", scope: "有限表", mainIdea: "按题目条件集合计数",
  prerequisites: [], limitations: ["隔离协议夹具"], segments: [{
    key: "table", title: "条件计数", goal: "比较条件", steps: [{
      key: "compare", goal: "比较条件", requiredOutput: "none", contentAssignments: []
    }]
  }]
});
type CapturedContext = {
  contentQuestions?: CourseContentQuestion[];
  planningKnowledge?: { verdict?: string; [key: string]: unknown };
};
function promptContext(prompt: string): CapturedContext {
  const json = prompt.match(/^上下文：(.+)$/m)?.[1];
  if (!json) throw new Error("Fixture expected the actual serialized learning context in the service prompt.");
  return JSON.parse(json) as CapturedContext;
}
function frameworkForPrompt(prompt: string) {
  const context = promptContext(prompt), base = framework();
  return { ...base, segments: base.segments.map(segment => ({ ...segment, steps: segment.steps.map(step => ({
    ...step, contentAssignments: (context.contentQuestions || []).map(question => ({
      contentQuestionKey: question.key,
      requirementIndices: question.requirementIndices || question.contentRequirements.map((_, index) => index)
    }))
  })) })) };
}
const material = () => ({
  title: "条件计数", summary: "按实际条件计数", limitations: [], steps: [{
    key: "compare", explanation: "先明确本题条件集合", example: "在十件被标记对象中有两件缺陷", basis: "derivation",
    sourceIds: [], activities: [{ kind: "discussion", prompt: "这题的分母是什么？", answer: "十件被标记对象",
      criteria: ["以题目给定条件为准"], hints: [], required: false }]
  }]
});

let directory: string;
let db: PrismaClient;
beforeAll(async () => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "englishnode-handoff-repro-"));
  const database = path.join(directory, "isolated.db");
  fs.copyFileSync(path.resolve("prisma/seed.db"), database);
  db = new PrismaClient({ datasources: { db: { url: `file:${database.replace(/\\/g, "/")}` } } });
  deps.client = db;
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("No network permitted in handoff reproduction."); }));
});
afterAll(async () => {
  await db?.$disconnect();
  vi.unstubAllGlobals();
  if (directory && path.dirname(path.resolve(directory)) === path.resolve(os.tmpdir())
    && path.basename(directory).startsWith("englishnode-handoff-repro-")) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
beforeEach(async () => {
  await db.nodeTeachingSession.deleteMany();
  await db.learningProgress.deleteMany();
  await db.domain.deleteMany();
  await db.aiCallLog.deleteMany();
  await db.domain.create({ data: {
    id: "handoff-domain", name: "隔离研究：条件计数", goal: "学会条件方向", scope: "有限表",
    courseDesignAiCallLogId: "course-current", courseDesignStatus: "confirmed", roadmapStatus: "confirmed", mapRevision: 1,
    roadmapDraftJson: JSON.stringify(candidate()), courseDesignDraft: JSON.stringify({ knowledgeBoundary: { assumedKnowledge: ["分数"] }, sources: [] })
  } });
  await db.unit.create({ data: { id: "unit-current", domainId: "handoff-domain", mapKey: "stage-table", title: "有限计数表", orderIndex: 0 } });
  await db.learningNode.create({ data: {
    id: "node-current", domainId: "handoff-domain", unitId: "unit-current", mapKey: "node-table",
    title: "条件计数", keyQuestion: "如何选分母", objective: "区分分母", orderIndex: 0,
    commonMistake: mistake, transferPrompt: transfer, conceptJson: JSON.stringify(baseConcept())
  } });
  await writeFormalAcceptance(candidate());
  deps.run.mockReset().mockImplementation(async task => ({
    data: task.validate(task.taskType === "node_lesson_preparation" ? frameworkForPrompt(task.userPrompt)
      : task.taskType === "node_segment_preparation" ? material()
        : { verdict: "no_error_found", summary: "固定合同夹具，不是语义验证", uncertainty: null, findings: [] }),
    log: { id: "fixture-call" }, aiCallLogIds: ["fixture-call"]
  }));
});

/** Exact existing confirmation-ledger shape; unrelated candidate IDs are not its source. */
async function writeFormalAcceptance(draft: unknown, revision = 1, courseDesignAiCallLogId = "course-current") {
  await db.learningProgress.create({ data: {
    domainId: "handoff-domain", status: "map_confirmed", payloadJson: JSON.stringify({
      action: "confirm_map", fromRevision: revision - 1, toRevision: revision,
      reason: "隔离夹具中的正式范围确认", intent: { name: "隔离研究：条件计数", goal: "学会条件方向", scope: "有限表", excludedScope: null, currentLevel: null },
      draft, courseDesignAiCallLogId,
      courseDesign: { knowledgeBoundary: { assumedKnowledge: ["分数"] }, sources: [] }
    }), createdAt: new Date(Date.UTC(2026, 9, 28, 0, revision))
  } });
  await db.domain.update({ where: { id: "handoff-domain" }, data: { mapRevision: revision } });
}

async function saveReview(draft: Record<string, unknown> & { baseRevision: number }, kind: ReportKind, stageKey = "stage-table", createdAt = new Date("2026-10-28T00:00:00Z")) {
  const result = await recordMapDraftQualityReview({
    domainId: "handoff-domain", scope: "map", stageKey, draft, baseRevision: draft.baseRevision,
    courseDesignAiCallLogId: "course-current", report: report(draft, kind), aiCallLogIds: ["archived-review-call"]
  });
  await db.mapDraftQualityReview.update({ where: { id: result.id }, data: { createdAt } });
  return result;
}

const responsibilityQuestions: CourseContentQuestion[] = [
  { key: "content-direction", question: "如何确定条件方向？", importance: "required", contentRequirements: ["原有责任：按给定条件明确计数分母"], dimensionKeys: [] },
  { key: "content-notation", question: "如何事后使用条件记号？", importance: "required", contentRequirements: ["新增记号责任：将两个条件方向对应 P(A|B) 与 P(B|A)"], dimensionKeys: [] },
  { key: "content-base-rate", question: "如何解释基准比例？", importance: "required", contentRequirements: ["新增基准责任：说明总体比例改变与筛查结果解释的关系"], dimensionKeys: [] },
  { key: "content-bayes", question: "是否选学贝叶斯表达？", importance: "optional", contentRequirements: ["新增选学责任：在自愿选学时把分组计数与贝叶斯表达对应"], dimensionKeys: [] }
];
const responsibilityContributions = responsibilityQuestions.map(question => ({
  contentQuestionKey: question.key, requirementIndices: [0], dimensionKeys: [],
  contribution: `复用条件计数节点承担：${question.contentRequirements[0]}`
}));

function contributedCandidate() {
  const base = candidate();
  const first = base.stages[0], stageModule = first.modules[0], node = stageModule.items[0];
  return {
    ...base, learningGoals: [{ key: "goal-direction", description: "条件方向及其后续用途", contentQuestions: responsibilityQuestions }],
    stages: [{ ...first, modules: [{ ...stageModule, items: [{ ...node,
      concept: { ...node.concept, learningUnit: { ...node.concept.learningUnit, version: 2,
        contentContributions: [responsibilityContributions[0]] } }
    }] }] }, ...["stage-notation", "stage-interpret", "stage-bayes-optional"].map((key, index) => ({
      key, title: responsibilityQuestions[index + 1].question, status: "planned", goal: responsibilityQuestions[index + 1].question,
      prerequisiteStageKeys: [], moduleDirections: [responsibilityQuestions[index + 1].question], moduleBlueprints: [], modules: []
    }))]
  };
}
async function installOwnedResponsibility(checked = false) {
  const draft = contributedCandidate();
  const concept = draft.stages[0].modules[0].items[0].concept;
  if (checked) concept.learningUnit.newKnowledge = checkedKnowledge;
  await db.learningNode.update({ where: { id: "node-current" }, data: { conceptJson: JSON.stringify(concept) } });
  await db.domain.update({ where: { id: "handoff-domain" }, data: {
    learningGoalsJson: JSON.stringify(draft.learningGoals), roadmapDraftJson: JSON.stringify(draft)
  } });
  await db.learningProgress.deleteMany({ where: { domainId: "handoff-domain", status: "map_confirmed" } });
  await writeFormalAcceptance(draft);
  return draft;
}
async function addLaterReferences(original: ReturnType<typeof contributedCandidate>) {
  const draft = structuredClone(original);
  // The original teaching field and owned contribution remain identical. Only
  // later Units reference the stable node and contribute new course duties.
  for (const [index, stage] of draft.stages.slice(1).entries()) {
    const conceptReference = { key: "node-table", planningQuestionKeys: [], problemRole: stage.goal,
      contentContributions: [responsibilityContributions[index + 1]] };
    const stageModule = { key: `module-ref-${index}`, title: stage.title, items: [], conceptReferences: [conceptReference] };
    Object.assign(stage, { status: "expanded", modules: [stageModule] });
    await db.unit.create({ data: {
      id: `unit-reference-${index}`, domainId: "handoff-domain", mapKey: stage.key,
      title: stage.title, goal: stage.goal, orderIndex: index + 1,
      teachingPlanJson: JSON.stringify({ modules: [{ title: stageModule.title, conceptReferences: stageModule.conceptReferences }] })
    } });
  }
  draft.baseRevision = 1;
  await db.domain.update({ where: { id: "handoff-domain" }, data: { roadmapDraftJson: JSON.stringify(draft), mapRevision: 2 } });
  await writeFormalAcceptance(draft, 2);
  const receipt = await db.learningProgress.findFirstOrThrow({ where: { domainId: "handoff-domain", status: "map_confirmed" }, orderBy: { createdAt: "desc" } });
  const persisted = JSON.parse(receipt.payloadJson) as { draft: { stages: { modules: { conceptReferences?: { key: string; contentContributions: unknown[] }[] }[] }[] } };
  expect(persisted.draft.stages.slice(1).map(stage => stage.modules[0].conceptReferences?.[0])).toEqual(
    responsibilityContributions.slice(1).map(contentContribution => ({ key: "node-table", planningQuestionKeys: [],
      problemRole: responsibilityQuestions.find(question => question.key === contentContribution.contentQuestionKey)!.question,
      contentContributions: [contentContribution] }))
  );
  expect(draft.stages[0].modules[0].items[0]).toEqual(original.stages[0].modules[0].items[0]);
  return draft;
}

async function captureActualPrompts(withMaterial = false) {
  const created = (await createLearningSession({ domainId: "handoff-domain", nodeId: "node-current", requestId: "create" })).session;
  let ready = (await prepareLearningSession(created.id, {
    revision: created.revision, requestId: `prepare-${deps.run.mock.calls.length}`, reprepare: true
  })).session;
  expect(ready.status).toBe("ready");
  if (withMaterial) {
    ready = (await prepareLearningSegment(ready.id, "table", { revision: ready.revision, requestId: "material" })).session;
    expect(ready.segments.some(segment => segment.status === "ready")).toBe(true);
  }
  return deps.run.mock.calls.filter(([task]) => ["node_lesson_preparation", "node_segment_preparation"].includes(task.taskType))
    .map(([task]) => ({ type: task.taskType as string, prompt: task.userPrompt as string }));
}

describe("规划到真实备课 prompt 的隔离交接回归（旧实现预期失败）", () => {
  it("框架与正文生成均保留当前节点 example、commonMistake、transferPrompt 的原文", async () => {
    const prompts = await captureActualPrompts(true);
    expect(prompts).toHaveLength(2);
    for (const { type, prompt } of prompts) for (const actual of [example, mistake, transfer]) {
      expect.soft(prompt, `${type} 丢失当前节点原文：${actual}`).toContain(actual);
    }
  });

  it("当前节点迁移题疑点即使位于最新报告也应进入备课", async () => {
    await saveReview(candidate(), "transfer");
    const prompts = await captureActualPrompts();
    expect(prompts[0].prompt).toContain(missingCell);
  });

  it("最新无关阶段报告不能遮蔽此前确实已进入备课的当前节点疑点", async () => {
    await saveReview(candidate(), "known");
    // The baseline actually reaches the generated prompt; this isolates latest-only
    // selection from the separate transferPrompt projection omission above.
    const before = await captureActualPrompts();
    expect(before[0].prompt).toContain(oldReason);
    const expanded = { ...candidate(true), baseRevision: 1 };
    await saveReview(expanded, "empty", "stage-other", new Date("2026-10-28T00:01:00Z"));
    await db.domain.update({ where: { id: "handoff-domain" }, data: { roadmapDraftJson: JSON.stringify(expanded) } });
    const after = await captureActualPrompts();
    expect(after.at(-1)!.prompt).toContain(oldReason);
    expect(await db.mapDraftQualityReview.count()).toBe(2);
  });

  it("后续三个 Unit 引用旧节点增加责任时，未改 transferPrompt 的具体疑点仍可传递", async () => {
    const original = await installOwnedResponsibility();
    await saveReview(original, "transfer");
    await addLaterReferences(original);
    const prompt = (await captureActualPrompts()).at(-1)!.prompt;
    const context = promptContext(prompt);
    // These assertions prove the real makeContext joined the incoming references;
    // an empty later Stage would not exercise an over-broad questions fingerprint.
    expect(context.contentQuestions?.map(question => question.key)).toEqual(responsibilityQuestions.map(question => question.key));
    expect(context.contentQuestions?.find(question => question.key === "content-bayes")?.importance).toBe("optional");
    expect((await db.learningNode.findUniqueOrThrow({ where: { id: "node-current" } })).transferPrompt).toBe(transfer);
    expect(prompt).toContain(missingCell);
  });

  it("后续引用新增责任不取消旧局部 no_error_found，也不能让它覆盖新增责任", async () => {
    const original = await installOwnedResponsibility(true);
    await saveReview(original, "checked");
    const before = promptContext((await captureActualPrompts()).at(-1)!.prompt);
    expect(before.contentQuestions).toHaveLength(1);
    expect(JSON.stringify(before.planningKnowledge)).toContain(checkedOldOnly);
    await addLaterReferences(original);
    const after = promptContext((await captureActualPrompts()).at(-1)!.prompt);
    expect(after.contentQuestions).toHaveLength(4);
    // Per-claim evidence remains useful, but the report's old aggregate verdict
    // cannot certify a current scope that now contains three unreviewed duties.
    expect.soft(JSON.stringify(after.planningKnowledge)).toContain(checkedOldOnly);
    expect.soft(after.planningKnowledge).not.toHaveProperty("verdict", "no_error_found");
    const claims = (after.planningKnowledge?.claims || []) as { key: string; applicability?: string[] }[];
    const retained = claims.find(claim => claim.key === "current-node-claim");
    expect.soft(retained).toBeDefined();
    expect.soft(JSON.stringify(retained?.applicability)).toContain("content-direction");
    for (const question of responsibilityQuestions.slice(1)) {
      expect.soft(JSON.stringify(retained?.applicability)).not.toContain(question.key);
    }
  });

  it("只修改独立 example 时不能吞掉未改 transferPrompt 的已存疑点", async () => {
    await saveReview(candidate(), "transfer");
    const concept = baseConcept();
    concept.learningUnit.example = "另一个独立演示：十件被标记者中两件有缺陷，条件比例为 2/10。";
    await db.learningNode.update({ where: { id: "node-current" }, data: { conceptJson: JSON.stringify(concept) } });
    const prompt = (await captureActualPrompts()).at(-1)!.prompt;
    expect((await db.learningNode.findUniqueOrThrow({ where: { id: "node-current" } })).transferPrompt).toBe(transfer);
    expect(prompt).toContain(missingCell);
  });

  it("transferPrompt 本字段已否定原作答要求时不能仅凭保留的引文套旧疑点", async () => {
    await saveReview(candidate(), "transfer");
    const revised = `修订：不要求按“${transfer}”给出数值答案；只讨论缺失交叉计数，因此数据不足。`;
    expect(revised).toContain(transfer);
    await db.learningNode.update({ where: { id: "node-current" }, data: { transferPrompt: revised } });
    const prompt = (await captureActualPrompts()).at(-1)!.prompt;
    expect(prompt).not.toContain(missingCell);
  });

  it("仅更换未确认课程候选 ID，不得抹去正式确认来源下仍匹配的节点疑点", async () => {
    await saveReview(candidate(), "known");
    await db.domain.update({ where: { id: "handoff-domain" }, data: { courseDesignAiCallLogId: "course-unaccepted-candidate", courseDesignStatus: "draft" } });
    const prompt = (await captureActualPrompts()).at(-1)!.prompt;
    expect(prompt).toContain(oldReason);
  });

  it("正式确认来源已经更换时不能把旧课程报告套到新正式节点", async () => {
    await saveReview(candidate(), "known");
    await db.domain.update({ where: { id: "handoff-domain" }, data: { courseDesignAiCallLogId: "course-new-formal" } });
    await writeFormalAcceptance(candidate(), 2, "course-new-formal");
    const prompt = (await captureActualPrompts()).at(-1)!.prompt;
    expect(prompt).not.toContain(oldReason);
  });

  it("正式确认来源无法恢复时保留报告历史，但不伪装成当前节点的已核实结论", async () => {
    await saveReview(candidate(), "known");
    await db.learningProgress.deleteMany({ where: { domainId: "handoff-domain", status: "map_confirmed" } });
    const prompt = (await captureActualPrompts()).at(-1)!.prompt;
    expect(prompt).not.toContain(oldReason);
    expect((await db.mapDraftQualityReview.findFirstOrThrow()).reportJson).toContain(oldReason);
  });

  it.each(["stage", "node", "text"] as const)("%s 身份或全文变化后不得仅凭重合 quote 套用旧确定错误", async changed => {
    await saveReview(candidate(), "known");
    const next = candidate();
    if (changed === "stage") await db.unit.update({ where: { id: "unit-current" }, data: { mapKey: "stage-replaced" } });
    if (changed === "node") await db.learningNode.update({ where: { id: "node-current" }, data: { mapKey: "node-replaced" } });
    if (changed === "stage") next.stages[0].key = "stage-replaced";
    if (changed === "node") next.stages[0].modules[0].items[0].key = "node-replaced";
    if (changed === "text") {
      const concept = baseConcept();
      concept.learningUnit.newKnowledge = correctedKnowledge;
      // The old quoted substring still exists, but its surrounding negation reverses its meaning.
      expect(correctedKnowledge).toContain(quote);
      await db.learningNode.update({ where: { id: "node-current" }, data: { conceptJson: JSON.stringify(concept) } });
      next.stages[0].modules[0].items[0].concept = concept;
    }
    await writeFormalAcceptance(next, 2);
    const prompts = await captureActualPrompts();
    expect(prompts[0].prompt).not.toContain(oldReason);
  });

  it("无可恢复节点绑定的旧报告保留历史，但不能伪装成当前节点已核实的主张", async () => {
    await db.mapDraftQualityReview.create({ data: {
      domainId: "handoff-domain", scope: "map", stageKey: "stage-table", baseRevision: 0,
      draftHash: "unrecoverable-old-candidate", courseDesignAiCallLogId: "course-current",
      status: "passed", availability: "available", reportJson: JSON.stringify(report(candidate(), "known")), aiCallLogIdsJson: "[]"
    } });
    const prompts = await captureActualPrompts();
    expect(prompts[0].prompt).not.toContain(oldReason);
    expect((await db.mapDraftQualityReview.findFirstOrThrow()).reportJson).toContain(oldReason);
  });

  it("不匹配实际 draftDigest 的旧报告不能经 acceptedDraftHash 盖章成为当前证据", async () => {
    const draft = candidate(), mismatch = report(draft, "known");
    mismatch.knowledgeReview!.draftDigest = planningKnowledgeDigest({ different: "candidate" });
    try {
      await recordMapDraftQualityReview({ domainId: "handoff-domain", scope: "map", stageKey: "stage-table",
        draft, baseRevision: 0, courseDesignAiCallLogId: "course-current", report: mismatch });
    } catch (error) {
      expect(String(error)).toMatch(/身份|指纹|绑定|draft|候选|报告/i);
      return;
    }
    const prompt = (await captureActualPrompts()).at(-1)!.prompt;
    expect(prompt).not.toContain(oldReason);
  });

  it("warning-only 的补表建议作为待核实意见保留，不依赖恰好存在知识 claim", async () => {
    const draft = candidate(), warningOnly = report(draft, "empty");
    const pending = "独立规划意见：迁移提示尚未给出交叉格，请在实际活动明确补表或讨论不足。";
    warningOnly.warnings = [{ code: "singleExampleTransfer", targetKey: "node-table", message: pending, suggestion: null }];
    await recordMapDraftQualityReview({ domainId: "handoff-domain", scope: "map", stageKey: "stage-table", draft,
      baseRevision: 0, courseDesignAiCallLogId: "course-current", report: warningOnly });
    const prompt = (await captureActualPrompts()).at(-1)!.prompt;
    expect(prompt).toContain(pending);
    expect(prompt).not.toContain("上下文的 planningKnowledge 是独立核对过的主张、前提及条件");
  });

  it("超过一百条后续无关报告不能隐形截断仍适用的旧疑点", async () => {
    await saveReview(candidate(), "known");
    await db.mapDraftQualityReview.createMany({ data: Array.from({ length: 121 }, (_, index) => ({
      domainId: "handoff-domain", scope: "map", stageKey: `unrelated-stage-${index}`, baseRevision: 1,
      draftHash: `unrelated-draft-${index}`, courseDesignAiCallLogId: "course-current",
      status: "passed", availability: "available", reportJson: JSON.stringify(report({}, "empty")), aiCallLogIdsJson: "[]",
      createdAt: new Date(Date.UTC(2026, 9, 28, 1, 0, index))
    })) });
    const prompt = (await captureActualPrompts()).at(-1)!.prompt;
    expect(prompt).toContain(oldReason);
  });

  it("当前节点局部证据不能携带其它阶段的全局 limitation 当作本题结论", async () => {
    const draft = candidate(), current = report(draft, "known"), unrelated = "其它阶段的私有局限：选学贝叶斯公式的全部推导尚未核对。";
    current.knowledgeReview!.limitations = [unrelated];
    await recordMapDraftQualityReview({ domainId: "handoff-domain", scope: "map", stageKey: "stage-table", draft,
      baseRevision: 0, courseDesignAiCallLogId: "course-current", report: current });
    const prompt = (await captureActualPrompts()).at(-1)!.prompt;
    expect(prompt).toContain(oldReason);
    expect(prompt).not.toContain(unrelated);
  });

  it("真实保存与确认的 parseConcept/trim 规范化不应误丢同一字段证据", async () => {
    const domainId = "roundtrip-domain", courseId = "roundtrip-course";
    await db.domain.create({ data: { id: domainId, name: "图像", goal: "判断不同实根数量", courseDesignStatus: "draft",
      courseDesignDraft: JSON.stringify(currentCourse), courseDesignAiCallLogId: courseId } });
    await db.aiCallLog.create({ data: { id: courseId, domainId, provider: "fixture", taskType: "course_design_research", status: "success" } });
    const raw = currentRoadmap(true), item = raw.stages[0].modules[0].items[0];
    item.concept.learningUnit.example = `  ${item.concept.learningUnit.example}  `;
    Object.assign(item.concept, { aliases: ["参数别名", "参数别名"] });
    const saved = await saveRoadmapDraft(domainId, { ...raw, baseRevision: 0 }, courseId);
    const normalized = saved.draft.stages[0].modules[0].items[0];
    const reason = "规范化后原图像例子的待核实疑点：确认参数取值与交点讨论条件。";
    const review = report(saved.draft, "transfer");
    review.warnings = [];
    review.knowledgeReview!.claims[0] = { ...review.knowledgeReview!.claims[0],
      path: "stages[0].modules[0].items[0].concept.learningUnit.example",
      quote: normalized.concept!.learningUnit!.example,
      reason, basis: { kind: "unverified", fragmentIds: [], reason } };
    await recordMapDraftQualityReview({ domainId, scope: "map", draft: saved.draft, baseRevision: 0, courseDesignAiCallLogId: courseId, report: review });
    await confirmDomainMap(domainId, saved.draft, "隔离测试明确接受已展示的候选和来源局限", currentCourse);
    const node = await db.learningNode.findFirstOrThrow({ where: { domainId, mapKey: "parameters" } });
    const persisted = JSON.parse(node.conceptJson!);
    expect(persisted.learningUnit.example).toBe(normalized.concept!.learningUnit!.example);
    expect(persisted.aliases).toEqual(["参数别名"]);
    const created = (await createLearningSession({ domainId, nodeId: node.id, requestId: "roundtrip-create" })).session;
    const ready = (await prepareLearningSession(created.id, { requestId: "roundtrip-prepare", revision: created.revision })).session;
    expect(ready.status).toBe("ready");
    const prompt = deps.run.mock.calls.find(([task]) => task.taskType === "node_lesson_preparation")![0].userPrompt;
    expect(prompt).toContain(reason);
    const ledger = await db.learningProgress.findFirstOrThrow({ where: { domainId, status: "map_confirmed" } });
    expect(JSON.parse(ledger.payloadJson).courseDesignAiCallLogId).toBe(courseId);
  });

  it.each(["prerequisite", "rationale"] as const)("%s 中实际前提变化后，原字段未改也不能继承旧无错结论", async field => {
    const original = candidate(), target = original.stages[0].modules[0].items[0];
    target.concept.scope = "实数主平方根";
    target.concept.learningUnit.newKnowledge = "sqrt(x²)=x";
    if (field === "prerequisite") Object.assign(target, { prerequisite: "仅讨论 x>=0" });
    else Object.assign(original.stages[0], { rationale: "这一阶段仅讨论 x>=0" });
    await db.learningNode.update({ where: { id: "node-current" }, data: {
      conceptJson: JSON.stringify(target.concept), prerequisite: field === "prerequisite" ? "仅讨论 x>=0" : null
    } });
    const checked = report(original, "checked"), reason = "旧核对仅在 x>=0 的实际父范围下证明 sqrt(x²)=x。";
    Object.assign(checked.knowledgeReview!.claims[0], { quote: "sqrt(x²)=x", conclusion: "非负范围内恒等式成立", premises: ["x>=0"],
      applicability: [`${field} 的非负范围`], reason, basis: { kind: "derivation", fragmentIds: [], reason } });
    await recordMapDraftQualityReview({ domainId: "handoff-domain", scope: "map", stageKey: "stage-table", draft: original,
      baseRevision: 0, courseDesignAiCallLogId: "course-current", report: checked });
    const next = structuredClone(original);
    if (field === "prerequisite") {
      Object.assign(next.stages[0].modules[0].items[0], { prerequisite: "现在讨论全部实数 x" });
      await db.learningNode.update({ where: { id: "node-current" }, data: { prerequisite: "现在讨论全部实数 x" } });
    } else Object.assign(next.stages[0], { rationale: "现在这一阶段讨论全部实数 x" });
    await writeFormalAcceptance(next, 2);
    const prompt = (await captureActualPrompts()).at(-1)!.prompt;
    expect(prompt).not.toContain(reason);
  });

  it("真实无 key 详细模块的 warning 通过蓝图问题身份传到所属节点", async () => {
    const draft = candidate(), stage = draft.stages[0], target = stage.modules[0].items[0];
    delete (stage.modules[0] as { key?: string }).key;
    Object.assign(stage, { moduleBlueprints: [{ key: "blueprint-current", title: "同名不作为绑定", goal: "明确条件", keyQuestions: [
      { key: "planning-current", question: "本模块问题", checkableOutcome: "明确条件" }
    ] }] });
    Object.assign(target, { planningQuestionKeys: ["planning-current"] });
    await db.learningNode.update({ where: { id: "node-current" }, data: { planningQuestionKeysJson: JSON.stringify(["planning-current"]) } });
    await db.learningProgress.deleteMany({ where: { domainId: "handoff-domain" } });
    await writeFormalAcceptance(draft);
    const warning = "实际蓝图模块意见：在后续材料明确本题条件，不以模块标题猜范围。", reviewed = report(draft, "empty");
    reviewed.warnings = [{ code: "moduleConditions", targetKey: "blueprint-current", message: warning, suggestion: null }];
    await recordMapDraftQualityReview({ domainId: "handoff-domain", scope: "map", stageKey: "stage-table", draft,
      baseRevision: 0, courseDesignAiCallLogId: "course-current", report: reviewed });
    expect((await captureActualPrompts()).at(-1)!.prompt).toContain(warning);
  });

  it("只有 conceptReferences 的无 key 模块将其蓝图待核实意见传给实际被引用节点", async () => {
    const draft = await addLaterReferences(await installOwnedResponsibility());
    const stage = draft.stages[3];
    const targetModule = stage.modules[0] as unknown as { key?: string; title: string; items: unknown[];
      conceptReferences: { key: string; planningQuestionKeys: string[]; contentContributions: unknown[] }[] };
    delete targetModule.key;
    targetModule.conceptReferences[0].planningQuestionKeys = ["plan-optional-reference"];
    Object.assign(stage, { moduleBlueprints: [{ key: "blueprint-optional-reference", title: stage.title, goal: stage.goal, keyQuestions: [{
      key: "plan-optional-reference", contentQuestionKey: "content-bayes", question: stage.goal, checkableOutcome: "只承担选学对应"
    }] }] });
    expect(targetModule.items).toEqual([]);
    await db.unit.update({ where: { id: "unit-reference-2" }, data: { planningBlueprintJson: JSON.stringify(stage.moduleBlueprints),
      teachingPlanJson: JSON.stringify({ modules: [targetModule] }) } });
    await db.learningProgress.deleteMany({ where: { domainId: "handoff-domain" } });
    await writeFormalAcceptance(draft, 2);
    const pending = "复用模块待核实意见：核对旧节点承担的选学对应，不把选学当作必做。", reviewed = report(draft, "empty");
    reviewed.warnings = [{ code: "referenceScopeTension", targetKey: "blueprint-optional-reference", message: pending, suggestion: null }];
    await recordMapDraftQualityReview({ domainId: "handoff-domain", scope: "map", stageKey: stage.key, draft,
      baseRevision: 1, courseDesignAiCallLogId: "course-current", report: reviewed });
    expect((await captureActualPrompts()).at(-1)!.prompt).toContain(pending);
  });

  it("多条 claim 和 pending 共用一次实际引用的来源正文，不复制未引用全文", async () => {
    const draft = await installOwnedResponsibility(true), reviewed = report(draft, "checked");
    const marker = "UNIQUE_REFERENCED_SOURCE_BODY:", unused = "UNREFERENCED_SOURCE_BODY:";
    const materials = [{ id: "source-needed", text: `${marker}${"研究者构造计数说明。".repeat(200)}16/52=4/13。` },
      { id: "source-unused", text: `${unused}${"与当前主张无关的长正文。".repeat(200)}` }];
    reviewed.knowledgeReview!.materials = materials;
    reviewed.knowledgeReview!.materialsDigest = planningKnowledgeDigest(materials);
    const first = reviewed.knowledgeReview!.claims[0];
    reviewed.knowledgeReview!.claims = ["16/52=4/13", "被标记者中", "总数 52 件"].map((quote, index) => ({
      ...first, key: `source-claim-${index}`, quote,
      basis: { kind: "source", fragmentIds: ["source-needed"], reason: "只引用当前计数片段的对应原文" }
    }));
    reviewed.warnings = [0, 1, 2].map(index => ({ code: `pending-${index}`, targetKey: "node-table", message: `待核实规划意见 ${index}`, suggestion: null }));
    await recordMapDraftQualityReview({ domainId: "handoff-domain", scope: "map", stageKey: "stage-table", draft,
      baseRevision: 0, courseDesignAiCallLogId: "course-current", report: reviewed });
    const evidence = JSON.stringify(promptContext((await captureActualPrompts()).at(-1)!.prompt).planningKnowledge);
    expect(evidence.split(marker)).toHaveLength(2);
    expect(evidence).not.toContain(unused);
    expect(evidence).toContain("source-needed");
  });
});
