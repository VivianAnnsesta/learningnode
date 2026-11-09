import type { LearningReply } from "./flexibleTeaching";
import { learningFeedbackActionInstructions, validateLearningFeedbackReply, type LearningFeedbackActionContext } from "./learningFeedbackActions";
import { NodeTeachingError, teachingObject, teachingText } from "./nodeTeaching";
import type { SourceFragment } from "./teachingContracts";

export type LearningFeedbackReviewField = "text" | "observation" | "uncertainty" | "verdict" | "action" | "newActivity";
export type LearningFeedbackReview = {
    verdict: "confirmed_error" | "no_error_found" | "uncertain";
    summary: string;
    uncertainty: string | null;
    findings: { field: LearningFeedbackReviewField; quote: string; reason: string }[];
    replacement: LearningReply | null;
};
export type LearningFeedbackReviewInput = {
    reply: LearningReply;
    context: unknown;
    sources: SourceFragment[];
    actionContext: LearningFeedbackActionContext;
    kind: "answer" | "question";
    previousReview?: unknown;
};
const fields: LearningFeedbackReviewField[] = ["text", "observation", "uncertainty", "verdict", "action", "newActivity"];
const has = (value: Record<string, unknown>, key: string) => Object.prototype.hasOwnProperty.call(value, key);

/** Quotes use the current field verbatim; missing optional values are represented as null. */
function fieldText(reply: LearningReply, field: LearningFeedbackReviewField): string {
    const value = reply[field] ?? null;
    return typeof value === "string" ? value : JSON.stringify(value);
}
function canonical(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(canonical);
    if (value !== null && typeof value === "object") {
        return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
    }
    return value;
}
function sameField(before: LearningReply, after: LearningReply, field: LearningFeedbackReviewField): boolean {
    return JSON.stringify(canonical(before[field] ?? null)) === JSON.stringify(canonical(after[field] ?? null));
}

export function validateLearningFeedbackReview(
    value: unknown,
    reply: LearningReply,
    actionContext: LearningFeedbackActionContext,
    kind: "answer" | "question",
): LearningFeedbackReview {
    const d = teachingObject(value);
    if (typeof d.verdict !== "string" || !["confirmed_error", "no_error_found", "uncertain"].includes(d.verdict)
        || !Array.isArray(d.findings) || d.findings.length > 15) {
        throw new NodeTeachingError("完整反馈核对结构无效。");
    }
    const summary = teachingText(d.summary, "完整反馈核对结论", 4000);
    const uncertainty = d.uncertainty === null ? null : teachingText(d.uncertainty, "完整反馈核对局限", 3000);
    const findings: LearningFeedbackReview["findings"] = d.findings.map(raw => {
        const finding = teachingObject(raw);
        if (!fields.includes(finding.field as LearningFeedbackReviewField)) {
            throw new NodeTeachingError("完整反馈核对只能引用 text、observation、uncertainty、verdict、action 或 newActivity，不能更改用户输入、原题或课程范围。");
        }
        const field = finding.field as LearningFeedbackReviewField;
        const original = fieldText(reply, field);
        if (typeof finding.quote !== "string" || finding.quote.length > 100000
            || (finding.quote.length === 0 && original.length !== 0) || !original.includes(finding.quote)) {
            throw new NodeTeachingError(`完整反馈核对的 ${field} 引用不是当前字段原文；对象按 JSON.stringify 序列化，空值用字符串 null，优先引用整个字段。`);
        }
        return { field, quote: finding.quote, reason: teachingText(finding.reason, "完整反馈错误依据", 4000) };
    });
    if (d.verdict !== "confirmed_error") {
        if (findings.length || d.replacement !== null) {
            throw new NodeTeachingError("未确认错误时 findings 必须为空且 replacement 必须显式为 null。");
        }
        return { verdict: d.verdict as LearningFeedbackReview["verdict"], summary, uncertainty, findings, replacement: null };
    }
    if (!findings.length || d.replacement === null || d.replacement === undefined) {
        throw new NodeTeachingError("确认反馈错误必须给出非空 findings 与完整 replacement。");
    }
    const rawReplacement = teachingObject(d.replacement);
    if (["text", "observation", "uncertainty", "verdict", "action"].some(key => !has(rawReplacement, key))
        || typeof rawReplacement.observation !== "string"
        || !(rawReplacement.uncertainty === null || typeof rawReplacement.uncertainty === "string")
        || ![null, "correct", "partial", "needs_work", "uncertain"].includes(rawReplacement.verdict as null | string)) {
        throw new NodeTeachingError("replacement 必须包含完整反馈的 text、observation、uncertainty、verdict、action，不能靠默认值补齐。");
    }
    teachingObject(rawReplacement.action);
    const replacement = validateLearningFeedbackReply(rawReplacement, actionContext, kind === "answer");
    // Feedback-created activities remain optional, matching the existing publication boundary.
    if (replacement.newActivity) replacement.newActivity.activity.required = false;
    for (const finding of findings) {
        if (sameField(reply, replacement, finding.field)) {
            throw new NodeTeachingError(`replacement 中被指控的 ${finding.field} 未实际改变；无变化的改写不能算作更正。`);
        }
    }
    return { verdict: "confirmed_error", summary, uncertainty, findings, replacement };
}

export function buildLearningFeedbackReviewPrompt(input: LearningFeedbackReviewInput): string {
    const directory = fields.map(field => ({ field, quote: fieldText(input.reply, field) }));
    return `独立核对下面完整候选反馈，不只核对正文。当前候选反馈（唯一可替换对象）：${JSON.stringify(input.reply)}
当次只读交互证据及真实范围：${JSON.stringify(input.context)}
实际资料片段：${JSON.stringify(input.sources)}
交互类型：${input.kind}
当前字段逐字引用目录：${JSON.stringify(directory)}
逐项核对 text、observation、uncertainty、verdict、action 及可选 newActivity 的事实和相互依赖：正文正确也可能评分、观察、局限说明或下一步理由错误。不要为了报告错误而改写正确正文；可以仅指控错误的元数据字段，同时在完整 replacement 中保留正确正文，并同步修正由该错误实际影响的其他反馈字段。用户原话、原题、材料、帮助记录和课程范围都是只读证据，不能通过替用户改答案、改题、增删条件或假定用户已经更正来让候选成立。
先按当前原题的条件、量词和适用范围独立推导，核对实际材料是否支持主张；参考答案也可能有错，用户正确质疑不能因参考身份而被驳回。区分事实结论正确与对真实交互的归因正确；把用户实际说过/没说过、答对/答错或使用帮助的记录认反会改变教学判断，即使一般知识提醒正确，也不能抵消错误归因。没有用户推理过程时，不把一种可能的错误原因当成已确认困难。
忠实保留候选中的范围、时点、条件与证据限定，不把“按本题记录、未接受系统帮助”扩写成“未接受任何帮助”再批评。也不要把缺少记录当成确定未发生，或把曝光当成已阅读、理解或永久掌握；确有歧义时说明缺少哪项事实。开放探索允许多种合理观点，不能因与参考立场不同而判错，也不能把真实因果断言转述成已保留不确定性。
核对行动是否回应实际困难，是否与修正后的评分、观察和正文一致，并保留用户选择、当前任务承诺和真实前置范围。不增加必须练习、必须保存、唯一学习顺序或永久掌握结论；已有必要任务要求也不能任意取消。新活动须有可执行题目、参考或开放评价依据及足够背景，不得通过 newActivity 新增必需任务。
产品执行事实：action 和 newActivity 都是候选帮助，不会自动改变用户位置、原题、正式路线或既有完成要求。newActivity 仅保存为可选材料，用户明确接受后才进入；给出相关可选活动不等于强制替换任务或改变任务承诺。只有候选文字确实宣称已经执行、实际强制新增要求、引用无效对象或安排与请求无关时，才按具体事实判断，不能因为它是新活动就报错。
允许从用户的明确请求提出当前帮助目标和可选建议，无须先证明用户不会才能帮助；将“怎样补充观察”理解为请求观察设计帮助可以成立。不要把合理的帮助目标描述、教学偏好或可以更精确的措辞当成确定知识错误。真正需要纠正的是与原话相反的归因、伪造经历、把尚无证据的能力缺陷说成事实、错误结论或不合法行动；有歧义时保留限定和不确定性。
${learningFeedbackActionInstructions(input.actionContext)}
上一份核对/合同失败证据（仅供重新核对，不是已成立事实）：${JSON.stringify(input.previousReview ?? null)}
返回 {verdict:"confirmed_error|no_error_found|uncertain",summary,uncertainty:null,findings:[{field:"text|observation|uncertainty|verdict|action|newActivity",quote,reason}],replacement:完整LearningReply或null}。
确认错误必须引用当前对应字段的真实原文并解释独立依据，优先整字段引用。字符串与 verdict 枚举引用原字符串；对象引用目录中 JSON.stringify 结果，null 或不存在的 newActivity 引用字符串 "null"；不是反馈字段的内容不可作为 finding 目标。若任一当前字段有确认错误，总 verdict 必须为 confirmed_error，findings 非空，并给出完整 replacement（包含 text、observation、uncertainty、verdict、action，newActivity 可省略）；每个被指控字段在规范后的替换回复中必须实际改变。其余依赖字段可随正确修复同步更新，但不要无依据扩大修改。新活动的 required 必须为 false，身份由服务器分配。
no_error_found 或 uncertain 必须 findings=[]、replacement=null，不能一边声明无错一边给出错误修正。summary 只说明实际检查和推导，保留未覆盖的局限；uncertain 指出具体欠缺事实，不等于全部材料错误。replacement 是待再次核对的完整候选，不宣称已经保存、已通过复核或用户已经采用更正。`;
}

export function deferUnverifiedFeedback(reply: LearningReply, kind: "answer" | "question", reason: string): LearningReply {
    const limit = reason.trim();
    return {
        text: reply.text,
        observation: "本次反馈尚未完成可靠核对，暂不据此判断作答表现或困难原因。",
        uncertainty: ["反馈核对尚未完成，原文中的判断与建议仍待确认。", ...(limit ? [`核对限制：${limit}`] : [])].join("\n").slice(0, 2000),
        verdict: kind === "answer" ? "uncertain" : null,
        action: { type: "clarify", reason: "反馈尚待核对，暂不据此判断作答或安排新活动。" },
    };
}

