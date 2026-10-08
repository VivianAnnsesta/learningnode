import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

const knowledgeServiceMock = vi.hoisted(() => ({
  listKnowledgeRelations: vi.fn(),
  createKnowledgeRelation: vi.fn(),
  KnowledgeRelationError: class extends Error {
    constructor(
      message: string,
      public readonly code: string
    ) {
      super(message);
    }
  }
}));

vi.mock("../../../lib/learning/knowledgeService", () => ({
  listKnowledgeRelations: knowledgeServiceMock.listKnowledgeRelations,
  createKnowledgeRelation: knowledgeServiceMock.createKnowledgeRelation,
  KnowledgeRelationError: knowledgeServiceMock.KnowledgeRelationError
}));

describe("relations API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when GET is missing canvasId", async () => {
    const response = await GET(new Request("http://localhost/api/relations"));

    expect(response.status).toBe(400);
  });

  it("delegates GET to knowledge service", async () => {
    knowledgeServiceMock.listKnowledgeRelations.mockResolvedValue([{ id: "r1" }]);

    const response = await GET(
      new Request("http://localhost/api/relations?canvasId=c1&wordId=w1")
    );

    expect(response.status).toBe(200);
    expect(knowledgeServiceMock.listKnowledgeRelations).toHaveBeenCalledWith(
      "c1",
      "w1"
    );
    expect((await response.json()).relations[0].id).toBe("r1");
  });

  it("returns 400 when POST JSON is invalid", async () => {
    const response = await POST(
      new Request("http://localhost/api/relations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{"
      })
    );

    expect(response.status).toBe(400);
  });

  it("delegates POST to knowledge service with compatibility defaults", async () => {
    knowledgeServiceMock.createKnowledgeRelation.mockResolvedValue({ id: "r1" });

    const response = await POST(
      new Request("http://localhost/api/relations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canvasId: "c1",
          fromWordId: "w1",
          toWordId: "w2",
          relationType: "SUPPORTS"
        })
      })
    );

    expect(response.status).toBe(200);
    expect(knowledgeServiceMock.createKnowledgeRelation).toHaveBeenCalledWith(
      "c1",
      {
        canvasId: "c1",
        fromWordId: "w1",
        toWordId: "w2",
        relationType: "SUPPORTS"
      },
      {
        defaultStatus: "candidate",
        defaultWormholeStatus: "wormhole_candidate"
      }
    );
  });

  it("maps missing target errors from POST to 404", async () => {
    knowledgeServiceMock.createKnowledgeRelation.mockRejectedValue(
      new knowledgeServiceMock.KnowledgeRelationError("missing", "target_not_found")
    );

    const response = await POST(
      new Request("http://localhost/api/relations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          canvasId: "c1",
          fromWordId: "w1",
          toWordId: "w2",
          relationType: "WORMHOLE"
        })
      })
    );

    expect(response.status).toBe(404);
  });
});
