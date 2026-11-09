import { prisma } from "../prisma";
import {
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
