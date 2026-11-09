import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { acceptLearningAction, addLearningSource, createLearningSession, getLearningSession, prepareLearningSegment, prepareLearningSession, reviewLearningContent, saveLearningProgress, submitLearningInteraction } from "./learningSessionService";
import type { LearningFramework, LearningMaterial, LearningReply, LearningView } from "./flexibleTeaching";
import type { SourceFragment } from "./teachingContracts";
import { selectInteractionSources } from "./learningInteractionEvidence";
import { AiLogPersistenceError } from "../ai/generationEvidence";

const deps = vi.hoisted(() => ({ client: null as PrismaClient | null, run: vi.fn() }));
vi.mock("../prisma", () => ({ get prisma() { return deps.client!; } }));
vi.mock("../ai/tutorService", () => ({ runJsonTask: deps.run }));
type Task = { taskType: string; userPrompt: string; validate: (value: unknown) => unknown };
let root: string, db: PrismaClient, candidate: (task: Task) => unknown | Promise<unknown>;
const frame: LearningFramework = { schemaVersion: 4, title: "条件讨论", purpose: "说明条件", scope: "当前题目", mainIdea: "按本题条件判断", prerequisites: [], limitations: [], segments: [{ key: "part", title: "当前部分", goal: "比较条件", steps: [{ key: "step", goal: "比较条件", requiredOutput: "none" }] }] };
const material: LearningMaterial = { schemaVersion: 4, title: "条件讨论", summary: "根据原题", limitations: [], steps: [{ key: "step", goal: "比较条件", explanation: "解释本题给定条件", example: "本题例子", basis: "source", sourceIds: ["bound-source"], activities: [{ key: "activity", kind: "comparison", prompt: "原题明确规定 g(x)=0，如何求复合结果？", answer: "这是可能有误的服务端参考", criteria: ["按原题实际定义计算"], hints: ["先看内层具体取值"], required: true }] }] };
const source = (id: string, text: string): SourceFragment => ({ id, text, title: "原资料", url: "https://example.edu/conditions", location: id, contentHash: id + "-hash" });
const boundSource = source("bound-source", "BOUND_SNAPSHOT_原始条件正文");
const validReview = () => ({ verdict: "no_error_found", summary: "协议夹具，不是教学效果证据", uncertainty: null, findings: [], replacement: null });
const reply = (): LearningReply => ({ text: "需要重新核对这个条件。", observation: "旧观察断言用户不懂", uncertainty: null, verdict: "needs_work", action: { type: "clarify", reason: "说明当前困难" } });
const jsonLine = (prompt: string, label: string) => {
    const line = prompt.split("\n").find(value => value.startsWith(label));
    if (!line) throw new Error("Missing prompt section: " + label);
    return JSON.parse(line.slice(label.length));
};
const generationEvidence = (prompt: string) => jsonLine(prompt, "当次只读证据（生成与核对共用；参考不是真值）：");
const feedbackReviewCandidate = (prompt: string) => JSON.parse(prompt.split("当前候选反馈（唯一可替换对象）：")[1].split("\n")[0]);
const reviewContext = (prompt: string) => prompt.includes("当次只读交互证据及真实范围：") ? { ...jsonLine(prompt,"当次只读交互证据及真实范围："),feedbackCandidate:feedbackReviewCandidate(prompt) } : jsonLine(prompt, "其他上下文（只读对照）：");
const reviewSources = (prompt: string) => jsonLine(prompt,prompt.includes("实际资料片段：")?"实际资料片段：":"实际资料：");

beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "englishnode-interaction-evidence-"));
    const filename = path.join(root, "learning.db");
    fs.copyFileSync(path.resolve("prisma/seed.db"), filename);
    db = new PrismaClient({ datasources: { db: { url: `file:${filename.replace(/\\/g, "/")}` } } });
    deps.client = db;
});
afterAll(async () => {
    await db?.$disconnect();
    if (root && path.dirname(root) === path.resolve(os.tmpdir())) fs.rmSync(root, { recursive: true, force: true });
});
beforeEach(async () => {
    await db.teachingInteraction.deleteMany();
    await db.teachingSegment.deleteMany();
    await db.nodeTeachingSession.deleteMany();
    await db.learningProgress.deleteMany();
    await db.learningNode.deleteMany();
    await db.domain.deleteMany();
    await db.aiCallLog.deleteMany();
    candidate = task => task.taskType === "node_knowledge_check" ? validReview() : reply();
    deps.run.mockReset().mockImplementation(async (task: Task) => {
        const log = await db.aiCallLog.create({ data: { taskType: task.taskType, provider: "protocol-fixture", status: "pending", requestMessagesJson: JSON.stringify([{ role: "user", content: task.userPrompt }]) } });
        try {
            const raw = await candidate(task);
            await db.aiCallLog.update({where:{id:log.id},data:{rawOutput:JSON.stringify(raw),parsedOutputJson:JSON.stringify(raw)}});
            const data = task.validate(raw);
            const saved = await db.aiCallLog.update({ where: { id: log.id }, data: { status: "success", rawOutput: JSON.stringify(raw), parsedOutputJson: JSON.stringify(raw), validatedOutputJson: JSON.stringify(data) } });
            return { data, log: saved, aiCallLogIds: [saved.id] };
        } catch (error) {
            await db.aiCallLog.update({ where: { id: log.id }, data: { status: "failed", errorMessage: (error as Error).message } });
            throw Object.assign(error as Error, { aiCallLogId: log.id });
        }
    });
});
async function ready(withMaterial = true) {
    let s = (await createLearningSession({ requestId: "create", question: "比较条件" })).session;
    await db.nodeTeachingSession.update({ where: { id: s.id }, data: { status: "ready", lessonJson: JSON.stringify(frame), lessonVersion: 1 } });
    if (withMaterial) await db.teachingSegment.create({ data: { id: "segment", sessionId: s.id, key: "l1--part", status: "ready", requestId: "material", version: 1, materialJson: JSON.stringify(material), sourceSnapshotJson: JSON.stringify([boundSource]) } });
    s = (await getLearningSession(s.id)).session;
    return s;
}
const binding = { segmentId: "segment", stepKey: "step", exerciseKey: "activity", materialVersion: 1 };
const request = (s: LearningView) => ({ requestId: "answer", revision: s.revision, kind: "answer", input: "我根据边界条件认为应当用原题的具体取值。", ...binding });

describe("当次证据：真实隔离 SQLite，模型仅为协议夹具", () => {
    it("绑定快照优先、原题和提交时帮助同时到达生成及核对，调用期间资料变化不替换本轮依据", async () => {
        let s = await ready();
        const added = source("relevant", "边界条件的补充正文");
        await db.teachingSource.create({ data: { sessionId: s.id, url: "pasted:fixture", title: "资料", contentHash: "pool", fragmentsJson: JSON.stringify([source("bound-source", "同ID的新正文不得替代旧快照"), added, source("irrelevant", "banana orchard")]) } });
        s = (await saveLearningProgress(s.id, { revision: s.revision, action: "hint", ...binding })).session;
        candidate = async task => {
            if (task.taskType === "node_knowledge_check") return validReview();
            await db.teachingSource.updateMany({ data: { fragmentsJson: JSON.stringify([source("later", "边界条件：调用期间追加的资料")]) } });
            return reply();
        };
        const result = (await submitLearningInteraction(s.id, request(s))).session;
        const generation = generationEvidence(deps.run.mock.calls[0][0].userPrompt), review = reviewContext(deps.run.mock.calls[1][0].userPrompt);
        expect(review.currentInteraction).toEqual(generation);
        expect(generation).toMatchObject({ kind: "answer", input: request(s).input, assistanceAtSubmission: 1, currentExposure: { hints: 1, solution: false }, binding: { ...binding, requiredOutput: "none", activity: material.steps[0].activities[0] } });
        expect(generation.binding.step.activities[0].required).toBe(true);
        expect(generation.referenceStatus).toContain("参考回应和提示也可能有错");
        expect(generation.sources).toEqual([boundSource, added]);
        expect(reviewSources(deps.run.mock.calls[1][0].userPrompt)).toEqual(generation.sources);
        expect(review.feedbackCandidate).toEqual(reply());
        expect(result.interactions[0].assistance).toBe(1);
    });

    it("失败同号重试不把后来查看解答改写为回答提交时已经曝光", async () => {
        let s = await ready();
        candidate = () => { throw new Error("连接中断"); };
        const original = request(s);
        s = (await submitLearningInteraction(s.id, original)).session;
        expect(s.interactions[0].assistance).toBe(0);
        s = (await saveLearningProgress(s.id, { revision: s.revision, action: "solution", ...binding })).session;
        candidate = task => task.taskType === "node_knowledge_check" ? validReview() : reply();
        deps.run.mockClear();
        s = (await submitLearningInteraction(s.id, { ...original, revision: s.revision, retry: true })).session;
        const evidence = generationEvidence(deps.run.mock.calls[0][0].userPrompt);
        expect(evidence.assistanceAtSubmission).toBe(0);
        expect(evidence.currentExposure.solution).toBe(true);
        expect(evidence.currentExposureTiming).toContain("原回答提交之后");
        expect(reviewContext(deps.run.mock.calls[1][0].userPrompt).currentInteraction).toEqual(evidence);
        expect(s.interactions).toHaveLength(1);
        expect(s.interactions[0].assistance).toBe(0);
    });

    it.each(["text", "activity", "metadata", "question"])("%s完整更正后再次核对才恢复一致判分；结构失败与更正共用预算和原始证据", async mode => {
        const s = await ready();
        const initial = { ...reply(), text: "旧反馈错误", action: { type: "activity" as const, reason: "旧错误诊断要求补讲" }, newActivity: { title: "旧诊断补讲", explanation: "旧活动解释", activity: { kind: "comparison" as const, key: "", prompt: "补充比较", answer: "错误活动参考", criteria: ["比较条件"], hints: ["检查定义"], required: false } } };
        let reviews = 0;
        candidate = task => {
            if (task.taskType !== "node_knowledge_check") return initial;
            reviews += 1;
            if (reviews === 1) return {};
            if (reviews === 2) {
                const before=feedbackReviewCandidate(task.userPrompt),field=mode==="activity"?"newActivity":mode==="metadata"?"verdict":"text";
                return { verdict: "confirmed_error", summary: "夹具确认一处错误", uncertainty: null, findings: [{field,quote:typeof before[field]==="string"?before[field]:JSON.stringify(before[field]),reason:"按原题与用户原话修正"}],replacement:{text:field==="text"?"更正后的反馈":before.text,observation:"已按本次原话修正观察",uncertainty:null,verdict:mode==="question"?null:"correct",action:{type:"clarify",reason:"修正后重新确认用户选择"}} };
            }
            return validReview();
        };
        const result = (await submitLearningInteraction(s.id, { ...request(s), kind: mode === "question" ? "question" : "answer" })).session;
        const response = result.interactions[0].response!;
        expect(response.verdict).toBe(mode === "question" ? null : "correct");
        expect(response.action).toEqual({ type: "clarify", reason: expect.any(String) });
        expect(response.observation).not.toContain("旧观察断言用户不懂");
        expect(response.uncertainty).toBeNull();
        expect(response.text).toBe(mode === "activity" || mode === "metadata" ? "旧反馈错误" : "更正后的反馈");
        expect(await db.teachingSegment.count()).toBe(1);
        expect(JSON.stringify(result.summary)).not.toContain("旧观察断言用户不懂");
        const calls = deps.run.mock.calls.map(([task]) => task as Task), original = generationEvidence(calls[0].userPrompt);
        for (const task of calls.slice(1)) expect(reviewContext(task.userPrompt).currentInteraction).toEqual(original);
        expect(calls).toHaveLength(4);
        const finalCandidate = reviewContext(calls[3].userPrompt).feedbackCandidate;
        expect(finalCandidate.text).toBe(response.text);
        expect(finalCandidate.verdict).toBe(response.verdict);
        expect(finalCandidate).not.toHaveProperty("newActivity");
    });

    it("失败分段同号重试同步来源快照和版本，保留原失败调用", async () => {
        let s = await ready(false);
        s = (await addLearningSource(s.id, { revision: s.revision, text: "比较条件：首次资料" })).session;
        candidate = () => { throw new Error("首次生成连接失败"); };
        s = (await prepareLearningSegment(s.id, "part", { requestId: "part-request", revision: s.revision })).session;
        const failed = await db.teachingSegment.findFirstOrThrow({ where: { sessionId: s.id } }), oldLog = await db.aiCallLog.findFirstOrThrow();
        s = (await addLearningSource(s.id, { revision: s.revision, text: "比较条件：重试补充资料" })).session;
        candidate = task => task.taskType === "node_knowledge_check" ? validReview() : { ...material, steps: material.steps.map(step => ({ ...step, basis: "derivation", sourceIds: [] })) };
        deps.run.mockClear();
        s = (await prepareLearningSegment(s.id, "part", { requestId: "part-request", revision: s.revision, retry: true })).session;
        const saved = await db.teachingSegment.findUniqueOrThrow({ where: { id: failed.id } });
        expect(saved.status).toBe("ready");
        expect(saved.version).toBe(failed.version);
        expect(saved.sourceRevision).toBe(failed.sourceRevision + 1);
        expect(saved.sourceSnapshotJson).toContain("重试补充资料");
        expect(failed.sourceSnapshotJson).not.toContain("重试补充资料");
        expect(jsonLine(deps.run.mock.calls[0][0].userPrompt, "资料：")).toEqual(JSON.parse(saved.sourceSnapshotJson));
        expect(jsonLine(deps.run.mock.calls[1][0].userPrompt, "实际资料：")).toEqual(JSON.parse(saved.sourceSnapshotJson));
        expect(await db.aiCallLog.findUnique({ where: { id: oldLog.id } })).toEqual(oldLog);
        expect(s.segments).toHaveLength(1);
    });

    it("重新备课核对使用生成当次的新任务范围和关注点，不读取旧会话上下文", async () => {
        await db.domain.create({ data: { id: "domain", name: "数学", goal: "比较条件" } });
        await db.learningNode.create({ data: { id: "node", domainId: "domain", title: "原节点", objective: "旧目标", orderIndex: 0 } });
        let s = (await createLearningSession({ requestId: "node-create", domainId: "domain", nodeId: "node" })).session;
        await db.nodeTeachingSession.update({ where: { id: s.id }, data: { status: "ready", lessonJson: JSON.stringify(frame) } });
        await db.learningNode.update({ where: { id: "node" }, data: { objective: "本次新目标" } });
        candidate = task => task.taskType === "node_knowledge_check" ? validReview() : frame;
        s = (await prepareLearningSession(s.id, { requestId: "reprepare", revision: s.revision, reprepare: true, concern: "本次明确关注点" })).session;
        const context = jsonLine(deps.run.mock.calls[0][0].userPrompt, "上下文：");
        expect(context.task.objective).toBe("本次新目标");
        expect(context.focus).toContain("本次明确关注点");
        expect(reviewContext(deps.run.mock.calls[1][0].userPrompt)).toEqual(context);
        expect(s.context.task?.objective).toBe("本次新目标");
    });

    it("手动反馈更正共用原始证据，原文可回看而旧判分和动作不可继续执行", async () => {
        let s = await ready();
        candidate = task => task.taskType === "node_knowledge_check" ? validReview() : { ...reply(), action: { type: "step", reason: "原错误判断要求重复学习", segmentId: "segment", stepKey: "step", materialVersion: 1 } };
        s = (await submitLearningInteraction(s.id, request(s))).session;
        const original = await db.teachingInteraction.findFirstOrThrow(), originalSegment = await db.teachingSegment.findUniqueOrThrow({where:{id:"segment"}});
        let checks = 0;
        candidate = () => ++checks === 1 ? { verdict: "confirmed_error", summary: "原反馈误读本次回答", uncertainty: null, findings: [{ target: "feedback", interactionId: original.id, field: "text", quote: reply().text, replacement: "你的原始回答已按实际条件说明。", reason: "对照原题和用户原话" }] } : validReview();
        deps.run.mockClear();
        s = (await reviewLearningContent(s.id, {requestId:"manual-review",revision:s.revision,interactionId:original.id,concern:"请对照我原来的回答"})).session;
        const initialContext = reviewContext(deps.run.mock.calls[0][0].userPrompt), correctedContext = reviewContext(deps.run.mock.calls[1][0].userPrompt);
        expect(initialContext.currentInteraction.input).toBe(original.input);
        expect(initialContext.currentInteraction.binding.activity.prompt).toBe(material.steps[0].activities[0].prompt);
        expect(correctedContext.currentInteraction).toEqual(initialContext.currentInteraction);
        expect(correctedContext.feedbackCandidate.text).toBe("你的原始回答已按实际条件说明。");
        expect(correctedContext.feedbackCandidate.verdict).toBe("uncertain");
        const displayed = s.interactions[0];
        expect(displayed.correction?.text).toBe("你的原始回答已按实际条件说明。");
        expect(displayed.response?.text).toBe(reply().text);
        expect(displayed.response?.verdict).toBe("uncertain");
        expect(displayed.response?.action.type).toBe("clarify");
        expect(displayed.response?.observation).not.toContain("旧观察断言用户不懂");
        await expect(acceptLearningAction(s.id, original.id, {revision:s.revision})).rejects.toThrow("原建议已撤回");
        expect(await db.teachingInteraction.findUnique({where:{id:original.id}})).toEqual(original);
        expect(await db.teachingSegment.findUnique({where:{id:"segment"}})).toEqual(originalSegment);
    });

    it("手动核对历史互动恢复实际旧题与快照，不重绑同key的最新材料", async () => {
        let s = await ready();
        s = (await saveLearningProgress(s.id, {revision:s.revision,action:"hint",...binding})).session;
        s = (await submitLearningInteraction(s.id, request(s))).session;
        const original = await db.teachingInteraction.findFirstOrThrow();
        const nextMaterial = { ...material, steps: material.steps.map(step=>({...step,activities:step.activities.map(activity=>({...activity,prompt:"后来完全不同的新题",answer:"后来新参考"}))})) };
        await db.teachingSegment.create({data:{id:"new-segment",sessionId:s.id,key:"l1--part",version:2,status:"ready",requestId:"new-material",materialJson:JSON.stringify(nextMaterial),sourceSnapshotJson:JSON.stringify([source("bound-source","后来同ID新正文")])}});
        deps.run.mockClear();
        s = (await reviewLearningContent(s.id, {requestId:"historical-review",revision:s.revision,interactionId:original.id,concern:"检查以前那道题"})).session;
        const evidence = reviewContext(deps.run.mock.calls[0][0].userPrompt).currentInteraction;
        expect(evidence.binding).toMatchObject({segmentId:"segment",materialVersion:1,requiredOutput:"none"});
        expect(evidence.binding.activity.prompt).toBe(material.steps[0].activities[0].prompt);
        expect(evidence.assistanceAtSubmission).toBe(1);
        expect(evidence.sources).toEqual([boundSource]);
        expect(await db.teachingInteraction.findUnique({where:{id:original.id}})).toEqual(original);
        await expect(submitLearningInteraction(s.id,{...request(s),requestId:"cannot-rebind"})).rejects.toThrow("先前版本");
    });

    it("旧绑定无法恢复时明示缺失，不拿现存活动补造题目或帮助", async () => {
        let s = await ready();
        await db.teachingSegment.create({data:{id:"legacy-body",sessionId:s.id,key:"l1--historic",version:1,status:"ready",requestId:"legacy-body",materialJson:JSON.stringify({schemaVersion:2,legacyText:"旧格式没有可恢复的活动身份"})}});
        const original = await db.teachingInteraction.create({data:{sessionId:s.id,requestId:"missing-history",kind:"answer",input:"保留的原话",assistance:1,status:"complete",segmentId:"legacy-body",segmentKey:"l1--historic",stepKey:"step",exerciseKey:"activity",materialVersion:1,responseJson:JSON.stringify(reply())}});
        s = (await reviewLearningContent(s.id,{requestId:"missing-review",revision:s.revision,interactionId:original.id,concern:"核对历史回答"})).session;
        const evidence = reviewContext(deps.run.mock.calls[0][0].userPrompt).currentInteraction;
        expect(evidence).toMatchObject({input:"保留的原话",kind:"answer",assistanceAtSubmission:1,binding:null,currentExposure:null});
        expect(evidence.missingEvidence.join("\n")).toContain("未用当前材料或最新版本替代");
        expect(evidence.missingEvidence.join("\n")).toContain("不能据此推断提示条数");
        expect(await db.teachingInteraction.findUnique({where:{id:original.id}})).toEqual(original);
    });

    it("动态活动保存生成时的固定来源和修订，不取发布时的后来资料版本", async () => {
        let s = await ready();
        s = (await addLearningSource(s.id,{revision:s.revision,text:"比较条件：生成前资料"})).session;
        const before = await db.nodeTeachingSession.findUniqueOrThrow({where:{id:s.id}});
        candidate = async task => {
            if (task.taskType === "node_knowledge_check") return validReview();
            await db.nodeTeachingSession.update({where:{id:s.id},data:{sourceRevision:{increment:1}}});
            await db.teachingSource.updateMany({data:{fragmentsJson:JSON.stringify([source("later","比较条件：生成期间新资料")])}});
            return {...reply(),action:{type:"activity",reason:"补充比较"},newActivity:{title:"新增活动",explanation:"新讲解",activity:{kind:"comparison",prompt:"比较具体条件",answer:"按定义",criteria:["看条件"],hints:[],required:false}}};
        };
        s = (await submitLearningInteraction(s.id,request(s))).session;
        const dynamic = await db.teachingSegment.findFirstOrThrow({where:{sessionId:s.id,key:{startsWith:"feedback-"}}});
        expect(dynamic.sourceRevision).toBe(before.sourceRevision);
        expect(JSON.parse(dynamic.sourceSnapshotJson)).toEqual(generationEvidence(deps.run.mock.calls[0][0].userPrompt).sources);
        expect(dynamic.sourceSnapshotJson).not.toContain("生成期间新资料");
        expect((await db.nodeTeachingSession.findUniqueOrThrow({where:{id:s.id}})).sourceRevision).toBe(before.sourceRevision+1);
        const action = s.interactions[0].response!.action;
        candidate = task => task.taskType === "node_knowledge_check" ? validReview() : reply();
        deps.run.mockClear();
        s = (await submitLearningInteraction(s.id,{...action,requestId:"dynamic-answer",revision:s.revision,kind:"answer",input:"这是我对新题的回答"})).session;
        const nextEvidence = generationEvidence(deps.run.mock.calls[0][0].userPrompt);
        expect(nextEvidence.binding.requiredOutput).toBeNull();
        for (const originalSource of JSON.parse(dynamic.sourceSnapshotJson)) expect(nextEvidence.sources).toContainEqual(originalSource);
        expect(nextEvidence.sourceLimitations).toContain("不表示片段证明了补讲结论");
        expect(s.interactions.find(item=>item.requestId==="dynamic-answer")?.status).toBe("complete");
    });

    it("同号重试取得新令牌后，旧生成晚到的框架更正不能写入或废弃新材料", async () => {
        let s = await ready(false);
        const generatedMaterial = (marker:string) => ({...material,steps:material.steps.map(step=>({...step,basis:"derivation",sourceIds:[],explanation:marker}))});
        let releaseOld: (value:unknown)=>void = () => undefined, notifyStarted:()=>void = () => undefined, generation = 0, oldReviews = 0;
        const started = new Promise<void>(resolve=>{notifyStarted=resolve;});
        candidate = task => {
            if (task.taskType === "node_segment_preparation") {
                generation += 1;
                if (generation === 1) return new Promise(resolve=>{releaseOld=resolve;notifyStarted();});
                return generatedMaterial("NEW_ATTEMPT");
            }
            if (task.userPrompt.includes("OLD_ATTEMPT") && ++oldReviews === 1) return {verdict:"confirmed_error",summary:"旧调用想更正核心",uncertainty:null,findings:[{target:"framework",field:"mainIdea",quote:frame.mainIdea,replacement:"旧调用给出的不同核心",reason:"协议夹具中的更正"}]};
            return validReview();
        };
        const pending = prepareLearningSegment(s.id,"part",{requestId:"racing-material",revision:s.revision});
        await started;
        s = (await getLearningSession(s.id)).session;
        s = (await prepareLearningSegment(s.id,"part",{requestId:"racing-material",revision:s.revision,retry:true})).session;
        const saved = await db.teachingSegment.findFirstOrThrow({where:{sessionId:s.id}}), before = await db.nodeTeachingSession.findUniqueOrThrow({where:{id:s.id}});
        expect(saved.status).toBe("ready");
        expect(saved.materialJson).toContain("NEW_ATTEMPT");
        releaseOld(generatedMaterial("OLD_ATTEMPT"));
        await pending;
        const after = await db.nodeTeachingSession.findUniqueOrThrow({where:{id:s.id}});
        expect(after.lessonJson).toBe(before.lessonJson);
        expect(after.lessonVersion).toBe(before.lessonVersion);
        expect(await db.teachingSegment.findUnique({where:{id:saved.id}})).toEqual(saved);
        expect(await db.aiCallLog.count({where:{taskType:"node_segment_preparation"}})).toBe(2);
    });

    it("完整核对第三次仍确认错误则不发布，不以新替换逃过总调用上限", async () => {
        const s=await ready();
        candidate=task=>{
            if(task.taskType!=="node_knowledge_check") return reply();
            const before=feedbackReviewCandidate(task.userPrompt);
            return {verdict:"confirmed_error",summary:"仍有错误",uncertainty:null,findings:[{field:"text",quote:before.text,reason:"本轮确认错误"}],replacement:{...before,text:before.text+"下一候选"}};
        };
        const result=(await submitLearningInteraction(s.id,request(s))).session;
        expect(result.interactions[0].status).toBe("failed");
        expect(result.interactions[0].response).toBeNull();
        expect(result.interactions[0].input).toBe(request(s).input);
        expect(await db.aiCallLog.count({where:{taskType:"node_knowledge_check"}})).toBe(3);
        expect(await db.teachingSegment.count()).toBe(1);
        for(const [task] of deps.run.mock.calls) expect(task.singleAttempt).toBe(true);
    });

    it("合同失败修原报告共三次，未核实反馈撤回判断和新活动且保留失败原文", async () => {
        const s=await ready();
        const initial={...reply(),action:{type:"activity",reason:"原建议"},newActivity:{title:"原新活动",explanation:"原解释",activity:{kind:"comparison",prompt:"原问题",answer:"原参考",criteria:["条件"],hints:[],required:false}}};
        candidate=task=>task.taskType==="node_knowledge_check"?{}:initial;
        const result=(await submitLearningInteraction(s.id,request(s))).session;
        expect(result.interactions[0]).toMatchObject({status:"complete",response:{text:initial.text,verdict:"uncertain",action:{type:"clarify"}}});
        expect(await db.teachingSegment.count()).toBe(1);
        const logs=await db.aiCallLog.findMany({where:{taskType:"node_knowledge_check"},orderBy:{createdAt:"asc"}});
        expect(logs).toHaveLength(3);
        expect(logs.every(log=>log.status==="failed"&&log.rawOutput==="{}")).toBe(true);
        for(const log of logs) expect(log.requestMessagesJson).toContain(result.interactions[0].id);
        expect(logs[1].requestMessagesJson).toContain("rawOutput");
    });

    it("有效替换后的合同耗尽可保留新候选待核实，不能沿用替换的判分行动", async () => {
        const s=await ready();let checks=0;
        candidate=task=>{
            if(task.taskType!=="node_knowledge_check") return reply();
            const before=feedbackReviewCandidate(task.userPrompt);
            return ++checks===1?{verdict:"confirmed_error",summary:"更正正文",uncertainty:null,findings:[{field:"text",quote:before.text,reason:"当前原文错误"}],replacement:{...before,text:"已改变的更正候选",verdict:"correct",observation:"替换候选的判断"}}:{};
        };
        const result=(await submitLearningInteraction(s.id,request(s))).session;
        expect(result.interactions[0]).toMatchObject({status:"complete",response:{text:"已改变的更正候选",verdict:"uncertain",action:{type:"clarify"}}});
        expect(result.interactions[0].response?.observation).not.toContain("替换候选的判断");
        expect(result.interactions[0].response?.uncertainty).toContain("更正候选未核实");
        expect(checks).toBe(3);
    });

    it.each(["no_error_found","uncertain","contract_failure"])("A→B→A后%s不能清除绑定当前候选的既有确定错误", async last => {
        const s=await ready();let checks=0;
        candidate=task=>{
            if(task.taskType!=="node_knowledge_check") return {...reply(),text:"候选A"};
            const before=feedbackReviewCandidate(task.userPrompt);
            checks+=1;
            if(checks<3)return{verdict:"confirmed_error",summary:"候选存在错误",uncertainty:null,findings:[{field:"text",quote:before.text,reason:"当前候选具体错误"}],replacement:{...before,text:checks===1?"候选B":"候选A"}};
            return last==="contract_failure"?{}:{...validReview(),verdict:last,uncertainty:last==="uncertain"?"尚未确定":null};
        };
        const result=(await submitLearningInteraction(s.id,request(s))).session;
        expect(result.interactions[0].status).toBe("failed");
        expect(result.interactions[0].response).toBeNull();
        expect(result.interactions[0].error).toContain("已确认且未解除");
        expect(checks).toBe(3);
    });

    it("已有失败日志的Provider中断立即延期判断，不发第二次核对调用", async () => {
        const s=await ready();
        candidate=task=>{if(task.taskType==="node_knowledge_check")throw new Error("Provider连接中断");return reply();};
        const result=(await submitLearningInteraction(s.id,request(s))).session;
        expect(result.interactions[0]).toMatchObject({status:"complete",response:{text:reply().text,verdict:"uncertain",action:{type:"clarify"}}});
        expect(await db.aiCallLog.count({where:{taskType:"node_knowledge_check",status:"failed"}})).toBe(1);
        expect(deps.run).toHaveBeenCalledTimes(2);
    });

    it("核对日志无法持久化时阻断发布，不能伪装成普通Provider延期判断", async () => {
        const s=await ready(),originalImplementation=deps.run.getMockImplementation()!;
        deps.run.mockImplementation(task=>task.taskType==="node_knowledge_check"?Promise.reject(new AiLogPersistenceError()):originalImplementation(task));
        const result=(await submitLearningInteraction(s.id,request(s))).session;
        expect(result.interactions[0].status).toBe("failed");
        expect(result.interactions[0].response).toBeNull();
        expect(result.interactions[0].error).toContain("无法保存 AI 生成记录");
        expect(await db.aiCallLog.count({where:{taskType:"node_knowledge_check"}})).toBe(0);
        expect(deps.run).toHaveBeenCalledTimes(2);
    });

    it.each(["uncertain","throw","later_noerror"])("手动确认原反馈错误后%s仍保留原文绑定错误并撤回旧判断动作", async mode => {
        let s=await ready();
        candidate=task=>task.taskType==="node_knowledge_check"?validReview():{...reply(),uncertainty:"错误旧归因：你已经看过解答",action:{type:"step",reason:"旧判断要求重复学习",segmentId:"segment",stepKey:"step",materialVersion:1}};
        s=(await submitLearningInteraction(s.id,request(s))).session;
        const original=await db.teachingInteraction.findFirstOrThrow();
        let checks=0;
        candidate=async task=>{
            checks+=1;
            if(checks===1){
                const now=await db.nodeTeachingSession.findUniqueOrThrow({where:{id:s.id}});
                await db.nodeTeachingSession.update({where:{id:s.id},data:{summaryJson:JSON.stringify({...JSON.parse(now.summaryJson),otherRetainedObservation:"核对期间的其他记录"})}});
                return{verdict:"confirmed_error",summary:"原反馈误读真实回答",uncertainty:null,findings:[{target:"feedback",interactionId:original.id,field:"text",quote:reply().text,reason:"原题与原话不支持该判断",replacement:"尚待核实的更正候选"}]};
            }
            if(mode==="throw"){
                const current=jsonLine(task.userPrompt,"当前核心解释：").mainIdea;
                return{verdict:"confirmed_error",summary:"候选仍有明确错误",uncertainty:null,findings:[{target:"framework",field:"mainIdea",quote:current,reason:"候选内容尚未修正",replacement:current+"再次改动"}]};
            }
            return{...validReview(),verdict:"uncertain",summary:"候选尚缺可靠依据",uncertainty:"未完成复核"};
        };
        s=(await reviewLearningContent(s.id,{revision:s.revision,requestId:"manual-known-error",interactionId:original.id,concern:"对照我的实际原话"})).session;
        if(mode==="later_noerror"){
            candidate=()=>validReview();
            s=(await reviewLearningContent(s.id,{revision:s.revision,requestId:"later-noerror",interactionId:original.id,concern:"再次核对同一原文"})).session;
            expect((s.contentReview as {status:string}).status).toBe("failed");
            expect((s.contentReview as {error:string}).error).toContain("不能解除原错误");
        }
        const displayed=s.interactions.find(item=>item.id===original.id)!;
        expect(displayed.response).toMatchObject({text:reply().text,verdict:"uncertain",action:{type:"clarify"}});
        expect(displayed.response?.uncertainty).toContain("确定错误");
        expect(displayed.response?.uncertainty).not.toContain("你已经看过解答");
        expect(displayed.correction).toBeUndefined();
        const summary=s.summary as {contentReviewHistory:Record<string,unknown>[];feedbackCorrections?:unknown[];otherRetainedObservation:string};
        const retained=summary.contentReviewHistory.filter(entry=>entry.confirmedFeedbackError===true);
        expect(retained).toHaveLength(1);
        expect(retained[0]).toMatchObject({originRequestId:"manual-known-error",interactionId:original.id,verdict:"confirmed_error",correctionVerified:false,originalResponseDigest:expect.any(String),reviewedFeedbackDigest:expect.any(String),findings:[expect.objectContaining({target:"feedback",quote:reply().text})]});
        expect(summary.feedbackCorrections||[]).toHaveLength(0);
        expect(summary.otherRetainedObservation).toBe("核对期间的其他记录");
        expect(await db.teachingInteraction.findUnique({where:{id:original.id}})).toEqual(original);
        await expect(acceptLearningAction(s.id,original.id,{revision:s.revision})).rejects.toThrow("原建议已撤回");
        if(mode==="throw")expect((s.contentReview as {status:string}).status).toBe("failed");
    });
});

describe("当次来源选择", () => {
    it("保持真实ID、绑定片段正文和字符预算，不填无关历史", () => {
        const snapshot = [boundSource, source("too-large", "x".repeat(20001))];
        const result = selectInteractionSources(snapshot, ["bound-source", "too-large"], [source("bound-source", "条件：同ID新版"), source("related", "条件正文"), source("unrelated", "unrelated topic")], "条件");
        expect(result).toEqual([boundSource, source("related", "条件正文")]);
        expect(result.reduce((count, item) => count + item.text.length, 0)).toBeLessThanOrEqual(20000);
        result[0].text = "外部修改";
        expect(snapshot[0].text).toBe("BOUND_SNAPSHOT_原始条件正文");
    });
});
