import type { LearningMaterial, LearningReply } from "./flexibleTeaching";
import type { SourceFragment } from "./teachingContracts";
import { selectFragments } from "./teachingSources";

type BoundInteraction = {
    segmentId: string;
    materialVersion: number;
    requiredOutput: "none" | "attempt" | "record" | null;
    step: LearningMaterial["steps"][number];
    activity: LearningMaterial["steps"][number]["activities"][number] | null;
};

/** Keep the cited version first; a current source with the same ID cannot replace it. */
export function selectInteractionSources(snapshot: SourceFragment[], sourceIds: string[], available: SourceFragment[], query: string) {
    const bound = new Map(snapshot.map(source => [source.id, source]));
    const pinned = sourceIds.flatMap(id => bound.has(id) ? [bound.get(id)!] : []);
    const candidates = [...pinned, ...selectFragments(available.map(source => bound.get(source.id) || source), query, available.length)];
    const selected: SourceFragment[] = [], seen = new Set<string>();
    let chars = 0;
    for (const source of candidates) {
        if (seen.has(source.id)) continue;
        seen.add(source.id);
        if (selected.length >= 10 || chars + source.text.length > 20000) continue;
        selected.push(structuredClone(source));
        chars += source.text.length;
    }
    return selected;
}

export function buildLearningInteractionEvidence(input: {
    kind: string;
    interactionId?: string;
    requestId?: string;
    input: string;
    assistanceAtSubmission: number;
    currentExposure: { hints: number; solution: boolean } | null;
    binding: BoundInteraction | null;
    sources: SourceFragment[];
    missingEvidence?: string[];
}) {
    return structuredClone({
        kind: input.kind,
        interactionId: input.interactionId || null,
        requestId: input.requestId || null,
        input: input.input,
        binding: input.binding ? { ...input.binding, stepKey: input.binding.step.key, exerciseKey: input.binding.activity?.key || null } : null,
        assistanceAtSubmission: input.assistanceAtSubmission,
        assistanceMeaning: "提交时保存的帮助类别：0未记录帮助，1已看提示，2已看参考解答，3已收到同一活动反馈；不代表独立能力认证。",
        currentExposure: input.currentExposure,
        currentExposureTiming: "这是本次处理时看到的当前曝光，失败重试时可能发生在原回答提交之后，不能改写提交时帮助事实。",
        referenceStatus: "绑定步骤和活动是原题与当前服务端参考，只读；参考回应和提示也可能有错，须依据原题独立核对，不能默认参考是真值或改写用户原话。",
        requirementBasis: "binding.requiredOutput 来自绑定版本的框架步骤承诺；null表示没有对应框架步骤，不能从活动required或当前回答推断任务承诺。",
        sources: input.sources,
        sourceLimitations: "优先保留当前步骤引用的材料版本，再补当前问题相关正文；动态补讲没有显式引用时保留其生成时可用的有界来源快照，但这不表示片段证明了补讲结论。最多10段、20000字符，未提供的来源不视为已核对。",
        missingEvidence: input.missingEvidence || []
    });
}

/** A corrected explanation does not validate the old assessment or its proposed activity. */
export function withdrawCorrectedFeedbackJudgment(reply: LearningReply, kind: "answer" | "question"): LearningReply {
    return {
        text: reply.text,
        observation: kind === "answer" ? "已保存本次原始回答；反馈内容已更正，原判断已撤回，回答是否正确尚待核对。" : "已保存本次原始提问；反馈内容已更正，原观察与建议已撤回。",
        uncertainty: "反馈内容发生更正，原判断及建议已撤回；这不表示已经恢复正确判分。旧核对说明保留在原始记录中，不作为当前已核实事实。",
        verdict: kind === "answer" ? "uncertain" : null,
        action: { type: "clarify", reason: "请根据更正后的说明继续澄清，原补讲建议不再自动有效。" }
    };
}
