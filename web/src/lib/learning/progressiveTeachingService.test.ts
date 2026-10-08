import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { runPrismaMigrateDeploy } from "../../../scripts/database-lifecycle";
import { badKnowledgeFramework, correctedKnowledgeFramework, correctKnowledgeMaterial, knowledgeResult } from "../ai/teachingKnowledge.fixture";
import { FrameworkKnowledgeError, knowledgeBlockingIssues } from "../ai/teachingKnowledgeReview";
import { getNodeTeaching, prepareNodeTeaching, prepareTeachingSegment, saveNodeTeachingProgress, submitTeachingInteraction } from "./progressiveTeachingService";
import { activityBinding, validateMaterial, type TeachingContextV2, type TeachingFramework, type TeachingMaterial, type TeachingProgressV2, type TeachingReplyV2 } from "./teachingContracts";

const dependencies = vi.hoisted(() => ({ client: null as PrismaClient | null, prepare: vi.fn(), respond: vi.fn(), check: vi.fn() }));
vi.mock("../prisma", () => ({ get prisma() { return dependencies.client!; } }));
vi.mock("../ai/progressiveTeachingTasks", () => ({ prepareProgressiveTeaching: dependencies.prepare, respondProgressiveTeaching: dependencies.respond }));
vi.mock("../ai/teachingKnowledgeReview", async importOriginal => ({ ...await importOriginal<typeof import("../ai/teachingKnowledgeReview")>(), checkTeachingKnowledge: dependencies.check }));

let root: string;
let db: PrismaClient;
let counter = 0;
const fresh = async () => (await prepareNodeTeaching("domain-a", "node-a", { requestId: "original-frame" })).session!;
const reply: TeachingReplyV2 = { text: "两者定义域相同，取值也相同。", observation: "本次比较了定义域。", unresolved: null, action: { type: "continue", stepKey: "encounter-step", nodeId: null, dimensionKeys: ["definition"], reason: "可自行继续。" } };
const report = (framework: TeachingFramework, context: TeachingContextV2, errors: string[] = []) => {
  const knowledgeReview = knowledgeResult(framework, context, errors);
  const blockingIssues = knowledgeBlockingIssues(knowledgeReview);
  return { reviewPolicyVersion: 1, status: blockingIssues.length ? "blocked" : "passed", summary: "保存核对", findings: [], blockingIssues, warnings: [], limitation: "测试模型结果不证明真实教学质量。", knowledgeReview };
};
const materialFor = (framework: TeachingFramework, key: string) => validateMaterial({ ...structuredClone(correctKnowledgeMaterial), key,
  steps: framework.segments.find(s => s.key === key)!.steps.map(s => ({ ...structuredClone(correctKnowledgeMaterial.steps[0]), key: s.key, dimensionKeys: framework.segments.find(p => p.key === key)!.dimensionKeys })) }, framework, key as TeachingMaterial["key"], []);

beforeAll(async () => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), "englishnode-framework-correction-"));
  const databasePath = path.join(root, "teaching.db");
  fs.copyFileSync(path.resolve("prisma/seed.db"), databasePath);
  runPrismaMigrateDeploy({ userDatabasePath: databasePath, schemaPath: path.resolve("prisma/schema.prisma"), prismaCliPath: path.resolve("node_modules/prisma/build/index.js") });
  db = new PrismaClient({ datasources: { db: { url: `file:${databasePath.replace(/\\/g, "/")}` } } });
  dependencies.client = db;
}, 60000);
afterAll(async () => {
  await db?.$disconnect();
  if (root && path.dirname(root) === path.resolve(os.tmpdir())) fs.rmSync(root, { recursive: true, force: true });
});
beforeEach(async () => {
  await db.teachingInteraction.deleteMany();
  await db.teachingSegment.deleteMany();
  await db.domain.deleteMany();
  counter = 0;
  dependencies.check.mockReset().mockImplementation(async input => ({ data: knowledgeResult(input.framework, input.context, ["plan_discriminate"]), aiCallLogIds: ["knowledge-check-log"] }));
  dependencies.prepare.mockReset().mockImplementation(async input => {
    const framework = input.frameworkCorrection ? correctedKnowledgeFramework : input.framework || badKnowledgeFramework;
    const data = input.segmentKey ? validateMaterial(input.resumeMaterial || materialFor(framework, input.segmentKey), framework, input.segmentKey, input.context.sources) : framework;
    const review = { ...report(framework, input.context), ...(input.resumeMaterial ? { reusedMaterial: true } : {}) };
    const callIds = [...(input.resumeCallIds || []), `generated-${++counter}`];
    await input.checkpoint?.(callIds, data, review);
    return { data, callIds, review };
  });
  dependencies.respond.mockReset().mockResolvedValue({ data: reply, log: { id: "feedback-log" } });
  await db.domain.create({ data: { id: "domain-a", name: "考研数学微积分", goal: "理解函数", courseDesignStatus: "confirmed" } });
  await db.domain.create({ data: { id: "domain-b", name: "其他领域" } });
  await db.unit.create({ data: { id: "unit-a", domainId: "domain-a", title: "函数基础", orderIndex: 0 } });
  await db.learningNode.create({ data: { id: "node-a", domainId: "domain-a", unitId: "unit-a", title: "函数", objective: "理解定义域", keyQuestion: "如何判断两个函数是否相同", conceptJson: JSON.stringify({ name: "函数", scope: "一元实函数" }), orderIndex: 0 } });
});

describe("versioned framework correction with isolated blank SQLite", () => {
  it("reads real prerequisite teaching and fresh reading/question evidence without invalidating the framework",async()=>{
    const learningUnit={version:2,newKnowledge:"夹逼准则",assumedKnowledge:["不等式"],teachingTasks:["先解释两侧同极限与夹住条件"],example:"上下界趋于0",references:[],contentContributions:[]};
    await db.learningNode.create({data:{id:"prior",domainId:"domain-a",unitId:"unit-a",title:"极限性质",orderIndex:1,conceptJson:JSON.stringify({scope:"夹逼的条件和结论",learningUnit})}});
    await db.learningNodeDependency.create({data:{nodeId:"node-a",prerequisiteId:"prior"}});
    let prior=(await prepareNodeTeaching("domain-a","prior",{requestId:"prior-frame"})).session!;
    const current=await fresh();
    expect(current.context.prerequisites[0]).toMatchObject({scope:"夹逼的条件和结论",learningUnit,learningEvidence:{steps:[]}});
    prior=(await prepareTeachingSegment("domain-a","prior","encounter",{sessionId:prior.id,revision:prior.revision,requestId:"prior-segment"})).session!;
    const segment=prior.segments.find(s=>s.status==="ready")!;
    const before=(await getNodeTeaching("domain-a","node-a")).session!;
    expect(before.stale).toBe(false);
    expect(before.context.prerequisites[0].learningEvidence?.steps[0].viewed).toBe(false);
    prior=(await saveNodeTeachingProgress("domain-a","prior",{sessionId:prior.id,revision:prior.revision,action:"navigate",segmentId:segment.id,stepKey:"encounter-step"})).session!;
    const after=(await getNodeTeaching("domain-a","node-a")).session!;
    expect(after.id).toBe(current.id); expect(after.stale).toBe(false);
    expect(after.context.prerequisites[0].learningEvidence?.steps[0].viewed).toBe(true);
    expect(after.context.prerequisites[0].userUnderstanding).toBeNull();
    await submitTeachingInteraction("domain-a","prior",{sessionId:prior.id,revision:prior.revision,requestId:"prior-question",kind:"question",segmentId:segment.id,stepKey:"encounter-step",input:"我还不理解两侧为何要趋于同一个值。"});
    const question=(await getNodeTeaching("domain-a","node-a")).session!;
    expect(question.stale).toBe(false);
    expect(question.context.prerequisites[0].learningEvidence?.unresolved).toContain("我还不理解两侧为何要趋于同一个值。");
    await db.learningNode.update({where:{id:"prior"},data:{conceptJson:JSON.stringify({scope:"只讲有界性",learningUnit:{...learningUnit,newKnowledge:"有界性",teachingTasks:["只讲收敛必有界"]}})}});
    expect((await getNodeTeaching("domain-a","node-a")).session!.stale).toBe(true);
  });
  it("passes only the node's assigned part of a shared question to teaching and retains the course registry", async () => {
    const question = { key: "shared", question: "怎样理解并选择极限方法", contentRequirements: ["解释极限", "选择计算方法"], dimensionKeys: ["definition", "selection"] };
    const goals = [{ key: "goal", description: "理解极限", contentQuestions: [question] }];
    const learningUnit = { version: 2, newKnowledge: "极限定义", assumedKnowledge: ["高中函数"], teachingTasks: ["解释趋近"], example: "趋近零", references: [], contentContributions: [{ contentQuestionKey: "shared", requirementIndices: [0], dimensionKeys: ["definition"], contribution: "本课只解释定义" }] };
    await db.domain.update({ where: { id: "domain-a" }, data: { learningGoalsJson: JSON.stringify(goals) } });
    await db.unit.update({ where: { id: "unit-a" }, data: { planningBlueprintJson: JSON.stringify([{ key: "m", keyQuestions: [{ key: "q", contentQuestionKey: "shared" }] }]) } });
    await db.learningNode.update({ where: { id: "node-a" }, data: { planningQuestionKeysJson: JSON.stringify(["q"]), conceptJson: JSON.stringify({ name: "极限", scope: "定义", learningUnit }) } });
    await fresh();
    expect(dependencies.prepare.mock.calls[0][0].context.contentQuestions).toEqual([{ ...question, contentRequirements: ["解释极限"], dimensionKeys: ["definition"], requirementIndices: [0], contribution: "本课只解释定义" }]);
    expect(JSON.parse((await db.domain.findUniqueOrThrow({ where: { id: "domain-a" } })).learningGoalsJson!)).toEqual(goals);
  });

  it("persists course foundations and teaching references without adding dependencies or mastery", async () => {
    const knowledgeBoundary = { version: 1, assumedKnowledge: ["高中函数"], newKnowledge: ["极限"] };
    const learningUnit = { version: 1, newKnowledge: "极限描述趋近", assumedKnowledge: ["高中函数"], teachingTasks: ["解释趋近"], example: "x趋近0", references: [{ key: "continuity", purpose: "比较条件" }] };
    await db.domain.update({ where: { id: "domain-a" }, data: { courseDesignDraft: JSON.stringify({ knowledgeBoundary }) } });
    await db.learningNode.update({ where: { id: "node-a" }, data: { conceptJson: JSON.stringify({ name: "极限", scope: "趋近", learningUnit }) } });
    await db.learningNode.create({ data: { id: "node-ref", domainId: "domain-a", unitId: "unit-a", mapKey: "continuity", title: "连续", orderIndex: 1 } });
    const session = await fresh();
    const context = dependencies.prepare.mock.calls[0][0].context;
    expect(context).toMatchObject({ knowledgeBoundary, node: { learningUnit }, relatedConcepts: [{ key: "continuity", nodeId: "node-ref", purpose: "比较条件" }], prerequisites: [] });
    const saved = await db.nodeTeachingSession.findUniqueOrThrow({ where: { id: session.id } });
    expect(JSON.parse(saved.contextJson!)).toMatchObject({ knowledgeBoundary, node: { learningUnit } });
    await getNodeTeaching("domain-a", "node-a");
    expect(dependencies.prepare).toHaveBeenCalledTimes(1);
    expect(await db.knowledgePoint.count()).toBe(0);
    await db.domain.update({ where: { id: "domain-a" }, data: { courseDesignDraft: JSON.stringify({ knowledgeBoundary: { ...knowledgeBoundary, assumedKnowledge: [] } }) } });
    expect((await getNodeTeaching("domain-a", "node-a")).session?.stale).toBe(true);
    expect((await db.nodeTeachingSession.findUniqueOrThrow({ where: { id: session.id } })).contextJson).toBe(saved.contextJson);
  });

  it("does not resolve teaching references from another domain", async () => {
    await db.learningNode.create({ data: { domainId: "domain-b", mapKey: "foreign", title: "其他课程", orderIndex: 0 } });
    await db.learningNode.update({ where: { id: "node-a" }, data: { conceptJson: JSON.stringify({ learningUnit: { version: 1, newKnowledge: "极限", assumedKnowledge: [], teachingTasks: ["解释"], example: "趋近0", references: [{ key: "foreign", purpose: "比较" }] } }) } });
    await expect(fresh()).rejects.toThrow("教学引用已变化");
    expect(dependencies.prepare).not.toHaveBeenCalled();
  });

  it("corrects old frameworks into a new version without changing old text or the official map", async () => {
    let original = await fresh();
    original = (await saveNodeTeachingProgress("domain-a", "node-a", { sessionId: original.id, revision: original.revision, action: "save_understanding", answer: "需要同时比较定义域与取值。" })).session!;
    const saved = await db.nodeTeachingSession.findUniqueOrThrow({ where: { id: original.id } });
    const updated = (await prepareNodeTeaching("domain-a", "node-a", { sessionId: original.id, revision: original.revision, requestId: "verify-original", verifyKnowledge: true })).session!;
    expect(updated.lessonVersion).toBe(2);
    expect(updated.framework).toEqual(correctedKnowledgeFramework);
    expect(updated.progress.understandingDraft).toBe(original.progress.understandingDraft);
    expect(updated.knowledge).toMatchObject({ correctedFromVersion: 1 });
    const old = await db.nodeTeachingSession.findUniqueOrThrow({ where: { id: original.id } });
    expect(old.lessonJson).toBe(saved.lessonJson);
    expect(old.progressJson).toBe(saved.progressJson);
    expect(old.status).toBe("needs_correction");
    expect(JSON.parse(old.reviewJson!).frameworkCorrection).toMatchObject({ targetSessionId: updated.id, status: "ready" });
    const historical = (await getNodeTeaching("domain-a", "node-a", old.id)).session!;
    expect(historical.historical).toBe(true);
    expect(historical.framework).toEqual(badKnowledgeFramework);
    expect(await db.knowledgePoint.count()).toBe(0);
    expect((await db.domain.findUniqueOrThrow({ where: { id: "domain-a" } })).mapRevision).toBe(0);
    expect(await db.$queryRawUnsafe("PRAGMA foreign_key_check")).toEqual([]);
    await prepareNodeTeaching("domain-a", "node-a", { sessionId: original.id, revision: original.revision, requestId: "verify-original", verifyKnowledge: true });
    await expect(prepareNodeTeaching("domain-a", "node-a", { sessionId: original.id, revision: original.revision, requestId: "verify-original", verifyKnowledge: true, concern:"跳转之后不能偷换疑点" })).rejects.toThrow("同一请求不能更换");
    expect(dependencies.check).toHaveBeenCalledTimes(1);
    expect(await db.nodeTeachingSession.count()).toBe(2);
  });

  it("checks a supplied concern independently without treating it as an instruction to rewrite", async () => {
    const original = await fresh();
    const concern = "请核对该说法；这是待验证的反例，不代表已经证实错误。";
    dependencies.check.mockImplementationOnce(async input => ({data:knowledgeResult(input.framework,input.context,[]),aiCallLogIds:["concern-check"]}));
    const checked = (await prepareNodeTeaching("domain-a", "node-a", {sessionId:original.id,revision:original.revision,requestId:"specific-concern",verifyKnowledge:true,concern})).session!;
    expect(dependencies.check.mock.calls.at(-1)![0].concern).toBe(concern);
    expect(checked.id).toBe(original.id);
    expect(checked.framework).toEqual(original.framework);
    expect(await db.nodeTeachingSession.count()).toBe(1);
    await expect(prepareNodeTeaching("domain-a", "node-a", {sessionId:checked.id,revision:checked.revision,requestId:"oversized-concern",verifyKnowledge:true,concern:"x".repeat(4001)})).rejects.toThrow();
    expect(dependencies.check).toHaveBeenCalledTimes(1);
  });

  it("checks the current segment on explicit concern and retains the original material", async () => {
    let original = await fresh();
    original = (await prepareTeachingSegment("domain-a", "node-a", "encounter", {sessionId:original.id,revision:original.revision,requestId:"published-material"})).session!;
    const old = await db.teachingSegment.findFirstOrThrow({where:{sessionId:original.id,status:"ready"}});
    const concern = "请检查现有正文里的反例。";
    await expect(prepareTeachingSegment("domain-a", "node-a", "encounter", {sessionId:original.id,revision:original.revision,requestId:"implicit-concern",concern})).rejects.toThrow("显式重新准备");
    await prepareTeachingSegment("domain-a", "node-a", "encounter", {sessionId:original.id,revision:original.revision,requestId:"explicit-concern",reprepare:true,concern});
    expect(dependencies.prepare.mock.calls.at(-1)![0]).toMatchObject({concern,resumeMaterial:JSON.parse(old.materialJson!)});
    expect(await db.teachingSegment.findUniqueOrThrow({where:{id:old.id}})).toEqual(old);
    expect(await db.teachingSegment.count()).toBe(2);
  });

  it.each(["failed","pending"])("resumes a saved %s candidate without losing its concern or inheriting changed answer exposure", async status => {
    let original=await fresh();
    original=(await prepareTeachingSegment("domain-a","node-a","encounter",{sessionId:original.id,revision:original.revision,requestId:"published"})).session!;
    const old=await db.teachingSegment.findFirstOrThrow({where:{sessionId:original.id,status:"ready"}});
    original=(await saveNodeTeachingProgress("domain-a","node-a",{sessionId:original.id,revision:original.revision,action:"solution",segmentId:old.id,stepKey:"encounter-step",exerciseKey:"compare-functions"})).session!;
    const revised=JSON.parse(old.materialJson!) as TeachingMaterial;
    revised.steps[0].explanation="已修正的讲解，等待独立复核。";
    revised.steps[0].activities[0].answer="已修正的解答，原解答的查看记录不能承接。";
    const concern="核对原材料中的必要条件及这个反例。";
    dependencies.prepare.mockImplementationOnce(async input=>{
      const pending=await db.teachingSegment.findFirstOrThrow({where:{sessionId:original.id,requestId:"retry-concern"}});
      expect(JSON.parse(pending.reviewJson!).preparationRequest).toMatchObject({concern,reprepare:true,sourceMaterialId:old.id});
      await input.checkpoint(["partial-check"],revised,report(input.framework,input.context));
      throw new Error("connection interrupted");
    });
    await prepareTeachingSegment("domain-a","node-a","encounter",{sessionId:original.id,revision:original.revision,requestId:"retry-concern",reprepare:true,concern});
    if(status==="pending") await db.teachingSegment.updateMany({where:{sessionId:original.id,requestId:"retry-concern"},data:{status,updatedAt:new Date(Date.now()-240000)}});
    const calls=dependencies.prepare.mock.calls.length;
    const restored=(await getNodeTeaching("domain-a","node-a")).session!;
    const failed=restored.segments.find(s=>s.requestId==="retry-concern")!;
    expect(failed).toMatchObject({status,request:{concern,reprepare:true,sourceMaterialId:old.id}});
    expect(dependencies.prepare).toHaveBeenCalledTimes(calls);
    const binding={sessionId:restored.id,revision:restored.revision,requestId:failed.requestId};
    await expect(prepareTeachingSegment("domain-a","node-a","encounter",{...binding,reprepare:true,concern:"改成另一个问题"})).rejects.toThrow("同一请求不能更换");
    const completed=(await prepareTeachingSegment("domain-a","node-a","encounter",binding)).session!;
    expect(dependencies.prepare.mock.calls.at(-1)![0]).toMatchObject({concern,resumeMaterial:revised,resumeCallIds:expect.arrayContaining(["partial-check"])});
    expect(completed.segments.find(s=>s.id===failed.id)).toMatchObject({status:"ready",request:{concern,reprepare:true}});
    expect(completed.progress.support[activityBinding(failed.id,"encounter-step","compare-functions")]).toBeUndefined();
    expect(completed.progress.support[activityBinding(old.id,"encounter-step","compare-functions")].solution).toBe(true);
    expect(await db.teachingSegment.findUniqueOrThrow({where:{id:old.id}})).toEqual(old);
    await expect(prepareTeachingSegment("domain-a","node-a","encounter",{...binding,concern:""})).rejects.toThrow("同一请求不能更换");
    expect(await db.teachingSegment.count()).toBe(2);
  });

  it("does not reuse an old-source candidate after consecutive interrupted retries", async () => {
    let original=await fresh();
    original=(await prepareTeachingSegment("domain-a","node-a","encounter",{sessionId:original.id,revision:original.revision,requestId:"source-published"})).session!;
    const old=await db.teachingSegment.findFirstOrThrow({where:{sessionId:original.id,status:"ready"}});
    const candidate=JSON.parse(old.materialJson!) as TeachingMaterial;candidate.steps[0].summary="先前来源下的候选";
    const binding={sessionId:original.id,revision:original.revision,requestId:"source-retry",reprepare:true,concern:"核对来源对应的结论"};
    dependencies.prepare.mockImplementationOnce(async input=>{await input.checkpoint(["old-source-check"],candidate);throw new Error("interrupted");});
    await prepareTeachingSegment("domain-a","node-a","encounter",binding);
    await db.nodeTeachingSession.update({where:{id:original.id},data:{sourceRevision:{increment:1}}});
    dependencies.prepare.mockRejectedValueOnce(new Error("interrupted before a new candidate"));
    await prepareTeachingSegment("domain-a","node-a","encounter",binding);
    expect(dependencies.prepare.mock.calls.at(-1)![0].resumeMaterial).toEqual(JSON.parse(old.materialJson!));
    const saved=await db.teachingSegment.findFirstOrThrow({where:{sessionId:original.id,requestId:binding.requestId}});
    expect(saved.sourceRevision).toBe(1);
    expect(JSON.parse(saved.reviewJson!).candidateSourceRevision).toBe(0);
    expect(JSON.parse(saved.materialJson!)).toEqual(candidate);
    await prepareTeachingSegment("domain-a","node-a","encounter",binding);
    expect(dependencies.prepare.mock.calls.at(-1)![0].resumeMaterial).toEqual(JSON.parse(old.materialJson!));
  });

  it("does not reuse another request's failed candidate", async () => {
    let original=await fresh();
    original=(await prepareTeachingSegment("domain-a","node-a","encounter",{sessionId:original.id,revision:original.revision,requestId:"other-published"})).session!;
    const old=await db.teachingSegment.findFirstOrThrow({where:{sessionId:original.id,status:"ready"}});
    const candidate=JSON.parse(old.materialJson!) as TeachingMaterial;candidate.steps[0].summary="另一请求的候选";
    dependencies.prepare.mockImplementationOnce(async input=>{await input.checkpoint(["other-check"],candidate);throw new Error("interrupted");});
    const binding={sessionId:original.id,revision:original.revision,reprepare:true,concern:"核对该正文"};
    await prepareTeachingSegment("domain-a","node-a","encounter",{...binding,requestId:"previous-request"});
    const previous=await db.teachingSegment.findFirstOrThrow({where:{sessionId:original.id,requestId:"previous-request"}});
    await prepareTeachingSegment("domain-a","node-a","encounter",{...binding,requestId:"new-request"});
    expect(dependencies.prepare.mock.calls.at(-1)![0].resumeMaterial).toEqual(JSON.parse(old.materialJson!));
    expect(await db.teachingSegment.findUniqueOrThrow({where:{id:previous.id}})).toEqual(previous);
  });

  it("restores framework concern retries and retains previous request identity after later checks", async () => {
    const original=await fresh();const concern="这条全称命题有边界反例吗？";
    dependencies.check.mockRejectedValueOnce(new Error("connection interrupted"));
    const binding={sessionId:original.id,revision:original.revision,requestId:"retry-frame-concern",verifyKnowledge:true};
    await prepareNodeTeaching("domain-a","node-a",{...binding,concern});
    const restored=(await getNodeTeaching("domain-a","node-a")).session!;
    expect(restored.knowledge?.request).toEqual({requestId:binding.requestId,concern,status:"failed"});
    await expect(prepareNodeTeaching("domain-a","node-a",{...binding,concern:"另一个疑点"})).rejects.toThrow("同一请求不能更换");
    dependencies.check.mockImplementation(async input=>({data:knowledgeResult(input.framework,input.context,[]),aiCallLogIds:["checked"]}));
    await prepareNodeTeaching("domain-a","node-a",binding);
    expect(dependencies.check.mock.calls.at(-1)![0].concern).toBe(concern);
    await prepareNodeTeaching("domain-a","node-a",{...binding,requestId:"new-frame-concern",concern:"新疑点"});
    const saved=await db.nodeTeachingSession.findUniqueOrThrow({where:{id:original.id}});
    expect(JSON.parse(saved.reviewJson!).knowledgeRequests).toContainEqual({requestId:binding.requestId,concern,status:"complete"});
    const calls=dependencies.check.mock.calls.length;
    await prepareNodeTeaching("domain-a","node-a",binding);
    expect(dependencies.check).toHaveBeenCalledTimes(calls);
    await expect(prepareNodeTeaching("domain-a","node-a",{...binding,concern:""})).rejects.toThrow("同一请求不能更换");
  });

  it("allows an older failed segment without a request snapshot to record an explicit concern on retry", async () => {
    let original=await fresh();
    original=(await prepareTeachingSegment("domain-a","node-a","encounter",{sessionId:original.id,revision:original.revision,requestId:"older-published"})).session!;
    await db.teachingSegment.create({data:{sessionId:original.id,key:"encounter",version:2,requestId:"older-failed",status:"failed",reviewJson:JSON.stringify({summary:"早期失败报告"})}});
    const concern="为旧失败补录需要检查的反例。";
    const restored=(await prepareTeachingSegment("domain-a","node-a","encounter",{sessionId:original.id,revision:original.revision,requestId:"older-failed",reprepare:true,concern})).session!;
    expect(restored.segments.find(s=>s.requestId==="older-failed")).toMatchObject({status:"ready",request:{concern,reprepare:true}});
    expect(dependencies.prepare.mock.calls.at(-1)![0].concern).toBe(concern);
    expect(await db.teachingSegment.count()).toBe(2);
  });

  it("routes a segment's upstream fact error to the frame and resumes its correct candidate only once", async () => {
    const original = await fresh();
    dependencies.prepare.mockImplementationOnce(async input => {
      const material = materialFor(input.framework, input.segmentKey);
      const knowledge = knowledgeResult(input.framework, input.context, ["plan_discriminate"]);
      await input.checkpoint(["original-segment-log", "fact-origin-log"], material, report(input.framework, input.context, ["plan_discriminate"]));
      throw new FrameworkKnowledgeError(knowledge, ["original-segment-log", "fact-origin-log"], material);
    });
    const payload = { sessionId: original.id, revision: original.revision, requestId: "encounter-with-upstream-error" };
    const updated = (await prepareTeachingSegment("domain-a", "node-a", "encounter", payload)).session!;
    await expect(prepareTeachingSegment("domain-a","node-a","encounter",{...payload,reprepare:true,concern:"跳转之后不能偷换疑点"})).rejects.toThrow("同一请求不能更换");
    expect(updated.status).toBe("ready");
    expect(updated.lessonVersion).toBe(2);
    expect(updated.segments[0].status).toBe("ready");
    expect(dependencies.prepare.mock.calls.at(-1)![0].resumeMaterial).toEqual(materialFor(badKnowledgeFramework, "encounter"));
    expect(dependencies.prepare.mock.calls.at(-1)![0].resumeCallIds).toContain("original-segment-log");
    const oldSegment = await db.teachingSegment.findFirstOrThrow({ where: { sessionId: original.id } });
    expect(oldSegment.status).toBe("failed");
    expect(JSON.parse(oldSegment.materialJson!)).toEqual(materialFor(badKnowledgeFramework, "encounter"));
    const calls = dependencies.prepare.mock.calls.length;
    await prepareTeachingSegment("domain-a", "node-a", "encounter", payload);
    expect(dependencies.prepare).toHaveBeenCalledTimes(calls);
    expect(await db.nodeTeachingSession.count()).toBe(2);
  });

  it("keeps a failed correction resumable and never falls back to the known erroneous old frame", async () => {
    const original = await fresh();
    dependencies.prepare.mockRejectedValueOnce(new Error("provider failed during patch"));
    const failed = (await prepareNodeTeaching("domain-a", "node-a", { sessionId: original.id, revision: original.revision, requestId: "failed-correction", verifyKnowledge: true })).session!;
    expect(failed.status).toBe("failed");
    expect(failed.framework).toBeNull();
    expect((await db.nodeTeachingSession.findUniqueOrThrow({ where: { id: original.id } })).status).toBe("needs_correction");
    const draft = (await saveNodeTeachingProgress("domain-a", "node-a", { sessionId: failed.id, revision: failed.revision, action: "save_understanding", answer: "修复期间保留的个人理解" })).session!;
    const recovered = (await prepareNodeTeaching("domain-a", "node-a", { sessionId: draft.id, revision: draft.revision, requestId: "retry-correction" })).session!;
    expect(recovered.id).toBe(failed.id);
    expect(recovered.status).toBe("ready");
    expect(recovered.progress.understandingDraft).toBe("修复期间保留的个人理解");
    expect(dependencies.prepare.mock.calls.at(-1)![0].frameworkCorrection.baseline).toEqual(badKnowledgeFramework);
    expect(await db.nodeTeachingSession.count()).toBe(2);
  });

  it("rechecks and reuses correct old material while retaining drafts, viewed help and old interactions", async () => {
    let original = await fresh();
    original = (await prepareTeachingSegment("domain-a", "node-a", "encounter", { sessionId: original.id, revision: original.revision, requestId: "old-material" })).session!;
    const oldSegmentId = original.segments[0].id;
    const storedMaterial = JSON.parse((await db.teachingSegment.findUniqueOrThrow({ where: { id: oldSegmentId } })).materialJson!);
    storedMaterial.steps = storedMaterial.steps.map((step: object) => Object.fromEntries(Object.entries(step).reverse()));
    await db.teachingSegment.update({ where: { id: oldSegmentId }, data: { materialJson: JSON.stringify(storedMaterial) } });
    for (const action of ["navigate", "save_answer", "hint", "solution", "skip"] as const) {
      original = (await saveNodeTeachingProgress("domain-a", "node-a", { sessionId: original.id, revision: original.revision, action, segmentId: oldSegmentId, stepKey: "encounter-step", exerciseKey: "compare-functions", answer: "我先检查分母。" })).session!;
    }
    original = (await submitTeachingInteraction("domain-a", "node-a", { sessionId: original.id, revision: original.revision, requestId: "old-answer", kind: "answer", segmentId: oldSegmentId, stepKey: "encounter-step", exerciseKey: "compare-functions", input: "定义域相同，取值也相同。" })).session!;
    const oldInteraction = await db.teachingInteraction.findFirstOrThrow();
    const oldProgress = (await db.nodeTeachingSession.findUniqueOrThrow({ where: { id: original.id } })).progressJson;
    const corrected = (await prepareNodeTeaching("domain-a", "node-a", { sessionId: original.id, revision: original.revision, requestId: "fix-old-material-frame", verifyKnowledge: true })).session!;
    const resumed = (await prepareTeachingSegment("domain-a", "node-a", "encounter", { sessionId: corrected.id, revision: corrected.revision, requestId: "check-old-material" })).session!;
    const newSegment = resumed.segments[0];
    const binding = activityBinding(newSegment.id, "encounter-step", "compare-functions");
    expect(resumed.progress.drafts[binding]).toBe("定义域相同，取值也相同。");
    expect(resumed.progress.support[binding]).toEqual({ hints: 1, solution: true });
    expect(resumed.progress.skipped).toContain(`${newSegment.id}:encounter-step`);
    expect(resumed.progress.visited).toContain(newSegment.id);
    expect(resumed.progress.segmentId).toBe(newSegment.id);
    expect(resumed.summary.taught[0].segmentId).toBe(newSegment.id);
    expect(await db.teachingInteraction.findUniqueOrThrow({ where: { id: oldInteraction.id } })).toEqual(oldInteraction);
    expect((await db.nodeTeachingSession.findUniqueOrThrow({ where: { id: original.id } })).progressJson).toBe(oldProgress);
    expect(await db.teachingInteraction.count()).toBe(1);
    expect(newSegment.material?.steps[0].activities[0].solution).not.toBeNull();
  });

  it("does not transfer hidden answer exposure when the step was substantively revised", async () => {
    let original = await fresh();
    original = (await prepareTeachingSegment("domain-a", "node-a", "encounter", { sessionId: original.id, revision: original.revision, requestId: "old-question" })).session!;
    original = (await saveNodeTeachingProgress("domain-a", "node-a", { sessionId: original.id, revision: original.revision, action: "solution", segmentId: original.segments[0].id, stepKey: "encounter-step", exerciseKey: "compare-functions" })).session!;
    const corrected = (await prepareNodeTeaching("domain-a", "node-a", { sessionId: original.id, revision: original.revision, requestId: "fix-before-new-question", verifyKnowledge: true })).session!;
    dependencies.prepare.mockImplementationOnce(async input => {
      const data = structuredClone(input.resumeMaterial as TeachingMaterial);
      data.steps[0].activities[0].prompt = "针对另一个实际问题重新说明。";
      return { data, callIds: ["revised-step-log"], review: { ...report(input.framework, input.context), reusedMaterial: true } };
    });
    const revised = (await prepareTeachingSegment("domain-a", "node-a", "encounter", { sessionId: corrected.id, revision: corrected.revision, requestId: "changed-step" })).session!;
    expect(revised.segments[0].material?.steps[0].activities[0].solution).toBeNull();
    expect(Object.keys(revised.progress.support)).toHaveLength(0);
  });

  it("rejects a stale knowledge result after source revision changes and retains its call reference", async () => {
    const original = await fresh();
    dependencies.check.mockImplementationOnce(async input => {
      await db.nodeTeachingSession.update({ where: { id: original.id }, data: { sourceRevision: { increment: 1 } } });
      return { data: knowledgeResult(input.framework, input.context, ["plan_discriminate"]), aiCallLogIds: ["stale-knowledge-log"] };
    });
    const result = (await prepareNodeTeaching("domain-a", "node-a", { sessionId: original.id, revision: original.revision, requestId: "source-changing-check", verifyKnowledge: true })).session!;
    expect(result.error).toContain("不能覆盖新框架");
    expect(result.lessonVersion).toBe(1);
    const saved = await db.nodeTeachingSession.findUniqueOrThrow({ where: { id: original.id } });
    expect(saved.lessonJson).toBe(JSON.stringify(badKnowledgeFramework));
    expect(JSON.parse(saved.aiCallLogIdsJson!)).toContain("stale-knowledge-log");
    expect(JSON.parse(saved.reviewJson!).knowledgeRequest.status).toBe("failed");
  });

  it("fences late feedback after correction, retaining the input with its original material version", async () => {
    let original = await fresh();
    original = (await prepareTeachingSegment("domain-a", "node-a", "encounter", { sessionId: original.id, revision: original.revision, requestId: "material-before-feedback" })).session!;
    let finish!: (result: { data: TeachingReplyV2; log: { id: string } }) => void;
    dependencies.respond.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = submitTeachingInteraction("domain-a", "node-a", { sessionId: original.id, revision: original.revision, requestId: "late-feedback", kind: "answer", segmentId: original.segments[0].id, stepKey: "encounter-step", exerciseKey: "compare-functions", input: "我的原始回答。" });
    await vi.waitFor(() => expect(dependencies.respond).toHaveBeenCalledTimes(1));
    const active = (await getNodeTeaching("domain-a", "node-a")).session!;
    await prepareNodeTeaching("domain-a", "node-a", { sessionId: active.id, revision: active.revision, requestId: "correct-during-feedback", verifyKnowledge: true });
    finish({ data: reply, log: { id: "late-response-log" } });
    await pending;
    const saved = await db.teachingInteraction.findFirstOrThrow();
    expect(saved.input).toBe("我的原始回答。");
    expect(saved.sessionId).toBe(original.id);
    expect(saved.materialVersion).toBe(1);
    expect(saved.status).toBe("failed");
    expect(saved.responseJson).toBeNull();
  });

  it("keeps reads AI-free and rejects foreign-domain correction requests", async () => {
    const original = await fresh();
    await getNodeTeaching("domain-a", "node-a");
    expect(dependencies.check).not.toHaveBeenCalled();
    await expect(prepareNodeTeaching("domain-b", "node-a", { sessionId: original.id, revision: original.revision, requestId: "foreign-correction", verifyKnowledge: true })).rejects.toMatchObject({ status: 404 });
    await expect(prepareTeachingSegment("domain-b", "node-a", "encounter", { sessionId: original.id, revision: original.revision, requestId: "foreign-segment" })).rejects.toMatchObject({ status: 404 });
    expect(await db.nodeTeachingSession.count()).toBe(1);
  });
});
