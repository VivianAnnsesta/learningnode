import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  acceptRouteSuggestion,
  classifyRouteSuggestionLevel,
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






});
