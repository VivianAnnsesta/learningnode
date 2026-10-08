import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createKnowledgeRelation,
  deleteKnowledgeRelation,
  deleteKnowledgeWord,
  getKnowledgeWord,
  listKnowledgeRelations,
  searchKnowledgeWords,
  updateKnowledgeRelation,
  updateKnowledgeWord,
  updateKnowledgeWordPosition,
  upsertKnowledgeWord
} from "./knowledgeService";

const prismaMock = vi.hoisted(() => ({
  knowledgePoint: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  },
  knowledgeGraphNode: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    deleteMany: vi.fn()
  },
  knowledgeGraphEdge: {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  },
  $transaction: vi.fn()
}));

vi.mock("../prisma", () => ({
  prisma: prismaMock
}));

const buildMockRelationRecord = (overrides: Record<string, any> = {}) => ({
  id: "r1",
  domainId: "c1",
  relationType: "SUPPORTS",
  detail: null,
  status: "candidate",
  evidenceStrength: "unknown",
  userExplanation: null,
  aiAssessment: undefined,
  applicability: null,
  misuseRisk: null,
  createdAt: undefined,
  fromNode: {
    id: "w1",
    domainId: "c1",
    title: "A",
    domain: { id: "c1", name: "Canvas 1" },
    knowledgePoint: { id: "w1", title: "A" }
  },
  toNode: {
    id: "w2",
    domainId: "c1",
    title: "B",
    domain: { id: "c1", name: "Canvas 1" },
    knowledgePoint: { id: "w2", title: "B" }
  },
  ...overrides
});

describe("knowledgeService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback(prismaMock)
    );
  });

  it.each(["can_apply", "can_transfer", "integrated"])(
    "fails closed before storage when compatibility callers request %s",
    async (masteryStatus) => {
      await expect(
        upsertKnowledgeWord({
          canvasId: "c1",
          word: "derive",
          masteryStatus
        })
      ).rejects.toMatchObject({ code: "forbidden_mastery_status" });
      await expect(
        updateKnowledgeWord("w1", "c1", {
          word: "derive",
          masteryStatus
        })
      ).rejects.toMatchObject({ code: "forbidden_mastery_status" });
      expect(prismaMock.$transaction).not.toHaveBeenCalled();
    }
  );

  it("updates a knowledge word and recreates manual branches in compatibility shape", async () => {
    const fidelityEnvelope = {
      version: 1,
      branches: [{ title: "old branch", detail: "old detail" }],
      legacy: {
        coreEssences: [{ rationale: "preserve me" }],
        inferenceTrees: [{ id: "legacy-tree" }],
        wordTags: ["legacy-tag"]
      }
    };
    prismaMock.knowledgePoint.findFirst.mockResolvedValue({
      id: "w1",
      domainId: "c1",
      title: "derive",
      language: "und",
      sentenceSample: null,
      coreEssence: "old",
      manualBranchesJson: JSON.stringify(fidelityEnvelope),
      userUnderstanding: null,
      masteryStatus: "not_started",
      isIsland: false,
      islandReason: null,
      lastReviewedAt: null,
      nextReviewAt: null,
      reviewIntervalDays: null
    });
    prismaMock.knowledgeGraphNode.findFirst.mockResolvedValue({
      id: "w1",
      domainId: "c1",
      knowledgePointId: "w1",
      title: "derive",
      nodeType: "knowledge",
      status: "not_started",
      positionX: null,
      positionY: null
    });
    prismaMock.knowledgePoint.update.mockResolvedValue({
      id: "w1",
      domainId: "c1",
      title: "derive",
      language: "und",
      sentenceSample: null,
      coreEssence: "core",
      manualBranchesJson: JSON.stringify({
        ...fidelityEnvelope,
        branches: [{ title: "branch", detail: "from definition to use" }]
      }),
      userUnderstanding: null,
      masteryStatus: "not_started",
      isIsland: false,
      islandReason: null,
      lastReviewedAt: null,
      nextReviewAt: null,
      reviewIntervalDays: null
    });
    prismaMock.knowledgeGraphNode.update.mockResolvedValue({
      id: "w1",
      domainId: "c1",
      knowledgePointId: "w1",
      title: "derive",
      nodeType: "knowledge",
      status: "not_started",
      positionX: null,
      positionY: null
    });

    const result = await updateKnowledgeWord("w1", "c1", {
      word: "derive",
      coreEssence: "core",
      branches: [{ title: "branch", detail: "from definition to use" }]
    });

    expect(result?.id).toBe("w1");
    expect(result.trees[0]?.nodes[0]?.label).toBe("branch");
    const update = prismaMock.knowledgePoint.update.mock.calls[0]?.[0];
    expect(JSON.parse(update.data.manualBranchesJson)).toEqual({
      ...fidelityEnvelope,
      branches: [{ title: "branch", detail: "from definition to use" }]
    });
  });

  it("searches words inside a canvas", async () => {
    prismaMock.knowledgePoint.findMany.mockResolvedValue([
      {
        id: "w1",
        domainId: "c1",
        title: "derive",
        language: "und",
        sentenceSample: null,
        coreEssence: "core",
        manualBranchesJson: null,
        userUnderstanding: null,
        masteryStatus: "not_started",
        isIsland: false,
        islandReason: null,
        lastReviewedAt: null,
        nextReviewAt: null,
        reviewIntervalDays: null
      }
    ]);
    prismaMock.knowledgeGraphNode.findMany.mockResolvedValue([]);

    const result = await searchKnowledgeWords({ canvasId: "c1", query: "derive" });

    expect(result[0]?.id).toBe("w1");
    expect(prismaMock.knowledgePoint.findMany).toHaveBeenCalled();
  });

  it("returns empty search results when query is blank", async () => {
    await expect(
      searchKnowledgeWords({ canvasId: "c1", query: "   " })
    ).resolves.toEqual([]);
  });

  it("upserts a knowledge word with normalized payload", async () => {
    prismaMock.knowledgePoint.findFirst.mockResolvedValue(null);
    prismaMock.knowledgePoint.create.mockResolvedValue({
      id: "w1",
      domainId: "c1",
      title: "derive",
      language: "und",
      sentenceSample: null,
      coreEssence: "core",
      manualBranchesJson: JSON.stringify([{ title: "branch", detail: "detail" }]),
      userUnderstanding: null,
      masteryStatus: "not_started",
      isIsland: false,
      islandReason: null,
      lastReviewedAt: null,
      nextReviewAt: null,
      reviewIntervalDays: null
    });
    prismaMock.knowledgeGraphNode.findFirst.mockResolvedValue(null);
    prismaMock.knowledgeGraphNode.create.mockResolvedValue({
      id: "w1",
      domainId: "c1",
      knowledgePointId: "w1",
      title: "derive",
      nodeType: "knowledge",
      status: "not_started",
      positionX: null,
      positionY: null
    });

    await expect(
      upsertKnowledgeWord({
        word: "derive",
        canvasId: "c1",
        coreEssence: "core",
        branches: [{ title: "branch", detail: "detail" }]
      })
    ).resolves.toMatchObject({ id: "w1" });

    expect(prismaMock.knowledgePoint.create).toHaveBeenCalledTimes(1);
  });

  it("reads a fidelity envelope through the existing compatibility tree shape", async () => {
    prismaMock.knowledgePoint.findFirst.mockResolvedValue({
      id: "w1",
      domainId: "c1",
      title: "derive",
      language: "und",
      sentenceSample: null,
      coreEssence: "core",
      manualBranchesJson: JSON.stringify({
        version: 1,
        branches: [{ title: "Create function", detail: "Capture scope" }],
        legacy: { coreEssences: [], inferenceTrees: [], wordTags: [] }
      }),
      userUnderstanding: null,
      masteryStatus: "not_started",
      isIsland: false,
      islandReason: null,
      lastReviewedAt: null,
      nextReviewAt: null,
      reviewIntervalDays: null
    });
    prismaMock.knowledgeGraphNode.findFirst.mockResolvedValue(null);

    await expect(getKnowledgeWord("w1", "c1")).resolves.toMatchObject({
      id: "w1",
      text: "derive",
      trees: [
        {
          nodes: [
            expect.objectContaining({ label: "Create function", content: "Capture scope" })
          ]
        }
      ]
    });
  });

  it("updates word position after ownership validation", async () => {
    prismaMock.knowledgePoint.findFirst.mockResolvedValue({
      id: "w1",
      domainId: "c1",
      title: "derive",
      language: "und",
      sentenceSample: null,
      coreEssence: null,
      manualBranchesJson: null,
      userUnderstanding: null,
      masteryStatus: "not_started",
      isIsland: false,
      islandReason: null,
      lastReviewedAt: null,
      nextReviewAt: null,
      reviewIntervalDays: null
    });
    prismaMock.knowledgeGraphNode.findFirst.mockResolvedValue(null);
    prismaMock.knowledgeGraphNode.create.mockResolvedValue({
      id: "w1",
      domainId: "c1",
      knowledgePointId: "w1",
      title: "derive",
      nodeType: "knowledge",
      status: "not_started",
      positionX: 10,
      positionY: 20
    });

    await expect(
      updateKnowledgeWordPosition("w1", "c1", { x: 10, y: 20 })
    ).resolves.toEqual({
      id: "w1",
      positionX: 10,
      positionY: 20
    });
  });

  it("deletes a knowledge word after ownership validation", async () => {
    prismaMock.knowledgePoint.findFirst.mockResolvedValue({ id: "w1" });
    prismaMock.knowledgePoint.delete.mockResolvedValue({ id: "w1" });

    await expect(deleteKnowledgeWord("w1", "c1")).resolves.toBeUndefined();
    expect(prismaMock.knowledgePoint.delete).toHaveBeenCalledWith({
      where: { id: "w1" }
    });
  });

  it("lists relations for a canvas with an optional word filter", async () => {
    prismaMock.knowledgeGraphEdge.findMany.mockResolvedValue([{ id: "r1" }]);

    await expect(listKnowledgeRelations("c1", "w1")).resolves.toMatchObject([
      { id: "r1" }
    ]);
  });

  it("creates a same-canvas candidate relation with compatibility defaults", async () => {
    prismaMock.knowledgePoint.findFirst
      .mockResolvedValueOnce({
        id: "w1",
        domainId: "c1",
        title: "A",
        masteryStatus: "not_started",
        isIsland: false
      })
      .mockResolvedValueOnce({
        id: "w2",
        domainId: "c1",
        title: "B",
        masteryStatus: "not_started",
        isIsland: false
      });
    prismaMock.knowledgeGraphNode.findFirst.mockResolvedValue(null);
    prismaMock.knowledgeGraphNode.create
      .mockResolvedValueOnce({
        id: "w1",
        domainId: "c1",
        knowledgePointId: "w1",
        title: "A",
        nodeType: "knowledge",
        status: "not_started",
        positionX: null,
        positionY: null
      })
      .mockResolvedValueOnce({
        id: "w2",
        domainId: "c1",
        knowledgePointId: "w2",
        title: "B",
        nodeType: "knowledge",
        status: "not_started",
        positionX: null,
        positionY: null
      });
    prismaMock.knowledgeGraphEdge.create.mockResolvedValue({ id: "r1" });
    prismaMock.knowledgeGraphEdge.findFirst.mockResolvedValue(null);
    prismaMock.knowledgeGraphEdge.findUnique.mockResolvedValue(
      buildMockRelationRecord()
    );

    await expect(
      createKnowledgeRelation(
        "c1",
        {
          fromWordId: "w1",
          toWordId: "w2",
          relationType: "SUPPORTS"
        },
        { defaultStatus: "candidate", defaultWormholeStatus: "wormhole_candidate" }
      )
    ).resolves.toMatchObject({
      id: "r1",
      relationType: "SUPPORTS",
      status: "candidate",
      fromWordId: "w1",
      toWordId: "w2"
    });
    expect(prismaMock.knowledgeGraphEdge.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "candidate" })
      })
    );
  });

  it("returns an existing business-identical relation idempotently", async () => {
    prismaMock.knowledgePoint.findFirst
      .mockResolvedValueOnce({
        id: "w1",
        domainId: "c1",
        title: "A",
        masteryStatus: "not_started",
        isIsland: false
      })
      .mockResolvedValueOnce({
        id: "w2",
        domainId: "c1",
        title: "B",
        masteryStatus: "not_started",
        isIsland: false
      });
    prismaMock.knowledgeGraphNode.findFirst
      .mockResolvedValueOnce({ id: "w1", nodeType: "knowledge" })
      .mockResolvedValueOnce({ id: "w2", nodeType: "knowledge" });
    prismaMock.knowledgeGraphEdge.findFirst.mockResolvedValue({ id: "r1" });
    prismaMock.knowledgeGraphEdge.findUnique.mockResolvedValue(
      buildMockRelationRecord()
    );

    await expect(
      createKnowledgeRelation(
        "c1",
        {
          fromWordId: "w1",
          toWordId: "w2",
          relationType: "SUPPORTS"
        },
        { defaultStatus: "candidate" }
      )
    ).resolves.toMatchObject({ id: "r1" });

    expect(prismaMock.knowledgeGraphEdge.create).not.toHaveBeenCalled();
  });

  it("rejects formal relation creation without user evidence", async () => {
    await expect(
      createKnowledgeRelation("c1", {
        fromWordId: "w1",
        toWordId: "w2",
        relationType: "SUPPORTS",
        status: "confirmed",
        evidenceStrength: "strong"
      })
    ).rejects.toThrow("确认正式关系前必须写下用户解释。");
    expect(prismaMock.knowledgeGraphEdge.create).not.toHaveBeenCalled();
  });

  it("rejects wormhole creation when target is missing", async () => {
    prismaMock.knowledgePoint.findFirst
      .mockResolvedValueOnce({
        id: "w1",
        domainId: "c1",
        title: "A",
        masteryStatus: "not_started",
        isIsland: false
      })
      .mockResolvedValueOnce(null);
    prismaMock.knowledgeGraphNode.findFirst.mockResolvedValue(null);

    await expect(
      createKnowledgeRelation(
        "c1",
        {
          fromWordId: "w1",
          toWordId: "missing",
          relationType: "WORMHOLE"
        },
        { defaultStatus: "confirmed", defaultWormholeStatus: "wormhole_candidate" }
      )
    ).rejects.toThrow();
  });

  it("rejects empty relation updates", async () => {
    await expect(updateKnowledgeRelation("r1", "c1", {})).rejects.toThrow();
  });

  it("updates a wormhole relation after validating endpoints", async () => {
    prismaMock.knowledgeGraphEdge.findUnique
      .mockResolvedValueOnce(
        buildMockRelationRecord({
          relationType: "WORMHOLE",
          toNode: {
            id: "w2",
            domainId: "c2",
            title: "B",
            domain: { id: "c2", name: "Canvas 2" },
            knowledgePoint: { id: "w2", title: "B" }
          }
        })
      )
      .mockResolvedValueOnce(
        buildMockRelationRecord({
          relationType: "WORMHOLE",
          toNode: {
            id: "w3",
            domainId: "c2",
            title: "C",
            domain: { id: "c2", name: "Canvas 2" },
            knowledgePoint: { id: "w3", title: "C" }
          }
        })
      );
    prismaMock.knowledgePoint.findFirst
      .mockResolvedValueOnce({
        id: "w1",
        domainId: "c1",
        title: "A",
        masteryStatus: "not_started",
        isIsland: false
      })
      .mockResolvedValueOnce({
        id: "w3",
        domainId: "c2",
        title: "C",
        masteryStatus: "not_started",
        isIsland: false
      });
    prismaMock.knowledgeGraphNode.findFirst.mockResolvedValue(null);
    prismaMock.knowledgeGraphNode.create
      .mockResolvedValueOnce({
        id: "w1",
        domainId: "c1",
        knowledgePointId: "w1",
        title: "A",
        nodeType: "knowledge",
        status: "not_started",
        positionX: null,
        positionY: null
      })
      .mockResolvedValueOnce({
        id: "w3",
        domainId: "c2",
        knowledgePointId: "w3",
        title: "C",
        nodeType: "knowledge",
        status: "not_started",
        positionX: null,
        positionY: null
      });
    prismaMock.knowledgeGraphEdge.update.mockResolvedValue({ id: "r1" });

    const result = await updateKnowledgeRelation("r1", "c1", {
      toWordId: "w3",
      relationType: "WORMHOLE"
    });

    expect(result).toMatchObject({
      id: "r1",
      relationType: "WORMHOLE",
      fromWordId: "w1",
      toWordId: "w3"
    });
  });

  it("rejects formal relation confirmation without explicit evidence", async () => {
    prismaMock.knowledgeGraphEdge.findUnique.mockResolvedValue({
      id: "r1",
      domainId: "c1",
      relationType: "SUPPORTS",
      status: "candidate",
      evidenceStrength: "unknown",
      userExplanation: null,
      applicability: null,
      misuseRisk: null,
      fromNode: {
        id: "w1",
        domainId: "c1",
        domain: { id: "c1", name: "Canvas 1" },
        knowledgePoint: { id: "w1", title: "A" }
      },
      toNode: {
        id: "w2",
        domainId: "c1",
        domain: { id: "c1", name: "Canvas 1" },
        knowledgePoint: { id: "w2", title: "B" }
      }
    });

    await expect(
      updateKnowledgeRelation("r1", "c1", {
        status: "confirmed",
        userExplanation: "This relation is plausible."
      })
    ).rejects.toThrow("确认正式关系前必须提供明确的依据强度。");
    expect(prismaMock.knowledgeGraphEdge.update).not.toHaveBeenCalled();
  });

  it("confirms a formal relation when explanation and evidence are present", async () => {
    prismaMock.knowledgeGraphEdge.findUnique
      .mockResolvedValueOnce(buildMockRelationRecord())
      .mockResolvedValueOnce(
        buildMockRelationRecord({
          status: "confirmed",
          evidenceStrength: "medium",
          userExplanation: "The source explicitly supports the target."
        })
      );
    prismaMock.knowledgePoint.findFirst
      .mockResolvedValueOnce({
        id: "w1",
        domainId: "c1",
        title: "A",
        masteryStatus: "not_started",
        isIsland: false
      })
      .mockResolvedValueOnce({
        id: "w2",
        domainId: "c1",
        title: "B",
        masteryStatus: "not_started",
        isIsland: false
      });
    prismaMock.knowledgeGraphNode.findFirst.mockResolvedValue({
      id: "w1",
      domainId: "c1",
      knowledgePointId: "w1",
      title: "A",
      nodeType: "knowledge",
      status: "not_started",
      positionX: null,
      positionY: null
    });
    prismaMock.knowledgeGraphEdge.update.mockResolvedValue({
      id: "r1",
      status: "confirmed"
    });

    const result = await updateKnowledgeRelation("r1", "c1", {
      status: "confirmed",
      evidenceStrength: "medium",
      userExplanation: "The source explicitly supports the target."
    });

    expect(result).toMatchObject({
      id: "r1",
      status: "confirmed",
      evidenceStrength: "medium",
      userExplanation: "The source explicitly supports the target."
    });
  });

  it("rejects confirmed wormholes without boundary and misuse risk", async () => {
    prismaMock.knowledgeGraphEdge.findUnique.mockResolvedValue({
      id: "r1",
      domainId: "c1",
      relationType: "WORMHOLE",
      status: "wormhole_candidate",
      evidenceStrength: "unknown",
      userExplanation: null,
      applicability: null,
      misuseRisk: null,
      fromNode: {
        id: "w1",
        domainId: "c1",
        domain: { id: "c1", name: "Canvas 1" },
        knowledgePoint: { id: "w1", title: "A" }
      },
      toNode: {
        id: "w2",
        domainId: "c2",
        domain: { id: "c2", name: "Canvas 2" },
        knowledgePoint: { id: "w2", title: "B" }
      }
    });

    await expect(
      updateKnowledgeRelation("r1", "c1", {
        status: "confirmed_wormhole",
        evidenceStrength: "strong",
        userExplanation: "The transfer has been tested."
      })
    ).rejects.toThrow("确认虫洞前必须写明适用边界和误用风险。");
  });

  it("rejects non-wormhole cross-canvas relations", async () => {
    prismaMock.knowledgeGraphEdge.findUnique.mockResolvedValue({
      id: "r1",
      domainId: "c1",
      relationType: "SUPPORTS",
      status: "candidate",
      evidenceStrength: "unknown",
      userExplanation: null,
      applicability: null,
      misuseRisk: null,
      fromNode: {
        id: "w1",
        domainId: "c1",
        domain: { id: "c1", name: "Canvas 1" },
        knowledgePoint: { id: "w1", title: "A" }
      },
      toNode: {
        id: "w2",
        domainId: "c1",
        domain: { id: "c1", name: "Canvas 1" },
        knowledgePoint: { id: "w2", title: "B" }
      }
    });
    prismaMock.knowledgePoint.findFirst
      .mockResolvedValueOnce({
        id: "w1",
        domainId: "c1",
        title: "A",
        masteryStatus: "not_started",
        isIsland: false
      })
      .mockResolvedValueOnce(null);

    await expect(
      updateKnowledgeRelation("r1", "c1", {
        fromWordId: "w1",
        toWordId: "w9",
        relationType: "SUPPORTS"
      })
    ).rejects.toThrow();
  });

  it("deletes relation after ownership validation", async () => {
    prismaMock.knowledgeGraphEdge.findUnique.mockResolvedValue({
      id: "r1",
      domainId: "c1",
      relationType: "SUPPORTS",
      fromNode: {
        id: "w1",
        domainId: "c1",
        domain: { id: "c1", name: "Canvas 1" },
        knowledgePoint: { id: "w1", title: "A" }
      },
      toNode: {
        id: "w2",
        domainId: "c1",
        domain: { id: "c1", name: "Canvas 1" },
        knowledgePoint: { id: "w2", title: "B" }
      }
    });
    prismaMock.knowledgeGraphEdge.delete.mockResolvedValue({ id: "r1" });

    await deleteKnowledgeRelation("r1", "c1");

    expect(prismaMock.knowledgeGraphEdge.delete).toHaveBeenCalledWith({
      where: { id: "r1" }
    });
  });
});
