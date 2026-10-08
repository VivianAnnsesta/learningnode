import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  acceptRouteSuggestion,
  classifyRouteSuggestionLevel,
  createRouteSuggestionsFromDiagnosticAnswer
} from "./routeSuggestionService";

const prismaMock = vi.hoisted(() => ({
  routeSuggestion: {
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn()
  },
  learningNode: {
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn()
  },
  learningNodeDependency: {
    create: vi.fn()
  },
  diagnosticAnswer: {
    findUnique: vi.fn()
  },
  $transaction: vi.fn()
}));

const domainMapServiceMock = vi.hoisted(() => ({
  getLearningNodeDetails: vi.fn()
}));

vi.mock("../prisma", () => ({
  prisma: prismaMock
}));

vi.mock("./domainMapService", () => domainMapServiceMock);

describe("routeSuggestionService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback(prismaMock)
    );
  });

  it("classifies L1 suggestions as non-map-changing", () => {
    expect(classifyRouteSuggestionLevel("L1")).toEqual({
      changesMap: false,
      requiresManualMapConfirmation: false
    });
  });

  it("classifies L2 suggestions as requiring the Domain Map confirmation flow", () => {
    expect(classifyRouteSuggestionLevel("L2")).toEqual({
      changesMap: true,
      requiresManualMapConfirmation: true
    });
  });

  it("classifies L3 suggestions as requiring manual map confirmation", () => {
    expect(classifyRouteSuggestionLevel("L3")).toEqual({
      changesMap: true,
      requiresManualMapConfirmation: true
    });
  });

  it("rejects map-changing suggestions outside the versioned map flow", async () => {
    prismaMock.routeSuggestion.findUnique.mockResolvedValue({
      id: "suggestion-1",
      domainId: "domain-1",
      sourceNodeId: "node-1",
      level: "L2",
      title: "补救节点",
      rationale: "需要补救",
      changesMap: true,
      status: "candidate",
      payload: JSON.stringify({
        remedialTitle: "补救：节点",
        remedialObjective: "补齐误区"
      })
    });

    await expect(acceptRouteSuggestion("suggestion-1")).rejects.toThrow(
      "versioned Domain Map draft"
    );
    expect(prismaMock.learningNode.create).not.toHaveBeenCalled();
  });

  it("does not apply an L2 suggestion even when a reason is supplied", async () => {
    prismaMock.routeSuggestion.findUnique.mockResolvedValue({
      id: "suggestion-1",
      domainId: "domain-1",
      sourceNodeId: "node-1",
      level: "L2",
      title: "补救节点",
      rationale: "需要补救",
      changesMap: true,
      status: "candidate",
      payload: JSON.stringify({
        remedialTitle: "补救：节点",
        remedialObjective: "补齐误区"
      })
    });
    await expect(
      acceptRouteSuggestion("suggestion-1", {
        confirmationReason: "诊断显示边界问题，需要补救。"
      })
    ).rejects.toThrow("versioned Domain Map draft");
    expect(prismaMock.learningNode.create).not.toHaveBeenCalled();
  });

  it("rejects diagnostic route suggestions before the answer is evaluated", async () => {
    prismaMock.diagnosticAnswer.findUnique.mockResolvedValue({
      id: "answer-1",
      assessment: null,
      question: { roadmapItemId: "node-1" }
    });

    await expect(
      createRouteSuggestionsFromDiagnosticAnswer("answer-1")
    ).rejects.toThrow(
      "Route suggestions require an evaluated diagnostic answer."
    );
  });

  it("rejects diagnostic route suggestions without a linked learning node", async () => {
    prismaMock.diagnosticAnswer.findUnique.mockResolvedValue({
      id: "answer-1",
      assessment: "{}",
      question: { roadmapItemId: null }
    });

    await expect(
      createRouteSuggestionsFromDiagnosticAnswer("answer-1")
    ).rejects.toThrow("Diagnostic answer is not linked to a learning node.");
  });

  it("creates diagnostic route suggestions only from an evaluated answer", async () => {
    prismaMock.diagnosticAnswer.findUnique.mockResolvedValue({
      id: "answer-1",
      assessment: JSON.stringify({ summary: "Needs remediation." }),
      question: { roadmapItemId: "node-1" }
    });
    domainMapServiceMock.getLearningNodeDetails.mockResolvedValue({
      node: {
        id: "node-1",
        title: "节点",
        moduleId: "module-1"
      },
      domain: {
        id: "domain-1"
      }
    });

    const suggestions = await createRouteSuggestionsFromDiagnosticAnswer("answer-1");

    expect(suggestions).toHaveLength(3);
    expect(domainMapServiceMock.getLearningNodeDetails).toHaveBeenCalledWith(
      "node-1"
    );
    expect(prismaMock.routeSuggestion.create).toHaveBeenCalledTimes(3);
    expect(prismaMock.routeSuggestion.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({
          domainId: "domain-1",
          sourceNodeId: "node-1",
          level: "L1",
          title: "在当前节点补做练习",
          changesMap: false
        })
      })
    );
    expect(prismaMock.routeSuggestion.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({
          level: "L2",
          changesMap: true,
          rationale: expect.stringContaining("Map Draft")
        })
      })
    );
  });
});
