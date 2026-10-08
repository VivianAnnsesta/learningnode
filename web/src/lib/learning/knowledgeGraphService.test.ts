import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createKnowledgeGraphRelation,
  deleteKnowledgeGraphRelation,
  updateKnowledgeGraphRelation
} from "./knowledgeGraphService";

const knowledgeServiceMock = vi.hoisted(() => ({
  createKnowledgeRelation: vi.fn(),
  listKnowledgeRelations: vi.fn(),
  updateKnowledgeRelation: vi.fn(),
  deleteKnowledgeRelation: vi.fn()
}));

vi.mock("./knowledgeService", () => ({
  createKnowledgeRelation: knowledgeServiceMock.createKnowledgeRelation,
  listKnowledgeRelations: knowledgeServiceMock.listKnowledgeRelations,
  updateKnowledgeRelation: knowledgeServiceMock.updateKnowledgeRelation,
  deleteKnowledgeRelation: knowledgeServiceMock.deleteKnowledgeRelation
}));

vi.mock("../prisma", () => ({
  prisma: {
    graphCanvas: { findUnique: vi.fn() },
    word: { findMany: vi.fn() }
  }
}));

describe("knowledgeGraphService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("forces newly created graph relations to remain candidates", async () => {
    knowledgeServiceMock.createKnowledgeRelation.mockResolvedValue({ id: "rel-1" });

    await createKnowledgeGraphRelation("domain-1", {
      fromKnowledgePointId: "word-1",
      toKnowledgePointId: "word-2",
      relationType: "related",
      status: "confirmed",
      evidenceStrength: "strong"
    });

    expect(knowledgeServiceMock.createKnowledgeRelation).toHaveBeenCalledWith(
      "domain-1",
      expect.objectContaining({
        relationType: "related",
        status: "candidate",
        evidenceStrength: "strong"
      }),
      {
        defaultStatus: "candidate",
        defaultWormholeStatus: "wormhole_candidate"
      }
    );
  });

  it("forces newly created wormholes to remain candidates", async () => {
    knowledgeServiceMock.createKnowledgeRelation.mockResolvedValue({ id: "rel-1" });

    await createKnowledgeGraphRelation("domain-1", {
      fromKnowledgePointId: "word-1",
      toKnowledgePointId: "word-2",
      relationType: "WORMHOLE",
      status: "confirmed_wormhole"
    });

    expect(knowledgeServiceMock.createKnowledgeRelation).toHaveBeenCalledWith(
      "domain-1",
      expect.objectContaining({
        relationType: "WORMHOLE",
        status: "wormhole_candidate"
      }),
      expect.any(Object)
    );
  });

  it("updates a graph relation through domain-scoped ownership", async () => {
    knowledgeServiceMock.updateKnowledgeRelation.mockResolvedValue({
      id: "rel-1",
      status: "confirmed"
    });

    await expect(
      updateKnowledgeGraphRelation("domain-1", "rel-1", { status: "confirmed" })
    ).resolves.toMatchObject({
      id: "rel-1",
      status: "confirmed"
    });

    expect(knowledgeServiceMock.updateKnowledgeRelation).toHaveBeenCalledWith(
      "rel-1",
      "domain-1",
      { status: "confirmed" }
    );
  });

  it("deletes a graph relation through domain-scoped ownership", async () => {
    knowledgeServiceMock.deleteKnowledgeRelation.mockResolvedValue(undefined);

    await expect(
      deleteKnowledgeGraphRelation("domain-1", "rel-1")
    ).resolves.toBeUndefined();

    expect(knowledgeServiceMock.deleteKnowledgeRelation).toHaveBeenCalledWith(
      "rel-1",
      "domain-1"
    );
  });
});
