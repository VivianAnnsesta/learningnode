import { describe, expect, it } from "vitest";
import type { LearningReply } from "./flexibleTeaching";
import type { LearningFeedbackActionContext } from "./learningFeedbackActions";
import { validateLearningFeedbackReply } from "./learningFeedbackActions";
import { buildLearningFeedbackReviewPrompt, deferUnverifiedFeedback, validateLearningFeedbackReview } from "./learningFeedbackReview";

const actionContext: LearningFeedbackActionContext = {
    targets: [{ segmentId: "saved-segment", stepKey: "saved-step", exerciseKey: "saved-activity", materialVersion: 3 }],
    pendingPlans: [{ key: "future-part", title: "后续比较", stepKeys: ["future-step"] }],
    nodeIds: ["allowed-node"],
};
const reply = (): LearningReply => ({
    text: "你已经正确说明了当前条件能推出的结论。",
    observation: "用户没有区分当前推理方向。",
    uncertainty: "只检查本次回答，不能据此判断长期掌握。",
    verdict: "needs_work",
    action: { type: "activity", reason: "因为方向仍然错误，需要重做当前活动。", segmentId: "saved-segment", stepKey: "saved-step", exerciseKey: "saved-activity", materialVersion: 3 },
});
const repaired = (original: LearningReply): LearningReply => ({
    ...original,
    observation: "本次回答按已知条件进行了正向推理。",
    verdict: "correct",
    action: { type: "continue", reason: "本次说明成立，可以自行选择下一步。" },
});
const errorReport = (replacement: unknown, findings: unknown[] = [{ field: "verdict", quote: "needs_work", reason: "用户实际回答与当前条件相符，旧判定与正文结论不一致。" }]) => ({
    verdict: "confirmed_error", summary: "核对当前回答、评分和建议的依赖关系。", uncertainty: "未据此判断长期掌握。", findings, replacement,
});
const optionalActivity = (required: boolean): NonNullable<LearningReply["newActivity"]> => ({
    title: "改变条件后比较",
    explanation: "先列出已知条件，再判断它们是否足以支持结论。",
    activity: { key: "model-supplied-key", kind: "comparison", prompt: "一个条件改变后，原来结论是否仍得到支持？请说明依据。", answer: null, criteria: ["比较实际前提和结论，不把缺少证据当成否定结论。"], hints: ["先列出实际已知条件。"], required },
});

describe("完整反馈核对的字段与替换合同", () => {
    it("正文正确时可同时修正错误观察、评分和行动，无须伪造正文错误", () => {
        const original = reply(), replacement = repaired(original);
        const before = JSON.stringify({ original, replacement });
        const review = validateLearningFeedbackReview(errorReport(replacement, [
            { field: "observation", quote: original.observation, reason: "实际原话展示了正向推理，观察归因相反。" },
            { field: "verdict", quote: original.verdict, reason: "评分与当前答案及正确正文相反。" },
            { field: "action", quote: JSON.stringify(original.action), reason: "重复练习的理由仍依赖错误观察。" },
        ]), original, actionContext, "answer");
        expect(review.replacement).toEqual(replacement);
        expect(review.replacement?.text).toBe(original.text);
        expect(review.uncertainty).toBe("未据此判断长期掌握。");
        expect(JSON.stringify({ original, replacement })).toBe(before);
    });

    it("允许完整替换同步修正由已引用错误影响的观察和行动", () => {
        const original = reply();
        const review = validateLearningFeedbackReview(errorReport(repaired(original)), original, actionContext, "answer");
        expect(review.findings.map(f => f.field)).toEqual(["verdict"]);
        expect(review.replacement?.observation).toBe("本次回答按已知条件进行了正向推理。");
        expect(review.replacement?.action.type).toBe("continue");
        expect(review.replacement?.text).toBe(original.text);
    });

    it("仅uncertainty含错误帮助归因时可以单字段更正，不改正确正文与评分", () => {
        const original: LearningReply = { ...repaired(reply()), uncertainty: "你已经查看了本题参考答案，因此不能判断这次是否无需提示。" };
        const replacement = { ...original, uncertainty: "本题记录未显示系统提示或答案曝光；这不等于长期掌握证据。" };
        const review = validateLearningFeedbackReview(errorReport(replacement, [
            { field: "uncertainty", quote: original.uncertainty, reason: "本题帮助快照为零曝光，旧局限说明却把已查看答案说成事实。" },
        ]), original, actionContext, "answer");
        expect(review.replacement).toEqual(replacement);
        expect(review.replacement?.text).toBe(original.text);
        expect(review.replacement?.verdict).toBe(original.verdict);
        expect(review.findings[0].field).toBe("uncertainty");
    });

    it("uncertainty空值以字符串null引用，JSON的null不能冒充原文字符串", () => {
        const original: LearningReply = { ...reply(), uncertainty: null };
        const replacement = { ...repaired(original), uncertainty: "当前只确认本次回答，不能把它扩为永久掌握。" };
        const findings = [
            { field: "uncertainty", quote: "null", reason: "完整替换需要补充此次判断的限定范围。" },
        ];
        expect(validateLearningFeedbackReview(errorReport(replacement, findings), original, actionContext, "answer").replacement?.uncertainty).toBe(replacement.uncertainty);
        expect(() => validateLearningFeedbackReview(errorReport(replacement, [{ ...findings[0], quote: null }]), original, actionContext, "answer")).toThrow("引用不是当前字段原文");
    });

    it("不能通过修改无关正文假装被指控的评分已更正", () => {
        const original = reply();
        expect(() => validateLearningFeedbackReview(errorReport({ ...original, text: "换一种说法说明当前问题。" }), original, actionContext, "answer")).toThrow("verdict 未实际改变");
    });

    it("仅重排对象键不算行动更正", () => {
        const original = reply();
        const { type, reason, ...identity } = original.action;
        expect(() => validateLearningFeedbackReview(errorReport({ ...original, action: { ...identity, reason, type } }, [
            { field: "action", quote: JSON.stringify(original.action), reason: "行动理由错误。" },
        ]), original, actionContext, "answer")).toThrow("action 未实际改变");
    });

    it("引用必须来自当前对应字段，不能借正确正文代替错误观察的引用", () => {
        const original = reply();
        expect(() => validateLearningFeedbackReview(errorReport(repaired(original), [
            { field: "observation", quote: original.text, reason: "观察需要重判。" },
        ]), original, actionContext, "answer")).toThrow("引用不是当前字段原文");
    });

    it.each(["input", "currentActivity", "scope", "requiredOutput"])("禁止把只读范围或原输入 %s 作为更正对象", field => {
        const original = reply();
        expect(() => validateLearningFeedbackReview(errorReport(repaired(original), [
            { field, quote: "原文", reason: "试图改动只读证据。" },
        ]), original, actionContext, "answer")).toThrow("不能更改用户输入、原题或课程范围");
    });

    it.each([
        { type: "node", reason: "进入未存在节点", nodeId: "invented-node" },
        { type: "step", reason: "进入未存在步骤", segmentId: "invented-segment", stepKey: "saved-step", materialVersion: 3 },
        { type: "activity", reason: "沿用过期活动", segmentId: "saved-segment", stepKey: "saved-step", exerciseKey: "saved-activity", materialVersion: 2 },
    ])("替换回复仍不能使用未知或过期目标 %j", action => {
        const original = reply();
        expect(() => validateLearningFeedbackReview(errorReport({ ...repaired(original), action }), original, actionContext, "answer")).toThrow();
    });

    it("完整replacement不能靠既有宽容默认值补出缺失观察或动作", () => {
        const original = reply(), replacement = repaired(original) as unknown as Record<string, unknown>;
        delete replacement.observation;
        expect(() => validateLearningFeedbackReview(errorReport(replacement), original, actionContext, "answer")).toThrow("必须包含完整反馈");
        expect(() => validateLearningFeedbackReview(errorReport({ ...repaired(original), action: null }), original, actionContext, "answer")).toThrow("请求必须是一个对象");
    });

    it("作答的修复不能删除评分来规避重判", () => {
        const original = reply();
        expect(() => validateLearningFeedbackReview(errorReport({ ...repaired(original), verdict: null }), original, actionContext, "answer")).toThrow("作答反馈需说明判断或不确定性");
    });

    it("承诺的新活动可以完整补齐，但不得成为必需任务或沿用模型伪造身份", () => {
        const original: LearningReply = { ...reply(), text: "下面提供一个改变条件的新问题供你选择。", action: { type: "continue", reason: "选择是否比较另一种条件。" } };
        const replacement = { ...repaired(original), newActivity: optionalActivity(true), action: { type: "activity", reason: "新问题已补齐，仍由用户选择。" } };
        const before = JSON.stringify(replacement);
        const review = validateLearningFeedbackReview(errorReport(replacement, [
            { field: "newActivity", quote: "null", reason: "正文承诺了可进入的新问题，但当前回复缺少对应活动内容。" },
        ]), original, actionContext, "answer");
        expect(review.replacement?.newActivity?.activity.required).toBe(false);
        expect(review.replacement?.newActivity?.activity.key).toBe("pending");
        expect(review.replacement?.action).toEqual({ type: "activity", reason: "新问题已补齐，仍由用户选择。" });
        expect(JSON.stringify(replacement)).toBe(before);
    });

    it("规范后仍相同的新活动不能算作完成了指控字段的更正", () => {
        const activity = { ...optionalActivity(false), activity: { ...optionalActivity(false).activity, key: "pending" } };
        const original: LearningReply = { ...reply(), newActivity: activity, action: { type: "activity", reason: "可选择新的比较问题。" } };
        expect(() => validateLearningFeedbackReview(errorReport({ ...original, newActivity: { ...activity, activity: { ...activity.activity, required: true } } }, [
            { field: "newActivity", quote: JSON.stringify(activity), reason: "活动需要调整。" },
        ]), original, actionContext, "answer")).toThrow("newActivity 未实际改变");
    });
});

describe("没有确认错误的报告和暂缓反馈", () => {
    it.each(["no_error_found", "uncertain"] as const)("有效 %s 保留核对范围和局限，不暗中改写候选", verdict => {
        const original = reply(), before = JSON.stringify(original);
        const result = validateLearningFeedbackReview({ verdict, summary: "仅核对本次输入及允许动作。", uncertainty: "当前没有跨情境表现证据。", findings: [], replacement: null }, original, actionContext, "answer");
        expect(result).toEqual({ verdict, summary: "仅核对本次输入及允许动作。", uncertainty: "当前没有跨情境表现证据。", findings: [], replacement: null });
        expect(JSON.stringify(original)).toBe(before);
    });

    it("不能用no_error_found装载错误指控或replacement", () => {
        const original = reply();
        expect(() => validateLearningFeedbackReview({ ...errorReport(repaired(original)), verdict: "no_error_found" }, original, actionContext, "answer")).toThrow("findings 必须为空");
        expect(() => validateLearningFeedbackReview({ verdict: "uncertain", summary: "仍缺少原始条件。", uncertainty: "缺条件。", findings: [], replacement: repaired(original) }, original, actionContext, "answer")).toThrow("replacement 必须显式为 null");
    });

    it("不把旧版缺replacement的报告隐式当成完整回复核对", () => {
        expect(() => validateLearningFeedbackReview({ verdict: "no_error_found", summary: "仅旧正文核对。", uncertainty: null, findings: [] }, reply(), actionContext, "answer")).toThrow("replacement 必须显式为 null");
    });

    it("数组形式的verdict不能通过字符串强制转换冒充有效判定", () => {
        expect(() => validateLearningFeedbackReview({ verdict: ["no_error_found"], summary: "报告类型不正确。", uncertainty: null, findings: [], replacement: null }, reply(), actionContext, "answer")).toThrow("核对结构无效");
    });

    it("confirmed_error缺指控或完整replacement均拒绝", () => {
        const original = reply();
        expect(() => validateLearningFeedbackReview(errorReport(repaired(original), []), original, actionContext, "answer")).toThrow("非空 findings");
        expect(() => validateLearningFeedbackReview(errorReport(null), original, actionContext, "answer")).toThrow("完整 replacement");
    });

    it.each(["answer", "question"] as const)("核对失败的%s保留原文但暂缓判断，不宣称发生了更正", kind => {
        const original: LearningReply = { ...reply(), uncertainty: "你已经查看了本题参考答案。", newActivity: optionalActivity(false) }, before = JSON.stringify(original);
        const deferred = deferUnverifiedFeedback(original, kind, "资料连接失败，尚未完成独立推导。");
        expect(deferred.text).toBe(original.text);
        expect(deferred.verdict).toBe(kind === "answer" ? "uncertain" : null);
        expect(deferred.newActivity).toBeUndefined();
        expect(deferred.action.type).toBe("clarify");
        expect(deferred.action.segmentId).toBeUndefined();
        expect(deferred.uncertainty).not.toContain(original.uncertainty);
        expect(deferred.uncertainty).toContain("资料连接失败");
        expect(deferred.action.reason).not.toContain("请先澄清");
        expect(JSON.stringify([deferred.observation, deferred.uncertainty, deferred.action])).not.toMatch(/已更正|已修正|已纠正|核对通过/);
        expect(validateLearningFeedbackReply(deferred, actionContext, kind === "answer")).toEqual(deferred);
        expect(JSON.stringify(original)).toBe(before);
    });
});

describe("完整反馈核对提示中的证据与修复边界", () => {
    it("提供整份回复、实际交互、原资料、允许动作以及失败报告，不只提供text", () => {
        const original = reply();
        const context = { currentInteraction: { input: "已知前提成立，所以结论成立。", exposure: { hints: 0, solution: false }, requiredOutput: "none" }, focus: "当前正向推理" };
        const sources = [{ id: "source-id", title: "条件推理", url: "https://example.org/logic", location: "第1段", text: "按实际前提使用条件命题。", contentHash: "source-hash" }];
        const previousReview = { verdict: "no_error_found", findings: [{ field: "verdict" }], error: "报告前后不一致。" };
        const prompt = buildLearningFeedbackReviewPrompt({ reply: original, context, sources, actionContext, kind: "answer", previousReview });
        expect(prompt).toContain(JSON.stringify(original));
        expect(prompt).toContain(JSON.stringify(context));
        expect(prompt).toContain(JSON.stringify(sources));
        expect(prompt).toContain(JSON.stringify(previousReview));
        expect(prompt).toContain(JSON.stringify({ field: "action", quote: JSON.stringify(original.action) }));
        expect(prompt).toContain(JSON.stringify({ field: "newActivity", quote: "null" }));
        expect(prompt).toContain(JSON.stringify({ field: "uncertainty", quote: original.uncertainty }));
        expect(prompt).toContain("saved-activity");
        expect(prompt).toContain("参考答案也可能有错");
        expect(prompt).toContain("不要为了报告错误而改写正确正文");
        expect(prompt).toContain("不把“按本题记录、未接受系统帮助”扩写成“未接受任何帮助”");
        expect(prompt).toContain("不能通过替用户改答案");
        expect(prompt).toContain("不能因与参考立场不同而判错");
    });
});

