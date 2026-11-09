import { prisma } from "../prisma";
import {
  diagnosticQuestionTypes,
  type DiagnosticQuestionType
} from "./types";

export type DiagnosticQuestionInput = {
  prompt?: string;
  questionType?: string | null;
  expectedAnswer?: string | null;
  roadmapItemId?: string | null;
};

export type DiagnosticSessionInput = {
  title?: string;
  status?: string | null;
  summary?: string | null;
  questions?: DiagnosticQuestionInput[];
};

export type DiagnosticAnswerInput = {
  response?: string;
  assessment?: string | null;
  result?: string | null;
};

export interface DiagnosticAnswerDto {
  id: string;
  response: string;
  assessment: string | null;
  result: string;
  createdAt: Date;
}

export interface DiagnosticRoadmapItemRefDto {
  id: string;
  title: string;
  status: string;
}

export interface DiagnosticQuestionDto {
  id: string;
  prompt: string;
  questionType: string;
  expectedAnswer: string | null;
  orderIndex: number;
  createdAt: Date;
  updatedAt: Date;
  roadmapItemId: string | null;
  roadmapItem: DiagnosticRoadmapItemRefDto | null;
  answers: DiagnosticAnswerDto[];
}

export interface DiagnosticSessionDto {
  id: string;
  title: string;
  status: string;
  summary: string | null;
  createdAt: Date;
  updatedAt: Date;
  questions: DiagnosticQuestionDto[];
}

const normalizeOptional = (value?: string | null) => {
  const next = value?.trim();
  return next ? next : null;
};

const normalizeDiagnosticQuestionType = (value?: string | null) => {
  const next = value?.trim();
  if (next && diagnosticQuestionTypes.includes(next as DiagnosticQuestionType)) {
    return next as DiagnosticQuestionType;
  }
  return "concept";
};

function toDiagnosticAnswerDto(answer: {
  id: string;
  response: string;
  assessment: string | null;
  result: string;
  createdAt: Date;
}): DiagnosticAnswerDto {
  return {
    id: answer.id,
    response: answer.response,
    assessment: answer.assessment,
    result: answer.result,
    createdAt: answer.createdAt
  };
}

const toPublicSession = (session: {
  id: string;
  title: string;
  status: string;
  summary: string | null;
  createdAt: Date;
  updatedAt: Date;
  questions?: Array<{
    id: string;
    prompt: string;
    questionType: string;
    expectedAnswer: string | null;
    orderIndex: number;
    createdAt: Date;
    updatedAt: Date;
    learningNode?: { id: string; title: string; status: string } | null;
    roadmapItem?: { id: string; title: string; status: string } | null;
    answers: Array<{
      id: string;
      response: string;
      assessment: string | null;
      result: string;
      createdAt: Date;
    }>;
  }>;
}): DiagnosticSessionDto => ({
  id: session.id,
  title: session.title,
  status: session.status,
  summary: session.summary,
  createdAt: session.createdAt,
  updatedAt: session.updatedAt,
  questions: (session.questions || []).map((question) => {
    const roadmapItem = question.learningNode
      ? {
          id: question.learningNode.id,
          title: question.learningNode.title,
          status: question.learningNode.status
        }
      : (question.roadmapItem ?? null);

    return {
      id: question.id,
      prompt: question.prompt,
      questionType: question.questionType,
      expectedAnswer: question.expectedAnswer,
      orderIndex: question.orderIndex,
      createdAt: question.createdAt,
      updatedAt: question.updatedAt,
      roadmapItemId: roadmapItem?.id || null,
      roadmapItem,
      answers: question.answers.map(toDiagnosticAnswerDto)
    };
  })
});

export async function listDiagnosticSessions(
  domainId: string
): Promise<DiagnosticSessionDto[]> {
  const sessions = await prisma.diagnosticSession.findMany({
    where: { domainId },
    orderBy: { updatedAt: "desc" },
    include: {
      questions: {
        orderBy: { orderIndex: "asc" },
        include: {
          learningNode: {
            select: { id: true, title: true, status: true }
          },
          answers: {
            orderBy: { createdAt: "desc" },
            take: 1
          }
        }
      }
    }
  });

  return sessions.map(toPublicSession);
}

export async function getDiagnosticSession(
  domainId: string,
  sessionId: string
): Promise<DiagnosticSessionDto | null> {
  const session = await prisma.diagnosticSession.findFirst({
    where: {
      id: sessionId,
      domainId
    },
    include: {
      questions: {
        orderBy: { orderIndex: "asc" },
        include: {
          learningNode: {
            select: { id: true, title: true, status: true }
          },
          answers: {
            orderBy: { createdAt: "desc" }
          }
        }
      }
    }
  });

  return session ? toPublicSession(session) : null;
}

export async function createDiagnosticSession(
  domainId: string,
  input: DiagnosticSessionInput
): Promise<DiagnosticSessionDto> {
  const domain = await prisma.domain.findUnique({
    where: { id: domainId },
    select: { id: true, name: true }
  });

  if (!domain) {
    throw new Error("学习领域不存在");
  }

  const questions = input.questions ?? [];
  const usableQuestions = questions.filter((question) => question.prompt?.trim());
  const referencedNodeIds = Array.from(
    new Set(
      usableQuestions
        .map((question) => normalizeOptional(question.roadmapItemId))
        .filter((nodeId): nodeId is string => Boolean(nodeId))
    )
  );
  if (referencedNodeIds.length > 0) {
    const ownedNodes = await prisma.learningNode.findMany({
      where: { id: { in: referencedNodeIds }, domainId },
      select: { id: true }
    });
    if (ownedNodes.length !== referencedNodeIds.length) {
      throw new Error("诊断题引用的学习节点不属于该领域或不存在。");
    }
  }

  const session = await prisma.diagnosticSession.create({
    data: {
      domainId,
      title: input.title?.trim() || `${domain.name} 诊断`,
      status: input.status?.trim() || "draft",
      summary: normalizeOptional(input.summary),
      questions: {
        create: usableQuestions.map((question, index) => ({
          prompt: question.prompt?.trim() || `诊断题 ${index + 1}`,
          questionType: normalizeDiagnosticQuestionType(question.questionType),
          expectedAnswer: normalizeOptional(question.expectedAnswer),
          learningNodeId: normalizeOptional(question.roadmapItemId),
          orderIndex: index
        }))
      }
    },
    include: {
      questions: {
        orderBy: { orderIndex: "asc" },
        include: {
          learningNode: {
            select: { id: true, title: true, status: true }
          },
          answers: {
            orderBy: { createdAt: "desc" },
            take: 1
          }
        }
      }
    }
  });

  return toPublicSession(session);
}

export async function saveDiagnosticAnswer(
  questionId: string,
  input: DiagnosticAnswerInput
): Promise<DiagnosticAnswerDto> {
  const response = input.response?.trim();
  if (!response) {
    throw new Error("回答不能为空");
  }

  const question = await prisma.diagnosticQuestion.findUnique({
    where: { id: questionId },
    select: { id: true }
  });

  if (!question) {
    throw new Error("诊断题不存在");
  }

  const answer = await prisma.diagnosticAnswer.create({
    data: {
      questionId,
      response,
      assessment: null,
      result: "unreviewed"
    }
  });

  return toDiagnosticAnswerDto(answer);
}
