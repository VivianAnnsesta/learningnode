import { prisma } from "../prisma";
import { assertLearningNodeInDomain } from "./domainMapService";

export function retiredLearningResponse() {
    return Response.json({ error: "旧诊断和练习仅供历史回看；请在统一学习空间提问、练习和保存个人记录。", code: "LEGACY_LEARNING_READ_ONLY", href: "/learning/sessions" }, { status: 410 });
}
export async function retiredDomainLearningOperation(domainId: string) {
    if (!await prisma.domain.findUnique({ where: { id: domainId }, select: { id: true } })) return Response.json({ error: "领域不存在。" }, { status: 404 });
    return retiredLearningResponse();
}
export async function retiredNodeLearningOperation(domainId: string, nodeId: string) {
    try { await assertLearningNodeInDomain(domainId, nodeId); return retiredLearningResponse(); }
    catch (error) { const message = error instanceof Error ? error.message : "读取任务失败。"; return Response.json({ error: message }, { status: /不存在|不属于|not found/.test(message) ? 404 : 500 }); }
}
export async function retiredDiagnosticLearningOperation(kind: "question" | "answer", id: string) {
    const item = kind === "question" ? await prisma.diagnosticQuestion.findUnique({ where: { id }, select: { id: true } }) : await prisma.diagnosticAnswer.findUnique({ where: { id }, select: { id: true } });
    return item ? retiredLearningResponse() : Response.json({ error: "历史诊断对象不存在。" }, { status: 404 });
}
