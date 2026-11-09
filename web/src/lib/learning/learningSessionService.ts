import { randomUUID } from "node:crypto";
import { planningMaterials } from "./planningEvidence";
import type { NodeTeachingSession, TeachingInteraction } from "@prisma/client";
import { prisma } from "../prisma";
import { runJsonTask } from "../ai/tutorService";
import { AiTaskValidationError } from '../ai/tasks';
import { AiLogPersistenceError } from "../ai/generationEvidence";
import { NodeTeachingError, teachingObject, teachingText } from "./nodeTeaching";
import { digest, fetchTeachingSource, selectFragments, sourceFragments } from "./teachingSources";
import type { SourceFragment } from "./teachingContracts";
import { parseGoals, parseConcept } from "./conceptPlanning";
import { scopedContentQuestions } from "./curriculumBoundary";
import { planningEvidenceForTeaching } from "./planningTeachingEvidence";
import { listPage } from "./listPage";
import type { RoadmapModuleBlueprint, ConceptReference } from "./roadmapPlanningTypes";
import {applyContentFindings,findingValue,publicContentReview,validateFocusedReview} from "./learningContentReview";
import { buildLearningKnowledgeReviewPrompt, buildLearningKnowledgeReviewRepair } from "./learningKnowledgeReviewPrompt";
import { buildLearningInteractionEvidence, selectInteractionSources, withdrawCorrectedFeedbackJudgment } from "./learningInteractionEvidence";
import { buildLearningFeedbackRepair, learningFeedbackActionInstructions, pendingLearningFeedbackPlans, savedLearningSegmentPlan, validateLearningFeedbackReply, type LearningFeedbackActionContext } from "./learningFeedbackActions";
import { buildLearningFeedbackReviewPrompt, deferUnverifiedFeedback, validateLearningFeedbackReview } from "./learningFeedbackReview";
import { emptyLearningProgress, exposureKey, publicLearningMaterial, publicLearningReply, validateLearningFramework, validateLearningMaterial, type LearningContext, type LearningFramework, type LearningMaterial, type LearningProgressState, type LearningReply, type LearningView } from "./flexibleTeaching";
export const parseSaved = <T>(v: string | null | undefined, fallback: T): T => { try {
    return v ? JSON.parse(v) as T : fallback;
}
catch {
    return fallback;
} };
const textKey = (v: unknown) => teachingText(v, "请求或对象标识", 160);
const frameworkOf = (s: NodeTeachingSession) => parseSaved<LearningFramework | null>(s.lessonJson, null);
const current = (s: NodeTeachingSession) => parseSaved<Record<string, unknown>>(s.contextJson, {}).schemaVersion === 4;
const progressOf = (s: NodeTeachingSession) => ({ ...emptyLearningProgress(), ...parseSaved<Partial<LearningProgressState>>(s.progressJson, {}) });
const feedbackCorrection = (s: NodeTeachingSession, id: string) => parseSaved<{feedbackCorrections?:{interactionId:string;text:string}[]}>(s.summaryJson, {}).feedbackCorrections?.find(c => c.interactionId === id);
function knownFeedbackError(s: NodeTeachingSession, interaction: Pick<TeachingInteraction,"id"|"responseJson">, text?: string) {
    const summary=parseSaved<{contentReviewHistory?:Record<string,unknown>[]}>(s.summaryJson,{});
    const activeText=text??feedbackCorrection(s,interaction.id)?.text??parseSaved<LearningReply|null>(interaction.responseJson,null)?.text;
    const history=Array.isArray(summary.contentReviewHistory)?summary.contentReviewHistory:[];
    return history.find(review=>review?.confirmedFeedbackError===true&&review.interactionId===interaction.id&&review.originalResponseDigest===digest(interaction.responseJson||"null")&&review.reviewedFeedbackDigest===digest(activeText||""));
}
function effectiveLearningReply(s: NodeTeachingSession, interaction: Pick<TeachingInteraction, "id" | "kind" | "responseJson">) {
    const reply = parseSaved<LearningReply | null>(interaction.responseJson, null), correction = feedbackCorrection(s, interaction.id);
    if(reply&&knownFeedbackError(s,interaction)) return deferUnverifiedFeedback(reply,interaction.kind==="answer"?"answer":"question","原反馈已有绑定原文的确定错误；更正尚未完成核实，原判断和建议已撤回。后续无错意见不能替代实际更正。");
    return reply && correction ? { ...withdrawCorrectedFeedbackJudgment({ ...reply, text: correction.text }, interaction.kind === "answer" ? "answer" : "question"), text: reply.text } : reply;
}
const prefix = (s: NodeTeachingSession) => `l${s.lessonVersion}--`;
const isActiveSegment = (s: NodeTeachingSession, segment: {key:string;reviewJson:string|null}) => segment.key.startsWith(prefix(s)) || (segment.key.startsWith("feedback-") && parseSaved<{lessonVersion?:number}>(segment.reviewJson, {}).lessonVersion===s.lessonVersion);
const boundSourceIds = (segmentKey: string, sourceIds: string[], snapshot: SourceFragment[]) => sourceIds.length || !segmentKey.startsWith("feedback-") ? sourceIds : snapshot.map(source => source.id);
const failure = (e: unknown) => e instanceof Error ? e.message : "教学生成失败，请重试。";
const version = (s: NodeTeachingSession, v: unknown) => { if (v !== s.revision)
    throw new NodeTeachingError("会话已更新，请恢复后重试；已保存输入仍保留。", 409); };
const writable = (s: NodeTeachingSession) => { if (!current(s))
    throw new NodeTeachingError("旧教学仅供回看，请重新准备；原内容会保留。", 409); };
function returnTo(v: unknown): LearningContext["returnTo"] { if (!v)
    return null; const d = teachingObject(v), r: NonNullable<LearningContext["returnTo"]> = {}; for (const k of ["sessionId", "segmentId", "stepKey"] as const)
    if (d[k])
        r[k] = textKey(d[k]); if (typeof d.href === "string" && /^\/learning(?:\/|$)/.test(d.href) && !d.href.includes("\\"))
    r.href = d.href.slice(0, 500); return r; }
async function makeContext(d: {
    domainId?: string;
    nodeId?: string;
    question?: string;
    knowledgePointId?: string;
    returnTo?: unknown;
}): Promise<LearningContext> {
    const domain = d.domainId ? await prisma.domain.findUnique({ where: { id: d.domainId } }) : null;
    if (d.domainId && !domain)
        throw new NodeTeachingError("领域不存在。", 404);
    const node = d.nodeId ? await prisma.learningNode.findFirst({ where: { id: d.nodeId, domainId: d.domainId }, include: {unit:true, dependencies: { include: { prerequisite: { include: { teachingSessions:{orderBy:{updatedAt:"desc"},take:1,include:{segments:{where:{status:"ready"},take:6},interactions:{orderBy:{createdAt:"desc"},take:5}}},knowledgeLinks: { include: { knowledgePoint: { include: { currentRevision: true } } } } } } } } } }) : null;
    if (d.nodeId && !node)
        throw new NodeTeachingError("节点不属于当前领域。", 404);
    const record = d.knowledgePointId ? await prisma.knowledgePoint.findUnique({ where: { id: d.knowledgePointId }, include: { currentRevision: true } }) : null;
    if (d.knowledgePointId && !record)
        throw new NodeTeachingError("记录不存在。", 404);
    const focus = d.question?.trim() || node?.keyQuestion || node?.title || record?.currentRevision?.title || record?.title;
    if (!focus)
        throw new NodeTeachingError("请输入问题或选择学习任务、个人记录。");
    const concept=parseConcept(parseSaved(node?.conceptJson,{})), registry=parseGoals(parseSaved(domain?.learningGoalsJson,[])).flatMap(g=>g.contentQuestions||[]), planningKeys=parseSaved<string[]>(node?.planningQuestionKeysJson,[]);
    const units = node ? await prisma.unit.findMany({where:{domainId:node.domainId},select:{teachingPlanJson:true}}) : [];
    const references = units.flatMap(u => parseSaved<{modules?:{conceptReferences?:ConceptReference[]}[]}>(u.teachingPlanJson,{}).modules || []).flatMap(m => m.conceptReferences || []).filter(r => r.key === (node?.mapKey || node?.id));
    const contributions = [...(concept.learningUnit?.contentContributions || []), ...references.flatMap(r => r.contentContributions || [])];
    const assigned=new Set(parseSaved<RoadmapModuleBlueprint[]>(node?.unit?.planningBlueprintJson,[]).flatMap(m=>m.keyQuestions.filter(q=>planningKeys.includes(q.key)).map(q=>q.contentQuestionKey)));
    const questions=contributions.length?scopedContentQuestions(registry,contributions):registry.filter(q=>assigned.has(q.key)).map(q=>({...q,requirementIndices:q.contentRequirements.map((_,i)=>i)}));
    const course = parseSaved<{knowledgeBoundary?:{assumedKnowledge?:string[]};knowledgeReview?:unknown}>(domain?.courseDesignDraft, {});
    const planningKnowledge = domain && node ? await planningEvidenceForTeaching(domain, node)
        : { claims: [], pendingOpinions: [], limitations: ["当前探索没有绑定正式地图节点的规划核对证据。"] };
    const assumptions = domain ? ["用户基础输入："+(domain.currentLevel||"未知"), "用户目标原文（其中的背景陈述是用户输入，不是能力认证）："+(domain.goal||""), "课程暂定基础（可补讲，未证明已掌握）："+(course.knowledgeBoundary?.assumedKnowledge?.join("、")||"待按当前问题明确")].join("\n") : "";
    return { schemaVersion: 4, focus: focus.slice(0, 6000), contentQuestions:questions, planningKnowledge, domain: domain ? { id: domain.id, name: domain.name, goal: domain.goal || "开放探索", scope: domain.scope || "待确定", assumptions } : null, task: node ? { id: node.id, title: node.title, objective: node.objective || "", question: node.keyQuestion || node.title,scope:concept.scope,newKnowledge:concept.learningUnit?.newKnowledge,teachingTasks:concept.learningUnit?.teachingTasks,example:concept.learningUnit?.example,commonMistake:node.commonMistake||undefined,transferPrompt:node.transferPrompt||undefined, prerequisites: node.dependencies.map(({ prerequisite: p }) => {const c=parseConcept(parseSaved(p.conceptJson,{}));return { id: p.id, title: p.title, status: p.status,scope:c.scope,teachingTasks:c.learningUnit?.teachingTasks,explanations:p.teachingSessions.flatMap(s=>s.segments.flatMap(g=>parseSaved<LearningMaterial|null>(g.materialJson,null)?.steps?.map(x=>x.explanation)||[])).slice(0,12),questions:p.teachingSessions.flatMap(s=>s.interactions.filter(i=>i.kind==="question").map(i=>i.input)),understanding: p.knowledgeLinks.map(x => x.knowledgePoint.currentRevision?.body || "").filter(Boolean).join("\n") || null };}) } : null, record: record ? { id: record.id, revisionId: record.currentRevisionId || "", title: record.currentRevision?.title || record.title, body: record.currentRevision?.body || record.userUnderstanding || record.coreEssence || "" } : null, returnTo: returnTo(d.returnTo) };
}
export async function loadLearningSession(id: string, domainId?: string, nodeId?: string) { const s = await prisma.nodeTeachingSession.findUnique({ where: { id } }); if (!s || (domainId && s.domainId !== domainId) || (nodeId && s.nodeId !== nodeId))
    throw new NodeTeachingError("会话不存在或不属于当前任务。", 404); return s; }
async function teachingContext(s: NodeTeachingSession): Promise<LearningContext> {
    const saved = parseSaved<LearningContext>(s.contextJson, { schemaVersion: 4, focus: '历史学习', domain: null, task: null, record: null, returnTo: null });
    if (!current(s) || !s.nodeId || !s.domainId || !saved.task) return saved;
    const fresh = await makeContext({ domainId: s.domainId, nodeId: s.nodeId });
    // Scope belongs to the prepared version; participation and user words are live facts.
    return { ...saved, task: { ...saved.task, prerequisites: fresh.task?.prerequisites || [] } };
}
const privateKeys = new Set(["answer", "expectedAnswer", "referenceAnswer", "hints", "criteria", "responseCriteria"]);
export function historicalPublicContent(v: unknown): unknown { if (Array.isArray(v))
    return v.map(historicalPublicContent); if (v && typeof v === "object")
    return Object.fromEntries(Object.entries(v).filter(([k]) => !privateKeys.has(k)).map(([k, x]) => [k, historicalPublicContent(x)])); return v; }
export async function learningView(s: NodeTeachingSession): Promise<LearningView> {
    const [segments, interactions, sources, history] = await Promise.all([prisma.teachingSegment.findMany({ where: { sessionId: s.id }, orderBy: { createdAt: "asc" } }), prisma.teachingInteraction.findMany({ where: { sessionId: s.id }, orderBy: { createdAt: "asc" } }), prisma.teachingSource.findMany({ where: { sessionId: s.id } }), s.nodeId ? prisma.nodeTeachingSession.findMany({ where: { nodeId: s.nodeId }, orderBy: { createdAt: "desc" } }) : Promise.resolve([s])]);
    const p = progressOf(s), historical = !current(s);
    const frameworkHistory = parseSaved<{frameworkHistory?:unknown}>(s.summaryJson, {}).frameworkHistory;
    const feedbackCorrections = parseSaved<{feedbackCorrections?:{interactionId:string;text:string;requestId:string}[]}>(s.summaryJson,{}).feedbackCorrections || [];
    const liveContext = await teachingContext(s);
    return { id: s.id, domainId: s.domainId, nodeId: s.nodeId, scopeKey: s.scopeKey, revision: s.revision, lessonVersion: s.lessonVersion, status: s.status, error: s.errorMessage, historical, context: liveContext, framework: historical ? null : frameworkOf(s), progress: p, segments: segments.map(x => { const m = parseSaved<LearningMaterial | null>(x.materialJson, null); return { id: x.id, requestId: x.requestId, active: x.key.startsWith(prefix(s)) || (x.key.startsWith("feedback-") && parseSaved<{
                lessonVersion?: number;
            }>(x.reviewJson, {}).lessonVersion === s.lessonVersion), key: x.key.startsWith(prefix(s)) ? x.key.slice(prefix(s).length) : x.key, version: x.version, status: x.status, error: x.errorMessage, material: m?.schemaVersion === 4 ? publicLearningMaterial(m, x.id, x.version, p, savedLearningSegmentPlan(frameworkOf(s), s.lessonVersion, x.key, frameworkHistory)) : null, sources: parseSaved<SourceFragment[]>(x.sourceSnapshotJson, []) }; }), interactions: interactions.map(x => ({ id: x.id, ...(feedbackCorrections.find(c=>c.interactionId===x.id)?{correction:feedbackCorrections.find(c=>c.interactionId===x.id)}:{}), requestId: x.requestId, kind: x.kind, input: x.input, segmentId: x.segmentId, stepKey: x.stepKey, exerciseKey: x.exerciseKey, materialVersion: x.materialVersion, status: x.status, assistance: x.assistance, response: historical ? null : publicLearningReply(effectiveLearningReply(s, x)), error: x.errorMessage })), summary: parseSaved(s.summaryJson, {}),contentReview:publicContentReview(parseSaved(s.reviewJson,null)), history: history.map(x => ({ id: x.id, lessonVersion: x.lessonVersion, historical: !current(x) })), sources: sources.map(x => ({ url: x.url, title: x.title, limitation: x.limitation })), ...(historical ? { legacy: { framework: historicalPublicContent(parseSaved(s.lessonJson, {})), progress: parseSaved(s.progressJson, {}), segments: segments.map(x => ({ id: x.id, key: x.key, version: x.version, material: historicalPublicContent(parseSaved(x.materialJson, {})), sources: parseSaved(x.sourceSnapshotJson, []) })), interactions: interactions.map(x => ({ input: x.input, response: historicalPublicContent(parseSaved(x.responseJson, null)), assistance: x.assistance })) } } : {}) };
}
export async function getLearningSession(id: string) { return { session: await learningView(await loadLearningSession(id)) }; }
export async function listLearningSessions(options:{offset?:unknown;limit?:unknown}={}) {
    const page=listPage(options.offset,options.limit,150);
    const [list,total]=await prisma.$transaction([prisma.nodeTeachingSession.findMany({orderBy:[{updatedAt:"desc"},{id:"asc"}],skip:page.offset,take:page.limit}),prisma.nodeTeachingSession.count()]);
    return {sessions:list.map(s=>({id:s.id,domainId:s.domainId,nodeId:s.nodeId,status:s.status,title:parseSaved<LearningContext|null>(s.contextJson,null)?.focus||"历史学习",historical:!current(s),updatedAt:s.updatedAt})),page:{...page,total,nextOffset:page.offset+list.length<total?page.offset+list.length:null}};
}
export async function createLearningSession(value: unknown) {
    const d = teachingObject(value), requestId = textKey(d.requestId), nodeId = typeof d.nodeId === "string" ? d.nodeId : undefined, domainId = typeof d.domainId === "string" ? d.domainId : undefined;
    if (nodeId && !domainId)
        throw new NodeTeachingError("节点学习需要所属领域。");
    const scopeKey = nodeId ? `node:${nodeId}` : `explore:${requestId}`;
    const found = await prisma.nodeTeachingSession.findUnique({ where: { scopeKey } });
    if (found) {
        const original = parseSaved<LearningContext>(found.contextJson, {} as LearningContext);
        if (!nodeId && (found.domainId !== (domainId || null) || original.focus !== String(d.question || original.focus).trim() || (original.record?.id || null) !== (d.knowledgePointId || null))) throw new NodeTeachingError("创建标识已用于另一个探索问题。请为新问题使用新标识。", 409);
        return { session: await learningView(found) };
    }
    const context = await makeContext({ domainId, nodeId, question: typeof d.question === "string" ? teachingText(d.question, "探索问题", 6000) : undefined, knowledgePointId: typeof d.knowledgePointId === "string" ? d.knowledgePointId : undefined, returnTo: d.returnTo });
    const domain = domainId ? await prisma.domain.findUnique({ where: { id: domainId } }) : null;
    const s = await prisma.nodeTeachingSession.upsert({ where: { scopeKey }, create: { scopeKey, domainId, nodeId, requestId, contextHash: digest(context), mapRevision: domain?.mapRevision, contextJson: JSON.stringify(context), lessonJson: "null", aiCallLogId: "", status: "draft", progressJson: JSON.stringify(emptyLearningProgress()) }, update: {} });
    return { session: await learningView(s) };
}
async function fragments(s: NodeTeachingSession) { return (await prisma.teachingSource.findMany({ where: { sessionId: s.id } })).flatMap(x => parseSaved<SourceFragment[]>(x.fragmentsJson, [])); }
async function interactionSourceSnapshot(s: NodeTeachingSession) {
    return prisma.$transaction(async tx => {
        const session = await tx.nodeTeachingSession.findUnique({where:{id:s.id}});
        if (!session) throw new NodeTeachingError("会话不存在。",404);
        const sources = await tx.teachingSource.findMany({where:{sessionId:s.id}});
        return {revision:session.sourceRevision,fragments:sources.flatMap(source=>parseSaved<SourceFragment[]>(source.fragmentsJson,[]))};
    });
}
async function generate<T>(s: NodeTeachingSession, taskType: "node_lesson_preparation" | "node_segment_preparation" | "node_lesson_feedback" | "node_knowledge_check", prompt: string, validate: (v: unknown) => T, repairPrompt?: (error: string, log: {rawOutput:string|null;parsedOutputJson:string|null}|null) => string) { let repair = ""; for (let attempt = 0; attempt < 3; attempt++) {
    try {
        return await runJsonTask({ domainId: s.domainId || undefined, taskType, inputSummary: parseSaved<LearningContext>(s.contextJson, {} as LearningContext).focus, promptVersion: taskType === "node_knowledge_check" ? "learning-knowledge-interaction-evidence-v2" : taskType === "node_lesson_feedback" ? "flexible-learning-interaction-evidence-v5" : "flexible-learning-reliability-v4", singleAttempt: true, maxTokens: taskType === "node_lesson_feedback" ? 6500 : 10000, systemPrompt: "你是资深教师。按当前问题和真实用户输入提供准确、易懂的帮助。不要伪造来源、已掌握事实或唯一标准答案。不要求九维五段。只返回约定 JSON。", userPrompt: prompt + repair, validate });
    }
    catch (e) {
        if (!(e instanceof NodeTeachingError || e instanceof AiTaskValidationError) || attempt === 2)
            throw e;
        const logId = (e as NodeTeachingError & {
            aiCallLogId?: string;
        }).aiCallLogId;
        const log = logId ? await prisma.aiCallLog.findUnique({ where: { id: logId } }) : null;
        repair = repairPrompt ? repairPrompt(failure(e), log) : `\n仅修复明确结构/引用错误：${failure(e)}\n原候选：${log?.rawOutput?.slice(0, 24000) || "暂无"}`;
    }
} throw new NodeTeachingError("修复次数已耗尽。"); }
async function checkGeneratedKnowledge(s: NodeTeachingSession, initialFramework: LearningFramework, initialMaterial: LearningMaterial | null, sources: SourceFragment[], concern = "", frameworkIsCandidate = false, contextOverride?: unknown, feedbackInput?: { reply: LearningReply; kind: "answer" | "question" }) {
    let framework = initialFramework, material = initialMaterial;
    let previousCorrection: unknown = null;
    const aiCallLogIds: string[] = [];
    for (let correction = 0; correction < 3; correction++) {
        let result;
        try {
            let context = contextOverride === undefined ? await teachingContext(s) : contextOverride;
            if (feedbackInput) {
                let feedbackCandidate = { ...feedbackInput.reply, text: framework.mainIdea };
                if (feedbackCandidate.newActivity && material) feedbackCandidate = { ...feedbackCandidate, newActivity: { ...feedbackCandidate.newActivity, explanation: material.steps[0].explanation, activity: material.steps[0].activities[0] } };
                if (framework.mainIdea !== initialFramework.mainIdea || JSON.stringify(material?.steps) !== JSON.stringify(initialMaterial?.steps)) feedbackCandidate = withdrawCorrectedFeedbackJudgment(feedbackCandidate, feedbackInput.kind);
                context = { ...(context as Record<string, unknown>), feedbackCandidate };
            }
            const reviewInput = { framework, material, sources, context, concern, previousCorrection, frameworkIsCandidate: frameworkIsCandidate || framework.mainIdea !== initialFramework.mainIdea };
            result = await generate(s, 'node_knowledge_check', buildLearningKnowledgeReviewPrompt(reviewInput), v => validateFocusedReview(v, framework, material), (error, log) => buildLearningKnowledgeReviewRepair(error, log, reviewInput));
        } catch (error) {
            const limitation = `独立知识核对尚未完成：${failure(error)}；以下内容仍待核对。`;
            framework = { ...framework, limitations: [...framework.limitations, limitation] };
            if (material) material = { ...material, limitations: [...material.limitations, limitation] };
            return { framework, material, aiCallLogIds, review: { verdict: 'uncertain', summary: limitation } };
        }
        aiCallLogIds.push(...result.aiCallLogIds);
        if (result.data.verdict !== 'confirmed_error') return { framework, material, aiCallLogIds, review: publicContentReview({ ...result.data, status: 'complete' }) };
        if (correction === 2) throw new NodeTeachingError('当前知识事实仍有明确错误，已保留原始候选与核对；请补充资料或显式重试。');
        previousCorrection = result.data.findings;
        const corrected = applyContentFindings(result.data, framework, material);
        framework = corrected.framework; material = corrected.material;
    }
    throw new NodeTeachingError('知识纠错未完成。');
}
async function checkGeneratedFeedback(s: NodeTeachingSession, initialReply: LearningReply, context: unknown, sources: SourceFragment[], actionContext: LearningFeedbackActionContext, kind: "answer" | "question") {
    let reply = initialReply, previousReview: unknown = null;
    const aiCallLogIds: string[] = [], confirmedCandidates = new Set<string>();
    const cannotPublish = () => new NodeTeachingError("当前反馈仍有已确认且未解除的错误；原候选、用户输入及核对记录已保留，请显式重试。");
    for (let attempt = 0; attempt < 3; attempt++) {
        let result;
        try {
            result = await runJsonTask({domainId:s.domainId || undefined,taskType:"node_knowledge_check",inputSummary:parseSaved<LearningContext>(s.contextJson,{} as LearningContext).focus,promptVersion:"learning-feedback-whole-reply-v2",singleAttempt:true,maxTokens:10000,systemPrompt:"你是独立教学审查者。核对完整反馈与本轮真实证据，不默认参考答案正确，不改写原题、用户原话或历史身份。只返回约定JSON。",userPrompt:buildLearningFeedbackReviewPrompt({reply,context,sources,actionContext,kind,previousReview}),validate:value=>validateLearningFeedbackReview(value,reply,actionContext,kind)});
        } catch (error) {
            if(error instanceof AiLogPersistenceError) throw error;
            const logId=(error as {aiCallLogId?:string})?.aiCallLogId;
            if(logId) aiCallLogIds.push(logId);
            if(confirmedCandidates.has(digest(reply))) throw cannotPublish();
            const contractFailure=error instanceof NodeTeachingError || error instanceof AiTaskValidationError;
            if(contractFailure&&attempt<2){
                const log=logId?await prisma.aiCallLog.findUnique({where:{id:logId}}):null;
                previousReview={error:failure(error),rawOutput:log?.rawOutput?.slice(0,24000)||null,parsedOutput:log?.parsedOutputJson?.slice(0,24000)||null};
                continue;
            }
            const reason=`${digest(reply)!==digest(initialReply)?"更正候选未核实":"反馈尚未核实"}：${failure(error)}`;
            return {reply:deferUnverifiedFeedback(reply,kind,reason),aiCallLogIds};
        }
        aiCallLogIds.push(...result.aiCallLogIds);
        if(result.data.verdict==="confirmed_error"){
            confirmedCandidates.add(digest(reply));
            if(attempt===2) throw cannotPublish();
            previousReview=result.data;
            reply=result.data.replacement!;
            continue;
        }
        if(confirmedCandidates.has(digest(reply))) throw cannotPublish();
        if(result.data.verdict==="uncertain") return {reply:deferUnverifiedFeedback(reply,kind,`${digest(reply)!==digest(initialReply)?"更正候选未核实：":""}${result.data.summary}${result.data.uncertainty?"；"+result.data.uncertainty:""}`),aiCallLogIds};
        return {reply,aiCallLogIds};
    }
    throw cannotPublish();
}
async function courseSources(s: NodeTeachingSession) {
    if (!s.domainId) return;
    const domain = await prisma.domain.findUnique({ where: { id: s.domainId } });
    const draft = parseSaved<{sources?:{url:string;title:string;grounding?:{fragments?:{location:string;text:string}[];bodyRetrieved?:boolean}}[]}>(domain?.courseDesignDraft, {});
    const raw = parseSaved<{planningInput?:{materials?:string}}>(domain?.entryGuideJson, {}).planningInput?.materials;
    const materials = planningMaterials(draft, raw), grouped = new Map<string, SourceFragment[]>();
    for (const fragment of materials) grouped.set(fragment.url, [...(grouped.get(fragment.url)||[]), fragment]);
    for (const [url, f] of grouped) await prisma.teachingSource.upsert({ where:{sessionId_url:{sessionId:s.id,url}}, create:{sessionId:s.id,url,title:f[0].title,contentHash:digest(f),fragmentsJson:JSON.stringify(f),limitation:"实际获得的正文快照；取得正文不表示其全部主张已被证明。"}, update:{} });
}
export async function prepareLearningSession(id: string, value: unknown = {}) {
    const d = teachingObject(value), requestId = textKey(d.requestId);
    let s = await loadLearningSession(id);
    writable(s);
    if (s.requestId === requestId && s.status !== "draft" && (!['failed', 'generating', 'pending'].includes(s.status) || d.retry !== true))
        return { session: await learningView(s) };
    if (s.status === "generating" && d.retry !== true)
        return { session: await learningView(s) };
    if (frameworkOf(s) && d.reprepare !== true && s.status === "ready")
        return { session: await learningView(s) };
    version(s, d.revision);
    let context = parseSaved<LearningContext>(s.contextJson, {} as LearningContext);
    if (s.nodeId && s.domainId)
        context = await makeContext({ domainId: s.domainId, nodeId: s.nodeId, question: typeof d.concern === "string" && d.concern.trim() ? `${context.focus}\n关注：${d.concern}` : context.focus, returnTo: context.returnTo });
    const token = randomUUID(), previous = frameworkOf(s), summary = parseSaved<Record<string, unknown>>(s.summaryJson, {}), history = Array.isArray(summary.frameworkHistory) ? summary.frameworkHistory : [];
    const claim = await prisma.nodeTeachingSession.updateMany({ where: { id, revision: s.revision }, data: { status: "generating", requestId, generationToken: token, errorMessage: null, revision: { increment: 1 } } });
    if (!claim.count)
        throw new NodeTeachingError("准备请求已过期。", 409);
    s = await loadLearningSession(id);
    try {
        await courseSources(s);
        const sources = selectFragments(await fragments(s), context.focus + (context.domain?.goal || ""), 10), result = await generate(s, "node_lesson_preparation", `为当前问题备课，安排1至10个部分，每部分1至12步，数量由内容决定，可以三步、可共同讲相关概念、可纯阅读讨论。不要求每部分练习。基础未知时说明前置的用途和补讲方式，不能称已掌握。开放探索可形成问题、比较案例，不强制分数或唯一答案。contentQuestions.importance=optional 的选学责任不得成为强制作答或记录要求；教学顺序理由不是逻辑必要性。task 中 example/commonMistake/transferPrompt 是当前规划原文，不是已经展示的活动；需要在本次材料中落实题目条件，不能自动变成必做。planningKnowledge.claims 是仅在所列字段和原适用范围仍匹配的模型核对意见，不能省略条件或扩展为新增责任已经核对；pendingOpinions 是待核实规划疑点，不是事实或新增要求。缺少绑定的旧报告只可追溯，不能把 uncertain 或建议说成已验证。requiredOutput只能填写三个精确字符串：none（没有必须产出，阅读/讨论/可选尝试）、attempt（留下尝试）、record（保存个人记录）。不得填写optional；选学阅读/讨论用none。这是提前向用户说明的任务产出，不要泛化为所有步骤必须作答。来源不足列入 limitations。\n上下文：${JSON.stringify(context)}\n实际资料：${JSON.stringify(sources)}\n返回 {title,purpose,scope,mainIdea,prerequisites:[{knowledge,use,support}],limitations:[],segments:[{key,title,goal,steps:[{key,goal,requiredOutput,contentAssignments:[{contentQuestionKey,requirementIndices:[]}]}]}]}。如果上下文包含 contentQuestions，逐步承接其已分配 requirementIndices，可多步合作；没有课程问题时用空数组。不要另造要求或维度。标识使用英文稳定短名称。`, v=>validateLearningFramework(v,context.contentQuestions||[]));
        const checked = await checkGeneratedKnowledge(s, result.data, null, sources, "", false, context);
        result.data = checked.framework; result.aiCallLogIds.push(...checked.aiCallLogIds);
        await prisma.$transaction(async tx => {
            const latest=await tx.nodeTeachingSession.findUnique({where:{id}}); if(latest?.generationToken!==token)return;
            const currentSummary=parseSaved<Record<string,unknown>>(latest.summaryJson,{});
            await tx.nodeTeachingSession.update({where:{id},data:{lessonJson:JSON.stringify(result.data),reviewJson:JSON.stringify(checked.review),lessonVersion:previous?s.lessonVersion+1:s.lessonVersion,contextJson:JSON.stringify(context),contextHash:digest(context),status:"ready",generationToken:null,errorMessage:null,aiCallLogId:result.log.id,aiCallLogIdsJson:JSON.stringify(result.aiCallLogIds),summaryJson:JSON.stringify({...currentSummary,frameworkHistory:previous?[...history,{lessonVersion:s.lessonVersion,context:parseSaved(s.contextJson,{}),framework:previous}]:history}),revision:{increment:1}}});
        });
    }
    catch (e) {
        await prisma.nodeTeachingSession.updateMany({ where: { id, generationToken: token }, data: { status: "failed", errorMessage: failure(e), generationToken: null, revision: { increment: 1 } } });
    }
    return { session: await learningView(await loadLearningSession(id)) };
}
export async function prepareLearningSegment(id: string, segmentKey: string, value: unknown) {
    const d = teachingObject(value), requestId = textKey(d.requestId), s = await loadLearningSession(id);
    writable(s);
    const framework = frameworkOf(s), plan = framework?.segments.find(x => x.key === segmentKey);
    if (!plan)
        throw new NodeTeachingError("请先准备教学安排并选择其中一项。", 409);
    const storedKey = prefix(s) + segmentKey;
    let segment = await prisma.teachingSegment.findFirst({ where: { sessionId: id, key: storedKey }, orderBy: { version: "desc" } });
    const requested = await prisma.teachingSegment.findUnique({ where: { sessionId_requestId: { sessionId: id, requestId } } });
    if (requested) {
        if (requested.key !== storedKey)
            throw new NodeTeachingError("请求标识已用于另一部分。", 409);
        if (!["failed", "generating", "pending"].includes(requested.status) || d.retry !== true)
            return { session: await learningView(s) };
        segment = requested;
    }
    if (segment?.status === "ready" && d.reprepare !== true)
        return { session: await learningView(s) };
    if (segment?.status === "generating" && d.retry !== true)
        return { session: await learningView(s) };
    version(s, d.revision);
    const token = randomUUID(), sources = selectFragments(await fragments(s), `${parseSaved<LearningContext>(s.contextJson, {} as LearningContext).focus} ${plan.goal}`, 10);
    segment = await prisma.$transaction(async (tx) => { if (!(await tx.nodeTeachingSession.updateMany({ where: { id, revision: s.revision }, data: { revision: { increment: 1 } } })).count)
        throw new NodeTeachingError("准备请求已过期。", 409); return requested ? tx.teachingSegment.update({ where: { id: requested.id }, data: { status: "generating", generationToken: token, errorMessage: null, sourceRevision: s.sourceRevision, sourceSnapshotJson: JSON.stringify(sources) } }) : tx.teachingSegment.create({ data: { sessionId: id, key: storedKey, version: (segment?.version || 0) + 1, requestId, status: "generating", generationToken: token, sourceRevision: s.sourceRevision, sourceSnapshotJson: JSON.stringify(sources) } }); });
    try {
        const recent = await prisma.teachingInteraction.findMany({ where: { sessionId: id, status: "complete" }, orderBy: { createdAt: "desc" }, take: 6 }), result = await generate(s, "node_segment_preparation", `生成这一部分正文，用户可能跳过前文，因此补充所需背景。每个活动的参考回应、提示和各分支criteria只能依据本题实际给定条件与已讲知识；不得把前文例子的特殊定义默认为本题条件，不混淆具体取值与趋势、线索支持与充分证明。按命题实际量词判断例子和反例的责任。使用安排里的步骤 key，可无练习；requiredOutput=attempt 的步骤需一个 required:true 活动。开放问题 answer 可 null，criteria 说明讨论依据。只引用实际资料片段 ID，basis 区分 source/derivation/analogy/unverified；不能把类比当证明。\n上下文：${JSON.stringify(await teachingContext(s))}\n安排：${JSON.stringify(framework)}\n当前部分：${JSON.stringify(plan)}\n资料：${JSON.stringify(sources)}\n摘要：${s.summaryJson}\n近期实际输入：${JSON.stringify(recent.map(x => ({ input: x.input, response: parseSaved(x.responseJson, null), assistance: x.assistance })))}\n返回 {title,summary,limitations:[],steps:[{key,explanation,example,basis,sourceIds:[],activities:[{kind:"question|application|discussion|comparison",prompt,answer,criteria:[],hints:[],required:false}]}]}。不要分配数据库身份。`, v => validateLearningMaterial(v, plan, sources));
        const checked = await checkGeneratedKnowledge(s, framework!, result.data, sources);
        if (checked.framework.mainIdea !== framework!.mainIdea) {
            await prisma.$transaction(async tx => {
                const now = await tx.nodeTeachingSession.findUnique({where:{id}});
                const claimedSegment=await tx.teachingSegment.findUnique({where:{id:segment!.id}});
                if (!now || now.lessonVersion !== s.lessonVersion || claimedSegment?.generationToken !== token) return;
                const summary=parseSaved<Record<string,unknown>>(now.summaryJson,{}), history=Array.isArray(summary.frameworkHistory)?summary.frameworkHistory:[];
                await tx.nodeTeachingSession.update({where:{id},data:{lessonJson:JSON.stringify(checked.framework),lessonVersion:{increment:1},reviewJson:JSON.stringify({...checked.review,correctedFrameworkVersion:s.lessonVersion+1}),summaryJson:JSON.stringify({...summary,frameworkHistory:[...history,{lessonVersion:s.lessonVersion,context:parseSaved(s.contextJson,{}),framework}]}),revision:{increment:1}}});
            });
            throw new NodeTeachingError("发现的核心错误已回到新框架修正；原材料与输入保留，请进入相应部分重新备课。");
        }
        result.data = validateLearningMaterial(checked.material, plan, sources); result.aiCallLogIds.push(...checked.aiCallLogIds);
        for (const step of result.data.steps)
            for (const a of step.activities)
                a.key = `activity-${randomUUID()}`;
        await prisma.$transaction(async (tx) => { const latest = await tx.nodeTeachingSession.findUnique({ where: { id } }); if (!latest)
            return; if (latest.lessonVersion !== s.lessonVersion) {
            await tx.teachingSegment.updateMany({ where: { id: segment!.id, generationToken: token }, data: { status: "ready", materialJson: JSON.stringify(result.data), generationToken: null, aiCallLogIdsJson: JSON.stringify(result.aiCallLogIds), errorMessage: "旧版本生成结果，仅供回看。" } });
            return;
        } const saved = await tx.teachingSegment.updateMany({ where: { id: segment!.id, generationToken: token }, data: { status: "ready", materialJson: JSON.stringify(result.data), reviewJson:JSON.stringify({lessonVersion:s.lessonVersion,...checked.review}), generationToken: null, aiCallLogIdsJson: JSON.stringify(result.aiCallLogIds) } }); if (saved.count) {
            const summary = parseSaved<Record<string, unknown>>(latest.summaryJson, {}), taught = Array.isArray(summary.taught) ? summary.taught : [];
            await tx.nodeTeachingSession.update({ where: { id }, data: { revision: { increment: 1 }, summaryJson: JSON.stringify({ ...summary, taught: [...taught, { segmentId: segment!.id, version: segment!.version, summary: result.data.summary }] }) } });
        } });
    }
    catch (e) {
        await prisma.teachingSegment.updateMany({ where: { id: segment.id, generationToken: token }, data: { status: "failed", errorMessage: failure(e), generationToken: null } });
    }
    return { session: await learningView(await loadLearningSession(id)) };
}
async function binding(s: NodeTeachingSession, d: Record<string, unknown>, required = false) { if (!d.segmentId) {
    if (required)
        throw new NodeTeachingError("作答需要已保存的活动。");
    return null;
} const segment = await prisma.teachingSegment.findFirst({ where: { id: String(d.segmentId), sessionId: s.id, status: "ready" } }); if (!segment || segment.version !== d.materialVersion)
    throw new NodeTeachingError("材料版本不匹配，请回到原活动；输入保留。", 409);
    const newest=await prisma.teachingSegment.findFirst({where:{sessionId:s.id,key:segment.key,status:"ready"},orderBy:{version:"desc"}});
    if(!isActiveSegment(s,segment)||newest?.id!==segment.id)throw new NodeTeachingError("这是先前版本的材料，只能回看；请从当前材料继续。",409);
    const material = parseSaved<LearningMaterial | null>(segment.materialJson, null); if (material?.schemaVersion !== 4)
    throw new NodeTeachingError("旧材料不可作为新练习。", 409); const step = material.steps.find(x => x.key === d.stepKey); if (!step)
    throw new NodeTeachingError("步骤不存在。"); const activity = d.exerciseKey ? step.activities.find(x => x.key === d.exerciseKey) : null; if ((required || d.exerciseKey) && !activity)
    throw new NodeTeachingError("活动不属于此步骤。"); return { segment, material, step, activity }; }
export async function saveLearningProgress(id: string, value: unknown) {
    const d = teachingObject(value), s = await loadLearningSession(id);
    writable(s);
    version(s, d.revision);
    const p = progressOf(s);
    if (d.action === "position") {
        const b = await binding(s, d);
        if (!b)
            throw new NodeTeachingError("请选择已准备的步骤。");
        p.segmentId = b.segment.id;
        p.stepKey = b.step.key;
        p.visited = [...new Set([...p.visited, `${b.segment.id}:${b.step.key}`])];
    }
    else if (d.action === "draft")
        p.drafts[textKey(d.draftKey)] = teachingText(d.text || "", "草稿", 12000, true);
    else if (d.action === "understanding")
        p.understandingDraft = teachingText(d.text || "", "整理草稿", 16000, true);
    else if (d.action === "hint" || d.action === "solution" || d.action === "skip") {
        const b = await binding(s, d, true), k = exposureKey(b!.segment.id, b!.segment.version, b!.step.key, b!.activity!.key), e = p.exposures[k] || { hints: 0, solution: false };
        if (d.action === "skip")
            p.skipped = [...new Set([...p.skipped, k])];
        else
            p.exposures[k] = { hints: d.action === "hint" ? Math.min(e.hints + 1, b!.activity!.hints.length) : e.hints, solution: d.action === "solution" || e.solution };
    }
    else if (d.action === "end")
        p.endedAt = new Date().toISOString();
    else if (d.action === "resume")
        p.endedAt = null;
    else if (d.action === "return") {
        if (p.returnPosition) {
            const x = await prisma.teachingSegment.findUnique({ where: { id: p.returnPosition.segmentId } });
            await binding(s, { ...p.returnPosition, materialVersion: x?.version });
            p.segmentId = p.returnPosition.segmentId;
            p.stepKey = p.returnPosition.stepKey;
            p.returnPosition = null;
        }
    }
    else
        throw new NodeTeachingError("学习操作无效。");
    await prisma.$transaction(async (tx) => { if (!(await tx.nodeTeachingSession.updateMany({ where: { id, revision: s.revision }, data: { progressJson: JSON.stringify(p), revision: { increment: 1 } } })).count)
        throw new NodeTeachingError("位置已更新，请恢复后重试。", 409); if (["hint", "solution", "skip", "end", "resume"].includes(String(d.action)))
        await tx.learningProgress.create({ data: { domainId: s.domainId, nodeId: s.nodeId, status: String(d.action), payloadJson: JSON.stringify({ sessionId: id, segmentId: d.segmentId || null, stepKey: d.stepKey || null, exerciseKey: d.exerciseKey || null, materialVersion: d.materialVersion || null, task: parseSaved<LearningContext>(s.contextJson, {} as LearningContext).task }) } }); });
    return { session: await learningView(await loadLearningSession(id)) };
}
export async function submitLearningInteraction(id: string, value: unknown) {
    const d = teachingObject(value), s = await loadLearningSession(id);
    writable(s);
    const requestId = textKey(d.requestId), input = teachingText(d.input, "实际输入", 16000), kind = d.kind === "answer" ? "answer" : "question", token=randomUUID();
    let interaction = await prisma.teachingInteraction.findUnique({ where: { sessionId_requestId: { sessionId: id, requestId } } });
    if (interaction) {
        if (interaction.input !== input || interaction.kind !== kind || interaction.segmentId!==(d.segmentId||null) || interaction.stepKey!==(d.stepKey||null) || interaction.exerciseKey!==(d.exerciseKey||null) || interaction.materialVersion!==(d.materialVersion||null))
            throw new NodeTeachingError("此请求已保存另一输入。", 409);
        if (!["failed","pending"].includes(interaction.status) || d.retry !== true)
            return { session: await learningView(s) };
    }
    const b = await binding(s, d, kind === "answer"), p = progressOf(s), e = b?.activity ? p.exposures[exposureKey(b.segment.id, b.segment.version, b.step.key, b.activity.key)] : null;
    const priorFeedback=b?.activity?await prisma.teachingInteraction.findFirst({where:{sessionId:id,segmentId:b.segment.id,stepKey:b.step.key,exerciseKey:b.activity.key,materialVersion:b.segment.version,status:"complete"}}):null;
    if (!interaction) {
        version(s, d.revision);
        interaction = await prisma.$transaction(async (tx) => { if (!(await tx.nodeTeachingSession.updateMany({ where: { id, revision: s.revision }, data: { revision: { increment: 1 } } })).count)
            throw new NodeTeachingError("会话已更新，请恢复后提交。", 409); return tx.teachingInteraction.create({ data: { sessionId: id, requestId, kind, input, segmentId: b?.segment.id, segmentKey: b?.segment.key, stepKey: b?.step.key, exerciseKey: b?.activity?.key, materialVersion: b?.segment.version, assistance: e?.solution ? 2 : e?.hints ? 1 : priorFeedback ? 3 : 0, status: "pending",generationToken:token } }); });
    }
    else if (!(await prisma.teachingInteraction.updateMany({ where: { id: interaction.id, generationToken: interaction.generationToken, status: {in:["failed","pending"]} }, data: { status: "pending", errorMessage: null,generationToken:token } })).count)
        return { session: await learningView(await loadLearningSession(id)) };
    const allSegments = await prisma.teachingSegment.findMany({ where: { sessionId: id, status: "ready" } });
    const segments=allSegments.filter(x=>isActiveSegment(s,x)&&!allSegments.some(y=>y.key===x.key&&y.version>x.version));
    const allowed = segments.flatMap(x => { const m = parseSaved<LearningMaterial | null>(x.materialJson, null); return m?.schemaVersion === 4 ? m.steps.flatMap(step => step.activities.length ? step.activities.map(a => ({ segmentId: x.id, stepKey: step.key, exerciseKey: a.key, materialVersion: x.version, goal:step.goal,prompt:a.prompt,criteria:a.criteria })) : [{ segmentId: x.id, stepKey: step.key, exerciseKey: "", materialVersion: x.version }]) : []; }), context = await teachingContext(s), recent = await prisma.teachingInteraction.findMany({ where: { sessionId: id, status: "complete" }, orderBy: { createdAt: "desc" }, take: 8 });
    const actionContext = { targets: allowed, pendingPlans: pendingLearningFeedbackPlans(frameworkOf(s), segments.filter(x => x.key.startsWith(prefix(s))).map(x => x.key.slice(prefix(s).length))), nodeIds: context.task?.prerequisites.map(x => x.id) || [] };
    try {
        const sourceState = await interactionSourceSnapshot(s);
        const boundSources = b ? parseSaved<SourceFragment[]>(b.segment.sourceSnapshotJson, []) : [];
        const sources = selectInteractionSources(boundSources, b ? boundSourceIds(b.segment.key,b.step.sourceIds,boundSources) : [], sourceState.fragments, [b?.step.goal, b?.activity?.prompt, input, context.focus].filter(Boolean).join("\n"));
        const boundPlan = b ? savedLearningSegmentPlan(frameworkOf(s), s.lessonVersion, b.segment.key, parseSaved<{frameworkHistory?:unknown}>(s.summaryJson, {}).frameworkHistory) : null;
        const currentInteraction = buildLearningInteractionEvidence({kind, interactionId:interaction.id,requestId:interaction.requestId,input: interaction.input, assistanceAtSubmission: interaction.assistance, currentExposure: e || null, binding: b ? {segmentId:b.segment.id,materialVersion:b.segment.version,requiredOutput:boundPlan?.steps.find(step=>step.key===b.step.key)?.requiredOutput || null,step:b.step,activity:b.activity || null} : null, sources});
        const reviewContext = { ...context, currentInteraction };
        const result = await generate(s, "node_lesson_feedback", `根据真实推理区别具体困难。摘要中反馈更正优先于历史原回答，不重复已明确纠正的错误。证据不足时追问和说明不确定，不给永久掌握判断。可引用有效活动；若需新活动，返回 newActivity，系统分配身份并保存后再提供进入动作。活动先补足未讲背景，含 prompt/answer(开放问题可null)/criteria/hints。普通提问无需练习。不同困难需要匹配实际题目和目标；仅当已有活动真正对应当前困难时复用，否则生成不同角度的新活动。\n${learningFeedbackActionInstructions(actionContext)}\n上下文：${JSON.stringify(context)}\n教学安排：${s.lessonJson}\n当次只读证据（生成与核对共用；参考不是真值）：${JSON.stringify(currentInteraction)}\n近期输入原文（历史对照，不是本题条件）：${JSON.stringify(recent.map(x => ({ input: x.input, response: parseSaved(x.responseJson, null), assistanceAtSubmission: x.assistance, segmentId: x.segmentId, materialVersion: x.materialVersion, stepKey: x.stepKey, exerciseKey: x.exerciseKey })))}\n摘要：${s.summaryJson}\n有效活动与步骤：${JSON.stringify(allowed)}\n实际输入（${kind}）：${input}\n返回 {text,observation,uncertainty:null,verdict:"correct|partial|needs_work|uncertain"(问题可null),action:{type:"activity|step|node|continue|clarify",reason,segmentId?,stepKey?,exerciseKey?,materialVersion?,nodeId?},newActivity?:{title,explanation,activity:{kind:"question|application|discussion|comparison",prompt,answer,criteria:[],hints:[],required:false}}}`, v => validateLearningFeedbackReply(v, actionContext, kind === "answer"), (error, log) => buildLearningFeedbackRepair(error, log, actionContext));
        const checked = await checkGeneratedFeedback(s,result.data,reviewContext,sources,actionContext,kind);
        result.data = checked.reply;
        result.aiCallLogIds.push(...checked.aiCallLogIds);
        await prisma.$transaction(async (tx) => {
            const now = await tx.nodeTeachingSession.findUnique({ where: { id } }), i = await tx.teachingInteraction.findUnique({ where: { id: interaction!.id } });
            if (!now || i?.status !== "pending" || i.generationToken!==token)
                return;
            const newest=b?await tx.teachingSegment.findFirst({where:{sessionId:id,key:b.segment.key,status:"ready"},orderBy:{version:"desc"}}):null;
            const reply: LearningReply = result.data, stale = now.lessonVersion !== s.lessonVersion || (b ? newest?.id!==b.segment.id : false);
            if (reply.newActivity && !stale) {
                const n = reply.newActivity, stepKey = `step-${randomUUID()}`, activity = { ...n.activity, key: `activity-${randomUUID()}` }, m: LearningMaterial = { schemaVersion: 4, title: n.title, summary: n.explanation.slice(0, 3000), limitations: reply.uncertainty ? [reply.uncertainty] : [], steps: [{ key: stepKey, goal: reply.action.reason, explanation: n.explanation, example: "", basis: "unverified", sourceIds: [], activities: [activity] }] };
                const segment = await tx.teachingSegment.create({ data: { sessionId: id, key: `feedback-${i.id}`, requestId: `feedback-${i.id}`, status: "ready", materialJson: JSON.stringify(m), sourceRevision: sourceState.revision, sourceSnapshotJson:JSON.stringify(sources), reviewJson: JSON.stringify({ lessonVersion: s.lessonVersion }),aiCallLogIdsJson:JSON.stringify(result.aiCallLogIds) } });
                reply.action = { type: "activity", reason: reply.action.reason, segmentId: segment.id, stepKey, exerciseKey: activity.key, materialVersion: segment.version };
                delete reply.newActivity;
            }
            if (stale)
                reply.action = { type: "clarify", reason: "反馈属于先前版本，请回看原输入；当前位置未改变。" };
            await tx.teachingInteraction.update({ where: { id: i.id }, data: { status: "complete", responseJson: JSON.stringify(reply), aiCallLogId: result.log.id, errorMessage: null,generationToken:null } });
            const summary = parseSaved<Record<string, unknown>>(now.summaryJson, {}), o = Array.isArray(summary.observations) ? summary.observations : [], u = Array.isArray(summary.unresolved) ? summary.unresolved : [];
            await tx.nodeTeachingSession.update({ where: { id }, data: { revision: { increment: 1 }, summaryJson: JSON.stringify({ ...summary, observations: [...o.slice(-29), { interactionId: i.id, input, observation: reply.observation }], unresolved: reply.uncertainty ? [...u.slice(-29), { interactionId: i.id, text: reply.uncertainty }] : u }) } });
        });
    }
    catch (err) {
        await prisma.teachingInteraction.updateMany({ where: { id: interaction.id, status: "pending",generationToken:token }, data: { status: "failed", errorMessage: failure(err),generationToken:null } });
    }
    return { session: await learningView(await loadLearningSession(id)) };
}
export async function acceptLearningAction(id: string, interactionId: string, value: unknown) { const d = teachingObject(value), s = await loadLearningSession(id); writable(s); version(s, d.revision); const i = await prisma.teachingInteraction.findFirst({ where: { id: interactionId, sessionId: id, status: "complete" } }), reply = parseSaved<LearningReply | null>(i?.responseJson, null); if (!reply)
throw new NodeTeachingError("建议不存在。", 404); if (feedbackCorrection(s, interactionId) || (i && knownFeedbackError(s,i))) throw new NodeTeachingError("这条反馈已更正或存在尚未解除的确定错误，原建议已撤回；请根据核对说明继续。", 409); const a = reply.action; if (a.type === "node")
    return { nodeId: a.nodeId, session: await learningView(s) }; if (!a.segmentId || !a.stepKey)
    return { session: await learningView(s) }; const b = await binding(s, a, a.type === "activity"), p = progressOf(s); if (p.segmentId && p.stepKey)
    p.returnPosition = { segmentId: p.segmentId, stepKey: p.stepKey, interactionId }; p.segmentId = b!.segment.id; p.stepKey = b!.step.key; if (!(await prisma.nodeTeachingSession.updateMany({ where: { id, revision: s.revision }, data: { progressJson: JSON.stringify(p), revision: { increment: 1 } } })).count)
    throw new NodeTeachingError("学习位置已更新。", 409); return { session: await learningView(await loadLearningSession(id)) }; }
export async function addLearningSource(id: string, value: unknown) {
    const d = teachingObject(value), s = await loadLearningSession(id);
    writable(s);
    version(s, d.revision);
    const source = typeof d.text === "string" && d.text.trim() ? (() => { const text = teachingText(d.text, "资料正文", 16000), url = `pasted:${digest(text)}`, title = typeof d.title === "string" ? teachingText(d.title, "资料标题", 300) : "用户提供文本", f = sourceFragments(url, title, text.match(/[\s\S]{1,1600}/g)!.map((text, i) => ({ location: `第${i + 1}段`, text }))); return { url, title, contentHash: digest(f), fragments: f, limitation: "用户提供文本；来源身份和内容准确性未独立核实。" }; })() : await fetchTeachingSource(teachingText(d.url, "来源地址", 2000));
    await prisma.$transaction(async (tx) => { if (!(await tx.nodeTeachingSession.updateMany({ where: { id, revision: s.revision }, data: { sourceRevision: { increment: 1 }, revision: { increment: 1 } } })).count)
        throw new NodeTeachingError("资料请求已过期。", 409); await tx.teachingSource.upsert({ where: { sessionId_url: { sessionId: id, url: source.url } }, create: { sessionId: id, url: source.url, title: source.title, contentHash: source.contentHash, fragmentsJson: JSON.stringify(source.fragments), limitation: source.limitation }, update: { title: source.title, contentHash: source.contentHash, fragmentsJson: JSON.stringify(source.fragments), limitation: source.limitation } }); });
    return { session: await learningView(await loadLearningSession(id)) };
}
async function savedInteractionEvidence(s: NodeTeachingSession, interaction: TeachingInteraction, concern: string) {
    const missingEvidence: string[] = [];
    const segment = interaction.segmentId ? await prisma.teachingSegment.findFirst({where:{id:interaction.segmentId,sessionId:s.id}}) : null;
    const exactVersion = !!segment && segment.version === interaction.materialVersion;
    const material = exactVersion ? parseSaved<LearningMaterial|null>(segment.materialJson, null) : null;
    const step = material?.schemaVersion === 4 ? material.steps.find(item => item.key === interaction.stepKey) : null;
    const activity = step?.activities.find(item => item.key === interaction.exerciseKey) || null;
    const snapshot = exactVersion ? parseSaved<SourceFragment[]>(segment.sourceSnapshotJson, []) : [];
    if (interaction.segmentId && (!exactVersion || !step)) missingEvidence.push("原互动绑定版本的题目或步骤无法恢复；未用当前材料或最新版本替代。" );
    if (interaction.exerciseKey && !activity) missingEvidence.push("原活动身份对应的题目和参考无法恢复；不能推断用户当时回答了哪一道题。" );
    if (!interaction.segmentId) missingEvidence.push("原互动没有绑定保存的步骤或活动；只保留当时的用户原话，不另造题目。" );
    const currentExposure = exactVersion && step && activity ? progressOf(s).exposures[exposureKey(segment.id, segment.version, step.key, activity.key)] || null : null;
    if (!currentExposure) missingEvidence.push("未恢复该版本的具体提示/解答曝光细节；提交时帮助类别仍按原互动保存值提供，不能据此推断提示条数或具体内容。" );
    const plan = exactVersion ? savedLearningSegmentPlan(frameworkOf(s), s.lessonVersion, segment.key, parseSaved<{frameworkHistory?:unknown}>(s.summaryJson, {}).frameworkHistory) : null;
    const requiredOutput = plan?.steps.find(item => item.key === interaction.stepKey)?.requiredOutput || null;
    if (exactVersion && /^l[1-9]\d*--/.test(segment.key) && !requiredOutput) missingEvidence.push("未恢复原版本的框架步骤承诺；不能用当前框架或活动required字段替代。" );
    const sources = selectInteractionSources(snapshot, segment&&step?boundSourceIds(segment.key,step.sourceIds,snapshot):[], await fragments(s), [step?.goal, activity?.prompt, interaction.input, concern].filter(Boolean).join("\n"));
    if (step?.sourceIds.some(sourceId => !sources.some(source => source.id === sourceId))) missingEvidence.push("原步骤引用的部分来源正文未恢复或超出本次预算；未取得的片段不视为已核对。" );
    return buildLearningInteractionEvidence({kind:interaction.kind,interactionId:interaction.id,requestId:interaction.requestId,input:interaction.input,assistanceAtSubmission:interaction.assistance,currentExposure,binding:exactVersion&&step?{segmentId:segment.id,materialVersion:segment.version,requiredOutput,step,activity}:null,sources,missingEvidence});
}
export async function reviewLearningContent(id:string,value:unknown){
 const d=teachingObject(value),s=await loadLearningSession(id);writable(s);
 const requestId=textKey(d.requestId),concern=teachingText(d.concern,"具体疑点",5000),framework=frameworkOf(s);
 const summaryBefore=parseSaved<Record<string,unknown>>(s.summaryJson,{}),reviewHistory=Array.isArray(summaryBefore.contentReviewHistory)?summaryBefore.contentReviewHistory as Record<string,unknown>[]:[];
 const old=[parseSaved<Record<string,unknown>>(s.reviewJson,{}),...reviewHistory].find(r=>r.requestId===requestId);
 if(old){if(old.concern!==concern||old.segmentId!==(d.segmentId||null)||old.materialVersion!==(d.materialVersion||null)||(old.interactionId||null)!==(d.interactionId||null)||(d.lessonVersion!==undefined&&old.lessonVersion!==d.lessonVersion))throw new NodeTeachingError("核对请求已用于另一疑点或材料版本。",409);if(old.status==="complete"||d.retry!==true)return{session:await learningView(s)};}
 const interaction=d.interactionId?await prisma.teachingInteraction.findFirst({where:{id:textKey(d.interactionId),sessionId:id,status:"complete"}}):null;
 const response=parseSaved<LearningReply|null>(interaction?.responseJson,null);
 if(d.interactionId&&!response)throw new NodeTeachingError("核对反馈不存在或不属于当前会话。",404);
 const corrections=Array.isArray(summaryBefore.feedbackCorrections)?summaryBefore.feedbackCorrections as {interactionId:string;text:string}[]:[];
 const feedback=interaction&&response?{interactionId:interaction.id,text:corrections.find(c=>c.interactionId===interaction.id)?.text||response.text}:null;
 version(s,d.revision);const b=d.segmentId?await binding(s,d):null,token=randomUUID(),pending=JSON.stringify({status:"pending",requestId,concern,token,lessonVersion:s.lessonVersion,segmentId:b?.segment.id||null,materialVersion:b?.segment.version||null,interactionId:feedback?.interactionId||null});
 if(!framework&&!b&&!feedback)throw new NodeTeachingError("请选择已保存的反馈或实际教学材料进行核对。");
 if(!(await prisma.nodeTeachingSession.updateMany({where:{id,revision:s.revision},data:{reviewJson:pending,revision:{increment:1}}})).count)throw new NodeTeachingError("核对请求已过期。",409);
 try{
   const selectedEvidence=interaction?await savedInteractionEvidence(s,interaction,concern):null;
   const sources=selectedEvidence?[...new Map([...selectedEvidence.sources,...(b?parseSaved<SourceFragment[]>(b.segment.sourceSnapshotJson,[]).filter(source=>!selectedEvidence.sources.some(original=>original.id===source.id)):[])].map(source=>[source.id,source])).values()]:b?parseSaved<SourceFragment[]>(b.segment.sourceSnapshotJson,[]):selectFragments(await fragments(s),concern+s.contextJson,8);
   const context={...parseSaved<LearningContext>(s.contextJson,{} as LearningContext),...(selectedEvidence?{currentInteraction:{...selectedEvidence,sources,...(b?{sourceLimitations:`${selectedEvidence.sourceLimitations} 用户同时显式选择的教学材料另按其保存快照核对；合并后实际提供${sources.length}段、${sources.reduce((count,source)=>count+source.text.length,0)}字符，不将交互检索预算冒称为合并后的总量。`}:{})}}:{})};
   const displayedReply=interaction?effectiveLearningReply(s,interaction):null;
   const feedbackCandidate=displayedReply?{...displayedReply,text:feedback!.text}:null;
   const boundError=interaction?knownFeedbackError(s,interaction,feedback?.text):null;
   const reviewInput={framework,material:b?.material||null,feedback,sources,concern,context:{...context,...(feedbackCandidate?{feedbackCandidate}:{}),...(boundError?{confirmedFeedbackError:boundError}:{})}};
  const result=await generate(s,"node_knowledge_check",buildLearningKnowledgeReviewPrompt(reviewInput),v=>validateFocusedReview(v,framework,b?.material||null,feedback),(error,log)=>buildLearningKnowledgeReviewRepair(error,log,reviewInput));
   if(boundError&&result.data.verdict!=="confirmed_error") throw new NodeTeachingError("该反馈原文已有尚未更正的确定错误；新的无错或不确定意见不能解除原错误，判断与建议继续撤回。");
   if(interaction&&feedback&&result.data.verdict==="confirmed_error"&&result.data.findings.some(finding=>finding.target==="feedback")){
     const evidence={confirmedFeedbackError:true,correctionVerified:false,originRequestId:requestId,interactionId:interaction.id,originalResponseDigest:digest(interaction.responseJson||"null"),reviewedFeedbackDigest:digest(feedback.text),verdict:"confirmed_error",summary:result.data.summary,findings:result.data.findings.filter(finding=>finding.target==="feedback"),aiCallLogIds:[...result.aiCallLogIds]};
     const retained=await prisma.$transaction(async tx=>{
       const now=await tx.nodeTeachingSession.findUnique({where:{id}}),selected=await tx.teachingInteraction.findUnique({where:{id:interaction.id}});
       if(!now||now.reviewJson!==pending||selected?.responseJson!==interaction.responseJson)return false;
       const active=feedbackCorrection(now,interaction.id)?.text||response!.text;
       if(active!==feedback.text)return false;
       const summary=parseSaved<Record<string,unknown>>(now.summaryJson,{}),history=Array.isArray(summary.contentReviewHistory)?summary.contentReviewHistory as Record<string,unknown>[]:[];
       const duplicate=history.some(entry=>entry.confirmedFeedbackError===true&&entry.originRequestId===requestId&&entry.originalResponseDigest===evidence.originalResponseDigest&&entry.reviewedFeedbackDigest===evidence.reviewedFeedbackDigest);
       if(!duplicate)await tx.nodeTeachingSession.update({where:{id},data:{summaryJson:JSON.stringify({...summary,contentReviewHistory:[...history,evidence]}),revision:{increment:1}}});
       return true;
     });
     if(!retained)throw new NodeTeachingError("反馈或核对请求已更新，当前确定错误没有绑定到新版本；原调用记录保留。",409);
   }
  let corrected=applyContentFindings(result.data,framework,b?.material||null,feedback);
  const hasMaterial=result.data.findings.some(f=>f.target==="material"),hasFeedback=result.data.findings.some(f=>f.target==="feedback");
  let correctionUncertainty:string|null=null;
  if(result.data.verdict==="confirmed_error"){
    const reviewCandidate=(mainIdea:string):LearningFramework=>({schemaVersion:4,title:"当前更正候选",purpose:concern,scope:context.focus,mainIdea,prerequisites:[],limitations:[],segments:[]});
    if(result.data.findings.some(f=>f.target!=="feedback")){
      const checked=await checkGeneratedKnowledge(s,corrected.framework||reviewCandidate("核对当前实际材料，不生成课程框架。"),corrected.material,sources,concern,result.data.findings.some(f=>f.target==="framework"),context);
      corrected={...corrected,framework:corrected.framework?checked.framework:null,material:checked.material};
      result.aiCallLogIds.push(...checked.aiCallLogIds);
      if(checked.review?.verdict==="uncertain")correctionUncertainty=String(checked.review.summary||"更正候选尚待核对。");
    }
    if(hasFeedback&&corrected.feedback){
      const kind=interaction?.kind==="answer"?"answer":"question",candidate=feedbackCandidate?withdrawCorrectedFeedbackJudgment({...feedbackCandidate,text:corrected.feedback.text},kind):null;
      const checked=await checkGeneratedKnowledge(s,reviewCandidate(corrected.feedback.text),null,sources,concern,false,context,candidate?{reply:candidate,kind}:undefined);
      corrected.feedback.text=checked.framework.mainIdea;
      result.aiCallLogIds.push(...checked.aiCallLogIds);
      if(checked.review?.verdict==="uncertain")correctionUncertainty=String(checked.review.summary||"更正候选尚待核对。");
    }
  }
  const hasFramework=!!framework&&corrected.framework?.mainIdea!==framework.mainIdea;
  const finalFindings=result.data.findings.map(f=>{
    const original=findingValue(f,framework,b?.material||null,feedback),replacement=findingValue(f,corrected.framework,corrected.material,corrected.feedback);
    return typeof original==="string"&&typeof replacement==="string"?{...f,quote:original,replacement}:f;
  });
  if(corrected.framework)validateLearningFramework(corrected.framework,parseSaved<LearningContext>(s.contextJson,{} as LearningContext).contentQuestions||[]);
  if(corrected.material&&b&&framework){const plan=framework.segments.find(p=>p.key===b.segment.key.slice(prefix(s).length));if(plan)validateLearningMaterial(corrected.material,plan,sources);}
  await prisma.$transaction(async tx=>{const now=await tx.nodeTeachingSession.findUnique({where:{id}});if(!now||now.reviewJson!==pending)return;
   const newest=b?await tx.teachingSegment.findFirst({where:{sessionId:id,key:b.segment.key,status:"ready"},orderBy:{version:"desc"}}):null;
   const selectedFeedback=interaction?await tx.teachingInteraction.findUnique({where:{id:interaction.id}}):null;
   const stale=!!correctionUncertainty||now.sourceRevision!==s.sourceRevision||now.lessonVersion!==s.lessonVersion||(b&&newest?.id!==b.segment.id)||(interaction&&selectedFeedback?.responseJson!==interaction.responseJson),summary=parseSaved<Record<string,unknown>>(now.summaryJson,{}),history=Array.isArray(summary.frameworkHistory)?summary.frameworkHistory:[];
   let correctedMaterialVersion:number|null=null,correctedProgress:LearningProgressState|null=null;
   if(!stale&&!hasFramework&&corrected.material&&b&&hasMaterial){const next=await tx.teachingSegment.create({data:{sessionId:id,key:b.segment.key,version:b.segment.version+1,requestId:`review-${requestId}`,status:"ready",materialJson:JSON.stringify(corrected.material),sourceRevision:b.segment.sourceRevision,sourceSnapshotJson:b.segment.sourceSnapshotJson,reviewJson:JSON.stringify({...result.data,lessonVersion:s.lessonVersion}),aiCallLogIdsJson:JSON.stringify(result.aiCallLogIds)}});correctedMaterialVersion=next.version;
    const liveProgress=progressOf(now);
    if(liveProgress.segmentId===b.segment.id&&corrected.material.steps.some(step=>step.key===liveProgress.stepKey))correctedProgress={...liveProgress,segmentId:next.id};
   }
   const outcome={...result.data,findings:finalFindings,...(correctionUncertainty?{uncertainty:correctionUncertainty}:{}),status:"complete",requestId,concern,lessonVersion:s.lessonVersion,segmentId:b?.segment.id||null,materialVersion:b?.segment.version||null,interactionId:feedback?.interactionId||null,aiCallLogIds:result.aiCallLogIds,correctedFrameworkVersion:!stale&&hasFramework?s.lessonVersion+1:null,correctedMaterialVersion,correctedFeedback:!stale&&hasFeedback?corrected.feedback:null,...(stale?{summary:correctionUncertainty?"发现具体错误，但更正候选仍待核对，已保留原文和模型调用记录。":"核对结果属于旧材料，已保留；没有修改新版本。"}:{})};
   const previousCorrections=Array.isArray(summary.feedbackCorrections)?summary.feedbackCorrections as {interactionId:string;text:string}[]:[],previousReviews=Array.isArray(summary.contentReviewHistory)?summary.contentReviewHistory:[];
   await tx.nodeTeachingSession.update({where:{id},data:{reviewJson:JSON.stringify(outcome),...(correctedProgress?{progressJson:JSON.stringify(correctedProgress)}:{}),summaryJson:JSON.stringify({...summary,contentReviewHistory:[...previousReviews,publicContentReview(outcome)],...(!stale&&hasFeedback?{feedbackCorrections:[...previousCorrections.filter(c=>c.interactionId!==feedback!.interactionId),{...corrected.feedback,requestId}]}:{}),...(!stale&&hasFramework?{frameworkHistory:[...history,{lessonVersion:s.lessonVersion,context:parseSaved(s.contextJson,{}),framework}]}:{})}),...(!stale&&hasFramework?{lessonVersion:s.lessonVersion+1,lessonJson:JSON.stringify(corrected.framework)}:{}),revision:{increment:1}}});
  });
 }catch(e){await prisma.nodeTeachingSession.updateMany({where:{id,reviewJson:pending},data:{reviewJson:JSON.stringify({...JSON.parse(pending),status:"failed",error:failure(e),limitation:"核对请求失败不代表内容正确或错误。"}),revision:{increment:1}}});}
 return{session:await learningView(await loadLearningSession(id))};
}
