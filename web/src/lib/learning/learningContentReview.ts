import { teachingObject, teachingText, NodeTeachingError } from "./nodeTeaching";
import type { LearningFramework, LearningMaterial } from "./flexibleTeaching";

export type FeedbackReviewInput = { interactionId: string; text: string };
export type ContentFinding = {
    target: "framework" | "material" | "feedback";
    stepKey?: string;
    activityKey?: string;
    interactionId?: string;
    field: string;
    quote: string;
    reason: string;
    replacement: string;
};
export type FocusedContentReview = {
    verdict: "confirmed_error" | "no_error_found" | "uncertain";
    summary: string;
    uncertainty: string | null;
    findings: ContentFinding[];
};

export function findingValue(f: ContentFinding, framework: LearningFramework | null, material: LearningMaterial | null, feedback?: FeedbackReviewInput | null) {
    if (f.target === "feedback") {
        if (!feedback || f.interactionId !== feedback.interactionId) throw new NodeTeachingError(`feedback核对必须引用选中的interactionId：${feedback?.interactionId || "无选中反馈"}。`);
        if (f.field !== "text") throw new NodeTeachingError("target=feedback时field必须为text，不能使用explanation或mainIdea；保留原quote、reason和replacement，仅修复字段约定。");
        return feedback.text;
    }
    if (f.target === "framework") {
        if (!framework || f.field !== "mainIdea") throw new NodeTeachingError("知识核对只能修正实际框架的核心解释，范围和教学身份需显式重新备课。");
        return framework.mainIdea;
    }
    const step = material?.steps.find(s => s.key === f.stepKey);
    if (!step) throw new NodeTeachingError("核对引用了未知步骤。");
    if (f.field === "explanation" || f.field === "example") return step[f.field];
    const activity = step.activities.find(a => a.key === f.activityKey);
    if (!activity || !["answer", "criteria", "hints"].includes(f.field)) throw new NodeTeachingError("核对引用了未知活动或字段。");
    return activity[f.field as "answer" | "criteria" | "hints"];
}

export function validateFocusedReview(value: unknown, framework: LearningFramework | null, material: LearningMaterial | null, feedback?: FeedbackReviewInput | null): FocusedContentReview {
    const d = teachingObject(value);
    if (!["confirmed_error", "no_error_found", "uncertain"].includes(String(d.verdict)) || !Array.isArray(d.findings) || d.findings.length > 15) throw new NodeTeachingError("具体疑点核对结构无效。");
    const findings = d.findings.map(raw => {
        const p = teachingObject(raw);
        if (!["framework", "material", "feedback"].includes(String(p.target))) throw new NodeTeachingError("核对目标无效。");
        const f: ContentFinding = {
            target: p.target as ContentFinding["target"], field: teachingText(p.field, "核对字段", 50),
            quote: teachingText(p.quote, "原文引用", 3000), reason: teachingText(p.reason, "错误依据", 3000), replacement: teachingText(p.replacement, "修正文字", 5000),
            ...(p.stepKey ? { stepKey: String(p.stepKey) } : {}), ...(p.activityKey ? { activityKey: String(p.activityKey) } : {}), ...(p.interactionId ? { interactionId: String(p.interactionId) } : {})
        };
        if (f.target === "material" && !Object.prototype.hasOwnProperty.call(p, "stepKey") && f.activityKey && ["answer", "criteria", "hints"].includes(f.field)) {
            const matches = material?.steps.flatMap(step => step.activities.filter(activity => activity.key === f.activityKey).map(activity => ({ step, activity }))) || [];
            if (matches.length === 1) {
                const original = matches[0].activity[f.field as "answer" | "criteria" | "hints"];
                if (Array.isArray(original) ? original.some(text => text.includes(f.quote)) : original?.includes(f.quote)) f.stepKey = matches[0].step.key;
            }
        }
        if (f.quote.replace(/\s+/g, "") === f.replacement.replace(/\s+/g, "")) throw new NodeTeachingError("修正文字与当前引用原文相同，未形成事实更正。请重新核对当前候选；已纠正的旧疑点不得继续报错。若无实际错误，返回 no_error_found 和空 findings，不把重复或风格要求报成知识错误。");
        const original = findingValue(f, framework, material, feedback);
        if (!(Array.isArray(original) ? original.some(s => s.includes(f.quote)) : original?.includes(f.quote))) throw new NodeTeachingError("核对结论未引用当前内容的真实原文。");
        return f;
    });
    if ((d.verdict === "confirmed_error") !== !!findings.length) throw new NodeTeachingError("只有确认当前原文错误时才能给出修正；核对失败和不确定需另行说明。");
    return { verdict: d.verdict as FocusedContentReview["verdict"], summary: teachingText(d.summary, "核对结论", 4000), uncertainty: d.uncertainty ? teachingText(d.uncertainty, "核对局限", 3000) : null, findings };
}

export function applyContentFindings<T extends LearningFramework | null>(review: FocusedContentReview, framework: T, material: LearningMaterial | null, feedback?: FeedbackReviewInput | null) {
    const f = structuredClone(framework), m = material ? structuredClone(material) : null, reply = feedback ? structuredClone(feedback) : null;
    for (const p of review.findings) {
        findingValue(p, f, m, reply);
        if (p.target === "feedback") reply!.text = reply!.text.replace(p.quote, p.replacement);
        else if (p.target === "framework") f!.mainIdea = f!.mainIdea.replace(p.quote, p.replacement);
        else {
            const step = m!.steps.find(s => s.key === p.stepKey)!;
            if (p.field === "explanation" || p.field === "example") step[p.field] = step[p.field].replace(p.quote, p.replacement);
            else {
                const activity = step.activities.find(a => a.key === p.activityKey)!;
                if (p.field === "answer") activity.answer = activity.answer!.replace(p.quote, p.replacement);
                else {
                    const field = p.field as "criteria" | "hints", index = activity[field].findIndex(x => x.includes(p.quote));
                    activity[field][index] = activity[field][index].replace(p.quote, p.replacement);
                }
            }
        }
    }
    return { framework: f, material: m, feedback: reply };
}

export function publicContentReview(value: unknown) {
    if (!value || typeof value !== "object") return null;
    const d = value as Record<string, unknown>;
    const privateFinding = Array.isArray(d.findings) && d.findings.some(f => ["answer", "hints", "criteria"].includes(String((f as Record<string, unknown>).field)));
    return {
        status: d.status, requestId: d.requestId, concern: d.concern, summary: privateFinding ? "参考内容的具体错误已记录；解答及依据仍按查看操作展示。" : d.correctedFeedback || d.correctedFrameworkVersion || d.correctedMaterialVersion ? "已按引用局部纠正明确错误，原文仍可回看；模型核对不等于权威证明。" : d.summary, verdict: d.verdict, uncertainty: privateFinding ? "模型核对不等于权威验证。" : d.uncertainty, error: d.error,
        lessonVersion: d.lessonVersion, segmentId: d.segmentId, materialVersion: d.materialVersion, interactionId: d.interactionId,
        correctedFrameworkVersion: d.correctedFrameworkVersion, correctedMaterialVersion: d.correctedMaterialVersion, correctedFeedback: d.correctedFeedback,
        findings: Array.isArray(d.findings) ? d.findings.map(f => {
            const p = f as Record<string, unknown>;
            return { target: p.target, stepKey: p.stepKey, interactionId: p.interactionId, ...(["answer", "hints", "criteria"].includes(String(p.field)) ? { reason: "参考内容需更正，修正已保存；查看参考回应后可阅读。", quote: "参考内容核对结果未自动展开" } : { reason: p.reason, quote: p.quote, replacement: p.replacement }) };
        }) : []
    };
}
