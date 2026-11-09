import type { LearningFramework, LearningMaterial } from "./flexibleTeaching";
import type { FeedbackReviewInput } from "./learningContentReview";
import type { SourceFragment } from "./teachingContracts";

type KnowledgeReviewInput = {
    framework: LearningFramework | null;
    material: LearningMaterial | null;
    sources: SourceFragment[];
    context?: unknown;
    concern?: string;
    previousCorrection?: unknown;
    frameworkIsCandidate?: boolean;
    feedback?: FeedbackReviewInput | null;
};

export function learningContentFindingDirectory(input: Pick<KnowledgeReviewInput, "framework" | "material" | "feedback">) {
    return {
        framework: input.framework ? { target: "framework", path: "framework.mainIdea", field: "mainIdea" } : null,
        material: input.material?.steps.map((step, i) => ({
            target: "material", path: `material.steps[${i}]`, stepKey: step.key,
            fields: ["explanation", "example"],
            activities: step.activities.map((activity, j) => ({
                path: `material.steps[${i}].activities[${j}]`, stepKey: step.key, activityKey: activity.key,
                fields: ["answer", "criteria", "hints"]
            }))
        })) || [],
        feedback: input.feedback ? { target: "feedback", path: "feedback.text", interactionId: input.feedback.interactionId, field: "text" } : null
    };
}

const identityInstructions = "material 步骤 findings 必须给真实 stepKey；活动 answer/criteria/hints findings 必须同时给所属 stepKey 和 activityKey，不能仅给 activityKey。目录 path 仅帮助定位原文，不能代替合同里的身份。若同一步的活动身份重复，不能猜测或把另一个活动的引用放到第一个活动。framework 只能修 mainIdea；feedback 只能修选中 interactionId 的 text。禁止改课程范围、身份、步骤或题目。";

export function buildLearningKnowledgeReviewPrompt(input: KnowledgeReviewInput) {
    const current = input.material
        ? `当前核对重点：下面完整当次材料是本次发布或更正候选，优先核对其中新增的事实、例子、理由和活动内容，不能以复述已有框架中的正确结论代替检查这些新文字。\n当前材料（含服务端参考回应、criteria 和 hints，全部用于核对）：${JSON.stringify(input.material)}`
        : input.feedback
            ? `当前核对重点：下面选中的实际反馈，优先核对其结论与理由。\n选中反馈：${JSON.stringify(input.feedback)}`
            : `当前核对重点：本次新生成或更正的核心解释，优先逐字核对其实际结论与理由。\n当前核心解释：${JSON.stringify(input.framework ? { mainIdea: input.framework.mainIdea } : null)}`;
    return `独立检查实际知识事实和前后矛盾。只核对当前候选，不增加新要求。原用户疑点与此前错误只是线索，不代表当前仍有该错误；必须对照当前条件逐字判断，已修正的旧指控不得继续报错。重复、风格和非必要扩写不属于事实错误。
${current}
${input.material && input.frameworkIsCandidate && input.framework ? `当次核心解释（同为本次发布或更正的真实候选）：${JSON.stringify({ mainIdea: input.framework.mainIdea })}\n` : ""}${input.feedback && input.material ? `选中反馈（当次核对对象）：${JSON.stringify(input.feedback)}\n` : ""}实际资料：${JSON.stringify(input.sources)}
真实局部更正目录：${JSON.stringify(learningContentFindingDirectory(input))}
先还原实际命题的结论、前提、适用条件及例子所承担的角色，再依据当前原文、推导或实际资料逐项核对。最终答案或数值正确不能代替理由正确；检查解释是否偷换方向、量词、对象或范围。检查例子或反例时，分别说明它是否满足所针对命题的全部前提、是否支持或否定该命题结论，不能把结论的否定称为该命题前提，也不能将“没有满足前提”与“没有否定结论”混为同一种失败。对照正文、活动题目、参考回应、criteria 和 hints 的理由是否一致。资料引用只依据实际片段，不把类比当证明；开放问题没有唯一答案不是错误。
区分忠实还原原命题的前提/结论角色与逻辑等价或真值：不能仅因前件出现结论的否定就宣称条件句恒假、自相矛盾或同一反例失效，前件不成立时条件句仍可能为真，必须依据实际逻辑推导。
每个活动先只按本题实际条件核对答案和各分支criteria，不能把前文例子的特殊定义偷渡为本题条件；具体取值与趋近趋势不是同一个结论。按实际量词判断全称、存在和条件命题，不能对所有命题套相同反例模板；提供线索或支持证据不等于单独充分证明，不能无依据否认任何支持。
具体疑点（仅线索）：${input.concern || ""}
上一轮已执行局部改动（只读历史）：${JSON.stringify(input.previousCorrection ?? null)}
框架完整安排（范围和前置对照；不能代替上面的当次核对对象）：${JSON.stringify(input.framework)}
其他上下文（只读对照）：${JSON.stringify(input.context ?? null)}
确认错误必须引用逐字原文，给出独立依据和实际纠正该引用的局部 replacement，不能原样返回。${identityInstructions}
summary 简洁说明本次确实检查的高风险主张：引用当次对象的短原文，区分结论、前提和适用条件，给出足够独立的推导或资料依据，不逐字段罗列。尚未覆盖或证据不足写 uncertainty；no_error_found 仅表示对实际检查内容未发现错误，不宣称全部材料已经核实或权威验证。
返回 {verdict:"confirmed_error|no_error_found|uncertain",summary,uncertainty:null,findings:[{target:"framework|material${input.feedback ? "|feedback" : ""}",stepKey?,activityKey?,interactionId?,field:"mainIdea|explanation|example|answer|criteria|hints${input.feedback ? "|text" : ""}",quote,reason,replacement}]}。确认错误才给 findings，其余给空数组；仅修正会改变学习结论的事实错误，不强制固定维度或段数。`;
}

export function buildLearningKnowledgeReviewRepair(error: string, log: { rawOutput: string | null; parsedOutputJson: string | null } | null, input: Pick<KnowledgeReviewInput, "framework" | "material" | "feedback">) {
    const candidate = log?.rawOutput || log?.parsedOutputJson || "暂无已保存候选";
    return `\n仅修复这份已保存核对报告的明确结构或引用错误：${error}
原失败候选（最多24000字符，完整原文保留在调用记录）：${candidate.slice(0, 24000)}
当前真实局部更正目录：${JSON.stringify(learningContentFindingDirectory(input))}
${identityInstructions}
保留没有涉及合同错误的 verdict、summary、quote、reason 和 replacement；已有正确的错误判断与替换不因缺身份而删除或重新编造。活动 finding 缺 stepKey 时，只能根据当前目录补其真实所属步骤；未知或不唯一目标不得猜测。若事实判断本身存在疑点，仍对照当前原文与实际资料独立推导，不能把失败报告的指控当作已成立事实。返回完整原合同 JSON，不增加调用或题目。`;
}
