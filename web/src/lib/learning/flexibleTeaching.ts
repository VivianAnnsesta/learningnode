import { NodeTeachingError, teachingObject, teachingText } from "./nodeTeaching";
import type { SourceFragment } from "./teachingContracts";
import type { CourseContentQuestion } from "./roadmapPlanningTypes";
export type ContentAssignment={contentQuestionKey:string;requirementIndices:number[]};
export type LearningContext = {
    schemaVersion: 4;
    focus: string;
    contentQuestions?:CourseContentQuestion[];
    planningKnowledge?: unknown;
    domain: {
        id: string;
        name: string;
        goal: string;
        scope: string;
        assumptions: string;
    } | null;
    task: {
        id: string;
        title: string;
        objective: string;
        question: string;
        scope?:string;
        newKnowledge?:string;
        teachingTasks?:string[];
        /** Planning text, not an already displayed activity or a required output. */
        example?:string;
        commonMistake?:string;
        transferPrompt?:string;
        prerequisites: {
            id: string;
            title: string;
            status: string;
            understanding: string | null;
            scope?:string;
            teachingTasks?:string[];
            explanations?:string[];
            questions?:string[];
        }[];
    } | null;
    record: {
        id: string;
        revisionId: string;
        title: string;
        body: string;
    } | null;
    returnTo: {
        sessionId?: string;
        segmentId?: string;
        stepKey?: string;
        href?: string;
    } | null;
};
export type LearningFramework = {
    schemaVersion: 4;
    title: string;
    purpose: string;
    scope: string;
    mainIdea: string;
    prerequisites: {
        knowledge: string;
        use: string;
        support: string;
    }[];
    limitations: string[];
    segments: {
        key: string;
        title: string;
        goal: string;
        steps: {
            key: string;
            goal: string;
            requiredOutput: "none" | "attempt" | "record";
            contentAssignments?:ContentAssignment[];
        }[];
    }[];
};
export type LearningActivity = {
    key: string;
    kind: "question" | "application" | "discussion" | "comparison";
    prompt: string;
    answer: string | null;
    criteria: string[];
    hints: string[];
    required: boolean;
};
export type LearningMaterial = {
    schemaVersion: 4;
    title: string;
    summary: string;
    limitations: string[];
    steps: {
        key: string;
        goal: string;
        explanation: string;
        example: string;
        basis: "source" | "derivation" | "analogy" | "unverified";
        sourceIds: string[];
        activities: LearningActivity[];
        contentAssignments?:ContentAssignment[];
    }[];
};
export type LearningProgressState = {
    segmentId: string | null;
    stepKey: string | null;
    drafts: Record<string, string>;
    understandingDraft: string;
    exposures: Record<string, {
        hints: number;
        solution: boolean;
    }>;
    visited: string[];
    skipped: string[];
    returnPosition: {
        segmentId: string;
        stepKey: string;
        interactionId: string;
    } | null;
    endedAt: string | null;
};
export type LearningReply = {
    text: string;
    observation: string;
    uncertainty: string | null;
    verdict: "correct" | "partial" | "needs_work" | "uncertain" | null;
    action: {
        type: "activity" | "step" | "node" | "continue" | "clarify";
        reason: string;
        segmentId?: string;
        stepKey?: string;
        exerciseKey?: string;
        materialVersion?: number;
        nodeId?: string;
    };
    newActivity?: {
        title: string;
        explanation: string;
        activity: LearningActivity;
    };
};
export type PublicLearningMaterial = Omit<LearningMaterial, "steps"> & {
    steps: (Omit<LearningMaterial["steps"][number], "activities"> & {
        activities: (Omit<LearningActivity, "answer" | "hints" | "criteria"> & {
            hintCount: number;
            visibleHints: string[];
            solution: string | null;
            criteria?: string[];
        })[];
    })[];
};
export type LearningView = {
    id: string;
    domainId: string | null;
    nodeId: string | null;
    scopeKey: string;
    revision: number;
    lessonVersion: number;
    status: string;
    error: string | null;
    historical: boolean;
    context: LearningContext;
    framework: LearningFramework | null;
    progress: LearningProgressState;
    segments: {
        id: string;
        requestId: string;
        key: string;
        version: number;
        active: boolean;
        status: string;
        error: string | null;
        material: PublicLearningMaterial | null;
        sources: SourceFragment[];
    }[];
    interactions: {
        id: string;
        correction?: { text: string; requestId: string };
        requestId: string;
        kind: string;
        input: string;
        segmentId: string | null;
        stepKey: string | null;
        exerciseKey: string | null;
        materialVersion: number | null;
        status: string;
        assistance: number;
        response: LearningReply | null;
        error: string | null;
    }[];
    summary: unknown;
    contentReview?:unknown;
    history: {
        id: string;
        lessonVersion: number;
        historical: boolean;
    }[];
    legacy?: unknown;
    sources: {
        url: string;
        title: string;
        limitation: string | null;
    }[];
};
export const emptyLearningProgress = (): LearningProgressState => ({ segmentId: null, stepKey: null, drafts: {}, understandingDraft: "", exposures: {}, visited: [], skipped: [], returnPosition: null, endedAt: null });
export const learningKey = (v: unknown, label = "标识") => { const key = teachingText(v, label, 120); if (!/^[a-zA-Z0-9_-]+$/.test(key) || key in Object.prototype)
    throw new NodeTeachingError(`${label}不合法。`); return key; };
export const textList = (v: unknown, label: string, max = 30): string[] => { if (!Array.isArray(v) || v.length > max)
    throw new NodeTeachingError(`${label}不合法。`); return v.map(x => teachingText(x, label, 4000)); };
const arr = (v: unknown, label: string, max: number) => { if (!Array.isArray(v) || v.length > max)
    throw new NodeTeachingError(`${label}不合法。`); return v; };
function unwrap(v: unknown) { const d = teachingObject(v); return d.type === "json_object" && d.content ? teachingObject(d.content) : d; }
export function validateLearningFramework(v: unknown, questions:CourseContentQuestion[]=[]): LearningFramework {
    const d = unwrap(v), keys = new Set<string>();
    const segments = arr(d.segments, "教学安排", 10).map(raw => {
        const s = teachingObject(raw), key = learningKey(s.key);
        if (keys.has(key))
            throw new NodeTeachingError("教学标识重复。");
        keys.add(key);
        const steps = arr(s.steps, "教学步骤", 12).map(rawStep => { const step = teachingObject(rawStep), stepKey = learningKey(step.key); if (keys.has(stepKey))
            throw new NodeTeachingError("教学标识重复。"); keys.add(stepKey); const requiredOutput = step.requiredOutput === "optional" ? "none" : step.requiredOutput || "none"; if (!["none", "attempt", "record"].includes(String(requiredOutput)))
            throw new NodeTeachingError("任务产出要求无效；requiredOutput只能为none、attempt或record，可选阅读/讨论用none。");
            const contentAssignments=arr(step.contentAssignments||[],"内容承接",30).map(x=>{const a=teachingObject(x),q=questions.find(q=>q.key===a.contentQuestionKey);if(!q||!Array.isArray(a.requirementIndices)||!a.requirementIndices.length||a.requirementIndices.some(i=>!Number.isSafeInteger(i)||!q.requirementIndices?.includes(i as number)))throw new NodeTeachingError("教学步骤引用未分配的内容要求。");return{contentQuestionKey:q.key,requirementIndices:[...new Set(a.requirementIndices as number[])]};});
            if (requiredOutput !== "none" && contentAssignments.length && contentAssignments.every(a => questions.find(q => q.key === a.contentQuestionKey)?.importance === "optional")) throw new NodeTeachingError("选学内容不能自动成为必须作答或保存的完成要求，请保留可跳过的教学。");
            if (requiredOutput !== "none" && questions.length && questions.every(q => q.importance === "optional")) throw new NodeTeachingError("纯选学任务的所有教学步骤都应允许跳过，不能通过未标分工的步骤新增必须产出。");
            return { key: stepKey, goal: teachingText(step.goal, "步骤目标", 1600), requiredOutput: requiredOutput as "none" | "attempt" | "record",...(contentAssignments.length?{contentAssignments}:{}) }; });
        if (!steps.length)
            throw new NodeTeachingError("教学安排需要可进入的步骤。");
        return { key, title: teachingText(s.title, "教学标题", 300), goal: teachingText(s.goal, "教学目的", 1600), steps };
    });
    if (!segments.length)
        throw new NodeTeachingError("请提供至少一项实际教学安排。");
    for(const q of questions)for(const i of q.requirementIndices||[])if(!segments.some(p=>p.steps.some(s=>s.contentAssignments?.some(a=>a.contentQuestionKey===q.key&&a.requirementIndices.includes(i)))))throw new NodeTeachingError(`教学安排尚未承接内容要求 ${q.key}[${i}]。`);
    return { schemaVersion: 4, title: teachingText(d.title, "教学标题", 300), purpose: teachingText(d.purpose, "当前用途", 3000), scope: teachingText(d.scope, "教学范围", 3000), mainIdea: teachingText(d.mainIdea, "核心解释", 5000), prerequisites: arr(d.prerequisites || [], "前置说明", 20).map(x => { const p = teachingObject(x); return { knowledge: teachingText(p.knowledge, "前置知识", 1000), use: teachingText(p.use, "前置用途", 2000), support: teachingText(p.support, "补讲方式", 3000) }; }), limitations: textList(d.limitations || [], "局限"), segments };
}
export function validateLearningActivity(v: unknown): LearningActivity {
    const a = teachingObject(v);
    if (!["question", "application", "discussion", "comparison"].includes(String(a.kind)))
        throw new NodeTeachingError("活动类型无效。");
    const criteria=textList(a.criteria || [], "回应依据", 12); if(!criteria.length)throw new NodeTeachingError("活动需要说明参考或讨论依据。");
    return { key: "pending", kind: a.kind as LearningActivity["kind"], prompt: teachingText(a.prompt, "活动问题", 8000), answer: a.answer ? teachingText(a.answer, "参考回应", 12000) : null, criteria, hints: textList(a.hints || [], "提示", 6), required: a.required === true };
}
export function validateLearningMaterial(v: unknown, plan: LearningFramework["segments"][number], sources: SourceFragment[]): LearningMaterial {
    const d = unwrap(v), allowed = sources.map(s => s.id), seen = new Set<string>();
    const steps = arr(d.steps, "正文步骤", 12).map(x => {
        const s = teachingObject(x), key = learningKey(s.key);
        const planned = plan.steps.find(p => p.key === key);
        if (!planned || seen.has(key))
            throw new NodeTeachingError("正文引用了未安排或重复的步骤。");
        seen.add(key);
        const ids = textList(s.sourceIds || [], "来源引用");
        if (ids.some(id => !allowed.includes(id)))
            throw new NodeTeachingError("正文引用了未获得的资料片段。");
        if (!["source", "derivation", "analogy", "unverified"].includes(String(s.basis)) || (s.basis === "source" && !ids.length))
            throw new NodeTeachingError("资料支持声明缺少实际引用。");
        const activities = arr(s.activities || [], "活动", 5).map(raw => {
            const activity = validateLearningActivity(raw);
            return { ...activity, required: planned.requiredOutput === "attempt" && activity.required };
        });
        if (planned.requiredOutput === "attempt" && !activities.some(a => a.required))
            throw new NodeTeachingError("已说明需要尝试的步骤缺少对应活动。");
        return { key, goal: planned.goal, explanation: teachingText(s.explanation, "讲解", 18000), example: teachingText(s.example || "", "例子", 14000, true), basis: s.basis as LearningMaterial["steps"][number]["basis"], sourceIds: ids, activities,...(planned.contentAssignments?{contentAssignments:planned.contentAssignments}:{}) };
    });
    if (plan.steps.some(s => !seen.has(s.key)))
        throw new NodeTeachingError("正文缺少已安排的教学步骤。");
    return { schemaVersion: 4, title: teachingText(d.title || plan.title, "标题", 300), summary: teachingText(d.summary, "摘要", 3000), limitations: textList(d.limitations || [], "局限"), steps };
}
export const exposureKey = (segmentId: string, version: number, stepKey: string, exerciseKey: string) => `${segmentId}:${version}:${stepKey}:${exerciseKey}`;
export function publicLearningReply(reply:LearningReply|null):LearningReply|null {
    if(!reply)return null;
    const action=reply.action;
    const safeAction:LearningReply['action']={type:action.type,reason:action.reason};
    for(const key of ['segmentId','stepKey','exerciseKey','materialVersion','nodeId'] as const)if(action[key]!==undefined)Object.assign(safeAction,{[key]:action[key]});
    return{text:reply.text,observation:reply.observation,uncertainty:reply.uncertainty,verdict:reply.verdict,action:safeAction};
}
export function publicLearningMaterial(m: LearningMaterial, segmentId: string, version: number, p: LearningProgressState, plan?: LearningFramework["segments"][number]): PublicLearningMaterial { return { ...m, steps: m.steps.map(s => ({ ...s, activities: s.activities.map(a => { const exposure = p.exposures[exposureKey(segmentId, version, s.key, a.key)]; const { answer, hints, criteria, ...rest } = a; const requiredOutput = plan?.steps.find(step => step.key === s.key)?.requiredOutput; return { ...rest, required: requiredOutput === "attempt" && a.required, hintCount: hints.length, visibleHints: hints.slice(0, exposure?.hints || 0), solution: exposure?.solution ? answer : null, ...(exposure?.solution ? {criteria} : {}) }; }) })) }; }
export function validateLearningReply(v: unknown, allowed: {
    segmentId: string;
    stepKey: string;
    exerciseKey: string;
    materialVersion: number;
}[], nodeIds: string[], answering: boolean): LearningReply {
    const d = unwrap(v), a = teachingObject(d.action || { type: "continue", reason: "继续当前问题" });
    if (!["activity", "step", "node", "continue", "clarify"].includes(String(a.type)))
        throw new NodeTeachingError("教学动作无效。");
    const action: LearningReply["action"] = { type: a.type as LearningReply["action"]["type"], reason: teachingText(a.reason, "建议理由", 2000) };
    if (a.type === "activity" && !d.newActivity) {
        const found = allowed.find(x => x.segmentId === a.segmentId && x.stepKey === a.stepKey && x.exerciseKey === a.exerciseKey && x.materialVersion === a.materialVersion);
        if (!found)
            throw new NodeTeachingError("建议没有引用有效活动及版本。");
        Object.assign(action, {segmentId:found.segmentId,stepKey:found.stepKey,exerciseKey:found.exerciseKey,materialVersion:found.materialVersion});
    }
    if (a.type === "step") {
        const found = allowed.find(x => x.segmentId === a.segmentId && x.stepKey === a.stepKey);
        if (!found)
            throw new NodeTeachingError("建议引用了不存在的步骤。");
        Object.assign(action, { segmentId: found.segmentId, stepKey: found.stepKey, materialVersion: found.materialVersion });
    }
    if (a.type === "node") {
        if (!nodeIds.includes(String(a.nodeId)))
            throw new NodeTeachingError("建议引用了不存在的节点。");
        action.nodeId = String(a.nodeId);
    }
    let newActivity: LearningReply["newActivity"];
    if (d.newActivity) {
        const n = teachingObject(d.newActivity);
        if (a.type !== "activity")
            throw new NodeTeachingError("新活动必须提供进入动作。");
        newActivity = { title: teachingText(n.title, "活动标题", 300), explanation: teachingText(n.explanation, "活动前讲解", 10000), activity: validateLearningActivity(n.activity) };
    }
    const verdict = ["correct", "partial", "needs_work", "uncertain"].includes(String(d.verdict)) ? d.verdict as NonNullable<LearningReply["verdict"]> : null;
    if (answering && !verdict)
        throw new NodeTeachingError("作答反馈需说明判断或不确定性。");
    return { text: teachingText(d.text, "回应", 16000), observation: teachingText(d.observation || "", "本次观察", 2000, true), uncertainty: d.uncertainty ? teachingText(d.uncertainty, "不确定性", 2000) : null, verdict, action, ...(newActivity ? { newActivity } : {}) };
}
