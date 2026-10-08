import { createHash } from "node:crypto";
import type { Prisma, NodeTeachingSession, TeachingInteraction } from "@prisma/client";
import { prisma } from "../prisma";
import { isSafeExternalUrl } from "../security/externalUrl";
import { prepareNodeTeachingMaterial, respondToTeachingInteraction } from "../ai/nodeTeachingTasks";
import {
  NodeTeachingError, initialTeachingProgress, parseTeachingBinding,
  publicTeachingLesson, teachingText, updateTeachingProgress,
  type TeachingContext, type TeachingLesson, type TeachingProgress,
  type TeachingInteractionView, type TeachingSessionView
} from "./nodeTeaching";

type Db = Prisma.TransactionClient;
const pendingLeaseMs = 120000;
const text = (value: unknown, max = 6000) => typeof value === "string" ? value.slice(0, max) : "";
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const array = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const json = (value: string | null) => {
  try { return JSON.parse(value || "null") as unknown; } catch { return null; }
};

async function getContext(db: Db, domainId: string, nodeId: string) {
  const node = await db.learningNode.findFirst({
    where: { id: nodeId, domainId }, include: { domain: true, unit: true }
  });
  if (!node) throw new NodeTeachingError("学习节点不属于该领域或不存在。", 404);
  const course = node.domain.courseDesignStatus === "confirmed"
    ? object(json(node.domain.courseDesignDraft)) : {};
  const sources: TeachingContext["sources"] = [];
  for (const raw of array(course.sources)) {
    const source = object(raw);
    const grounding = object(source.grounding);
    const url = text(source.url, 2000);
    if (!isSafeExternalUrl(url) || grounding.ok !== true || !text(grounding.excerpt)) continue;
    const parsed = new URL(url);
    if (parsed.username || parsed.password || sources.some((item) => item.url === url)) continue;
    sources.push({ id: `source-${sources.length + 1}`, url,
      title: text(source.title, 300) || parsed.hostname, excerpt: text(grounding.excerpt, 2400) });
    if (sources.length === 6) break;
  }
  const modules = array(json(node.unit?.planningBlueprintJson || null));
  const question = modules.flatMap((module) => array(object(module).keyQuestions))
    .map(object).find((item) => item.key === node.planningQuestionKey);
  const warnings: string[] = [];
  if (!sources.length) warnings.push("当前课程没有可用于本次备课的已提取来源片段，教学内容需要进一步核对。");
  else warnings.push("来源为课程研究时保存的短片段，不保证覆盖本节点全部解释与解答。");
  if (!node.objective) warnings.push("该节点尚未设置明确检查目标，本次围绕核心问题教学。");
  if (node.planningQuestionKey && !question) warnings.push("当前 Stage 蓝图中未找到该节点对应的检查结果。");
  const context: TeachingContext = {
    domain: {
      name: node.domain.name, goal: text(node.domain.goal), currentLevel: text(node.domain.currentLevel),
      background: text(node.domain.description), taskBrief: text(node.domain.taskBrief),
      scope: text(node.domain.scope), excludedScope: text(node.domain.excludedScope), depth: text(node.domain.depth),
      outputType: text(node.domain.outputType), outputTarget: text(node.domain.outputTarget)
    },
    node: { title: node.title, objective: text(node.objective), keyQuestion: text(node.keyQuestion) || node.title,
      prerequisite: text(node.prerequisite), commonMistake: text(node.commonMistake) },
    stage: { title: node.unit?.title || "", goal: text(node.unit?.goal),
      moduleTitle: node.moduleTitle || "", checkableOutcome: text(question?.checkableOutcome) },
    sources, warnings
  };
  return { context, hash: createHash("sha256").update(JSON.stringify(context)).digest("hex"),
    mapRevision: node.domain.mapRevision };
}

function interactionView(item: TeachingInteraction): TeachingInteractionView {
  return { id: item.id, requestId: item.requestId, kind: item.kind as "answer" | "question",
    exerciseKey: item.exerciseKey, input: item.input, assistance: item.assistance,
    status: item.status, response: item.responseJson ? JSON.parse(item.responseJson) : null,
    error: item.errorMessage };
}

async function sessionView(session: NodeTeachingSession, currentHash: string): Promise<TeachingSessionView> {
  const lesson = JSON.parse(session.lessonJson) as TeachingLesson;
  const progress = JSON.parse(session.progressJson) as TeachingProgress;
  const interactions = await prisma.teachingInteraction.findMany({
    where: { sessionId: session.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100
  });
  return { id: session.id, revision: session.revision, stale: session.contextHash !== currentHash,
    mapRevision: session.mapRevision, context: JSON.parse(session.contextJson),
    lesson: publicTeachingLesson(lesson, progress), progress,
    interactions: interactions.reverse().map(interactionView) };
}

export async function getNodeTeaching(domainId: string, nodeId: string) {
  const current = await getContext(prisma, domainId, nodeId);
  const session = await prisma.nodeTeachingSession.findUnique({
    where: { nodeId_contextHash_lessonVersion: { nodeId, contextHash: current.hash, lessonVersion: 1 } }
  }) || await prisma.nodeTeachingSession.findFirst({
    where: { nodeId, domainId }, orderBy: { createdAt: "desc" }
  });
  return { session: session ? await sessionView(session, current.hash) : null };
}

export async function prepareNodeTeaching(domainId: string, nodeId: string) {
  const initial = await getContext(prisma, domainId, nodeId);
  const existing = await prisma.nodeTeachingSession.findUnique({
    where: { nodeId_contextHash_lessonVersion: { nodeId, contextHash: initial.hash, lessonVersion: 1 } }
  });
  if (existing) return { session: await sessionView(existing, initial.hash) };
  const generated = await prepareNodeTeachingMaterial(domainId, nodeId, initial.context);
  await prisma.$transaction(async (tx) => {
    const current = await getContext(tx, domainId, nodeId);
    if (initial.hash !== current.hash) {
      throw new NodeTeachingError("备课期间学习目标或课程资料发生变化，请重新准备。", 409);
    }
    await tx.nodeTeachingSession.upsert({
      where: { nodeId_contextHash_lessonVersion: { nodeId, contextHash: current.hash, lessonVersion: 1 } }, update: {},
      create: { domainId, nodeId, contextHash: current.hash, mapRevision: current.mapRevision,
        contextJson: JSON.stringify(current.context), lessonJson: JSON.stringify(generated.data),
        aiCallLogId: generated.log.id, progressJson: JSON.stringify(initialTeachingProgress(generated.data)) }
    });
    await tx.learningNode.updateMany({
      where: { id: nodeId, domainId, status: { notIn: ["in_progress", "completed", "mastered"] } },
      data: { status: "in_progress" }
    });
  });
  return getNodeTeaching(domainId, nodeId);
}

async function requireSession(db: Db, domainId: string, nodeId: string, sessionId: string) {
  const current = await getContext(db, domainId, nodeId);
  const session = await db.nodeTeachingSession.findFirst({ where: { id: sessionId, domainId, nodeId } });
  if (!session) throw new NodeTeachingError("教学会话不属于当前节点。", 404);
  if (session.contextHash !== current.hash) {
    throw new NodeTeachingError("教学目标或资料已经更新，旧记录保留，请准备新的教学。", 409);
  }
  return session;
}

async function saveProgress(db: Db, session: NodeTeachingSession, revision: number, progress: TeachingProgress) {
  const result = await db.nodeTeachingSession.updateMany({
    where: { id: session.id, revision },
    data: { progressJson: JSON.stringify(progress), revision: { increment: 1 } }
  });
  if (result.count !== 1) throw new NodeTeachingError("学习记录已在另一处更新，请重新加载；本地输入仍保留。", 409);
}

export async function saveNodeTeachingProgress(domainId: string, nodeId: string, value: unknown) {
  const binding = parseTeachingBinding(value);
  await prisma.$transaction(async (tx) => {
    const session = await requireSession(tx, domainId, nodeId, binding.sessionId);
    const progress = updateTeachingProgress(JSON.parse(session.lessonJson), JSON.parse(session.progressJson), binding.data);
    await saveProgress(tx, session, binding.revision, progress);
  });
  return getNodeTeaching(domainId, nodeId);
}

export async function submitTeachingInteraction(domainId: string, nodeId: string, value: unknown) {
  const { data, sessionId, revision } = parseTeachingBinding(value);
  const requestId = teachingText(data.requestId, "请求标识", 100);
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(requestId)) throw new NodeTeachingError("请求标识不合法。");
  if (data.kind !== "answer" && data.kind !== "question") throw new NodeTeachingError("不支持的教学交互。");
  const kind = data.kind;
  const exerciseKey = teachingText(data.exerciseKey, "练习标识", 60);
  teachingText(data.input, kind === "answer" ? "作答" : "问题");
  const input = data.input as string;
  const claimed = await prisma.$transaction(async (tx) => {
    const session = await requireSession(tx, domainId, nodeId, sessionId);
    const lesson = JSON.parse(session.lessonJson) as TeachingLesson;
    const progress = JSON.parse(session.progressJson) as TeachingProgress;
    if (!lesson.exercises.some((item) => item.key === exerciseKey)) {
      throw new NodeTeachingError("练习不属于当前教学材料。");
    }
    const prior = await tx.teachingInteraction.findUnique({ where: { sessionId_requestId: { sessionId, requestId } } });
    const now = new Date();
    if (prior) {
      if (prior.input !== input || prior.kind !== kind || prior.exerciseKey !== exerciseKey) {
        throw new NodeTeachingError("同一请求标识不能用于不同回答或问题。", 409);
      }
      if (prior.status === "complete" ||
          (prior.status === "pending" && now.getTime() - prior.updatedAt.getTime() < pendingLeaseMs)) return null;
      // The timestamp fences a late response from a previously interrupted request.
      const lease = await tx.teachingInteraction.updateMany({
        where: { id: prior.id, status: prior.status, updatedAt: prior.updatedAt },
        data: { status: "pending", errorMessage: null, updatedAt: now }
      });
      if (!lease.count) return null;
      return { session, lesson, progress, interaction: { ...prior, status: "pending", updatedAt: now } };
    }
    const support = progress.support[exerciseKey];
    const previousHelp = await tx.teachingInteraction.count({
      where: { sessionId, exerciseKey, status: "complete" }
    });
    const assistance = support?.solution ? 100 : Math.max(support?.hints || 0, previousHelp ? 10 : 0);
    if (kind === "answer") progress.drafts[exerciseKey] = input;
    await saveProgress(tx, session, revision, progress);
    const interaction = await tx.teachingInteraction.create({
      data: { sessionId, requestId, kind, exerciseKey, input, assistance, updatedAt: now }
    });
    return { session, lesson, progress, interaction };
  });
  if (claimed) {
    const { interaction } = claimed;
    try {
      const history = await prisma.teachingInteraction.findMany({
        where: { sessionId, status: "complete" }, orderBy: { createdAt: "desc" }, take: 6
      });
      const result = await respondToTeachingInteraction({
        domainId, nodeId, context: JSON.parse(claimed.session.contextJson), lesson: claimed.lesson,
        progress: claimed.progress, interaction: interactionView(interaction),
        history: history.reverse().map(interactionView)
      });
      await prisma.teachingInteraction.updateMany({
        where: { id: interaction.id, status: "pending", updatedAt: interaction.updatedAt },
        data: { status: "complete", responseJson: JSON.stringify(result.data), aiCallLogId: result.log.id, errorMessage: null }
      });
    } catch {
      await prisma.teachingInteraction.updateMany({
        where: { id: interaction.id, status: "pending", updatedAt: interaction.updatedAt },
        data: { status: "failed", errorMessage: "AI 暂时未返回有效反馈，输入已保存，可以重试。" }
      });
    }
  }
  return getNodeTeaching(domainId, nodeId);
}
