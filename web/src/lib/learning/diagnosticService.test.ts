import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getDiagnosticSession,
  listDiagnosticSessions
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














});
