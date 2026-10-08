import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createDiagnosticSession,
  getDiagnosticSession,
  listDiagnosticSessions,
  saveDiagnosticAnswer
} from "./diagnosticService";

const prismaMock = vi.hoisted(() => ({
  domain: {
    findUnique: vi.fn()
  },
  diagnosticSession: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn()
  },
  diagnosticQuestion: {
    findUnique: vi.fn()
  },
  diagnosticAnswer: {
    create: vi.fn()
  },
  learningNode: {
    findMany: vi.fn()
  }
}));

vi.mock("../prisma", () => ({
  prisma: prismaMock
}));

const buildSessionRecord = (overrides: Record<string, unknown> = {}) => ({
  id: "s1",
  title: "Session 1",
  status: "draft",
  summary: null,
  createdAt: new Date("2026-07-09T00:00:00.000Z"),
  updatedAt: new Date("2026-07-09T00:00:00.000Z"),
  questions: [],
  ...overrides
});

describe("diagnosticService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.learningNode.findMany.mockResolvedValue([]);
  });

  it("lists sessions with questions and latest answers", async () => {
    prismaMock.diagnosticSession.findMany.mockResolvedValue([buildSessionRecord()]);

    await expect(listDiagnosticSessions("d1")).resolves.toEqual([
      buildSessionRecord()
    ]);
    expect(prismaMock.diagnosticSession.findMany).toHaveBeenCalledWith({
      where: { domainId: "d1" },
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
  });

  it("reads a diagnostic session inside the domain", async () => {
    prismaMock.diagnosticSession.findFirst.mockResolvedValue(buildSessionRecord());

    await expect(getDiagnosticSession("d1", "s1")).resolves.toEqual(
      buildSessionRecord()
    );
    expect(prismaMock.diagnosticSession.findFirst).toHaveBeenCalledWith({
      where: {
        id: "s1",
        domainId: "d1"
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
  });

  it("rejects missing domain when creating a diagnostic session", async () => {
    prismaMock.domain.findUnique.mockResolvedValue(null);

    await expect(createDiagnosticSession("d1", {})).rejects.toThrow(
      "学习领域不存在"
    );
  });

  it("creates a session with normalized usable questions only", async () => {
    prismaMock.domain.findUnique.mockResolvedValue({
      id: "d1",
      name: "English"
    });
    prismaMock.diagnosticSession.create.mockResolvedValue(buildSessionRecord());
    prismaMock.learningNode.findMany.mockResolvedValue([{ id: "item-1" }]);

    await createDiagnosticSession("d1", {
      summary: "  intro  ",
      questions: [
        {
          prompt: "  什么是语义核心？ ",
          questionType: " concept ",
          expectedAnswer: "  聚焦定义与边界 ",
          roadmapItemId: " item-1 "
        },
        {
          prompt: "   "
        }
      ]
    });

    expect(prismaMock.diagnosticSession.create).toHaveBeenCalledWith({
      data: {
        domainId: "d1",
        title: "English 诊断",
        status: "draft",
        summary: "intro",
        questions: {
          create: [
            {
              prompt: "什么是语义核心？",
              questionType: "concept",
              expectedAnswer: "聚焦定义与边界",
              learningNodeId: "item-1",
              orderIndex: 0
            }
          ]
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
  });

  it("rejects diagnostic questions that reference a node outside the Domain", async () => {
    prismaMock.domain.findUnique.mockResolvedValue({ id: "d1", name: "English" });
    prismaMock.learningNode.findMany.mockResolvedValue([]);

    await expect(
      createDiagnosticSession("d1", {
        questions: [{ prompt: "forged", roadmapItemId: "domain-b-node" }]
      })
    ).rejects.toThrow("诊断题引用的学习节点不属于该领域或不存在");
    expect(prismaMock.diagnosticSession.create).not.toHaveBeenCalled();
  });

  it("rejects empty answers", async () => {
    await expect(
      saveDiagnosticAnswer("q1", { response: "   " })
    ).rejects.toThrow("回答不能为空");
  });

  it("rejects missing diagnostic question", async () => {
    prismaMock.diagnosticQuestion.findUnique.mockResolvedValue(null);

    await expect(
      saveDiagnosticAnswer("q1", { response: "answer" })
    ).rejects.toThrow("诊断题不存在");
  });

  it("creates an unevaluated user answer even if evaluation fields are supplied", async () => {
    prismaMock.diagnosticQuestion.findUnique.mockResolvedValue({ id: "q1" });
    prismaMock.diagnosticAnswer.create.mockResolvedValue({ id: "a1" });

    await saveDiagnosticAnswer("q1", {
      response: "  my answer ",
      assessment: "  partial ",
      result: " solid "
    });

    expect(prismaMock.diagnosticAnswer.create).toHaveBeenCalledWith({
      data: {
        questionId: "q1",
        response: "my answer",
        assessment: null,
        result: "unreviewed"
      }
    });
  });

  it("falls back to allowed question types and keeps answers unevaluated", async () => {
    prismaMock.domain.findUnique.mockResolvedValue({
      id: "d1",
      name: "English"
    });
    prismaMock.diagnosticSession.create.mockResolvedValue(buildSessionRecord());
    prismaMock.diagnosticQuestion.findUnique.mockResolvedValue({ id: "q1" });
    prismaMock.diagnosticAnswer.create.mockResolvedValue({ id: "a1" });

    await createDiagnosticSession("d1", {
      questions: [
        {
          prompt: "diagnostic prompt",
          questionType: "invalid-type"
        }
      ]
    });

    expect(prismaMock.diagnosticSession.create).toHaveBeenLastCalledWith({
      data: {
        domainId: "d1",
        title: "English \u8bca\u65ad",
        status: "draft",
        summary: null,
        questions: {
          create: [
            {
              prompt: "diagnostic prompt",
              questionType: "concept",
              expectedAnswer: null,
              learningNodeId: null,
              orderIndex: 0
            }
          ]
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

    await saveDiagnosticAnswer("q1", {
      response: "answer",
      result: "invalid-result"
    });

    expect(prismaMock.diagnosticAnswer.create).toHaveBeenLastCalledWith({
      data: {
        questionId: "q1",
        response: "answer",
        assessment: null,
        result: "unreviewed"
      }
    });
  });
});
