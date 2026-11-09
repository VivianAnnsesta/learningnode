import { prisma } from "../prisma";
import { NodeTeachingError } from "./nodeTeaching";
import { parseSaved } from "./learningSessionService";
import type { LearningFramework, LearningMaterial } from "./flexibleTeaching";
export async function startLearningActivity(nodeId: string) { return prisma.$transaction(async (tx) => { const node = await tx.learningNode.findUnique({ where: { id: nodeId } }); if (!node)
    throw new NodeTeachingError("学习任务不存在。", 404); if (node.status === "in_progress" || node.status === "completed")
    return node; const updated = await tx.learningNode.update({ where: { id: nodeId }, data: { status: "in_progress" } }); await tx.learningProgress.create({ data: { domainId: node.domainId, nodeId, status: "in_progress", payloadJson: JSON.stringify({ task: node, previousStatus: node.status, action: "explicit_start" }) } }); return updated; }); }
export async function completeLearningActivity(nodeId: string, input: {
    confirmed?: boolean;
    reason?: string;
} = {}) {
    if (input.confirmed !== true)
        throw new NodeTeachingError("请明确确认完成这项学习任务；保存记录和结束会话是独立操作。");
    return prisma.$transaction(async (tx) => {
        const node = await tx.learningNode.findUnique({ where: { id: nodeId }, include: { knowledgeLinks: { include: { knowledgePoint: { select: { id: true, currentRevisionId: true } } } } } });
        if (!node)
            throw new NodeTeachingError("学习任务不存在。", 404);
        if (node.status === "completed")
            return { node, alreadyCompleted: true };
        const s = await tx.nodeTeachingSession.findUnique({ where: { scopeKey: `node:${nodeId}` } }), framework = parseSaved<LearningFramework | null>(s?.lessonJson, null), segments = s ? await tx.teachingSegment.findMany({ where: { sessionId: s.id, status: "ready" }, orderBy: { version: "desc" } }) : [], interactions = s ? await tx.teachingInteraction.findMany({ where: { sessionId: s.id, kind: "answer" } }) : [];
        if (framework?.schemaVersion === 4) {
            for (const part of framework.segments)
                for (const step of part.steps) {
                    if (step.requiredOutput === "attempt") {
                        const segment = segments.find(x => x.key === `l${s!.lessonVersion}--${part.key}`), material = parseSaved<LearningMaterial | null>(segment?.materialJson, null), activities = material?.steps.find(x => x.key === step.key)?.activities.filter(a => a.required) || [];
                        if (!segment || !activities.length || activities.some(a => !interactions.some(i => i.segmentId === segment.id && i.materialVersion === segment.version && i.stepKey === step.key && i.exerciseKey === a.key && i.input.trim())))
                            throw new NodeTeachingError(`任务要求尝试“${step.goal}”。请先留下自己的尝试，正确与否不阻止完成。`);
                    }
                    if (step.requiredOutput === "record" && !node.knowledgeLinks.length)
                        throw new NodeTeachingError(`任务要求保存“${step.goal}”的个人记录。请先保存产出。`);
                }
        }
        else if (["practice", "challenge"].includes(node.nodeType) && !interactions.some(i => i.input.trim()))
            throw new NodeTeachingError("应用任务需要一次实际尝试；请先准备活动并留下输入。");
        const evidence = interactions.map(i => ({ interactionId: i.id, input: i.input, status: i.status, assistance: i.assistance, materialVersion: i.materialVersion, reply: parseSaved(i.responseJson, null) }));
        const updated = await tx.learningNode.update({ where: { id: nodeId }, data: { status: "completed" } });
        await tx.learningProgress.create({ data: { domainId: node.domainId, nodeId, status: "completed", reason: input.reason || "用户确认任务完成", payloadJson: JSON.stringify({ task: node, sessionId: s?.id || null, evidence, records: node.knowledgeLinks.map(x => ({ knowledgePointId: x.knowledgePoint.id, revisionId: x.knowledgePoint.currentRevisionId })), verification: "participation_only", action: "explicit_complete" }) } });
        return { node: updated, verification: "participation_only" };
    });
}
