import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, PUT } from "./route";

const knowledgeGraphServiceMock = vi.hoisted(() => ({
  updateKnowledgeGraphRelation: vi.fn(),
  deleteKnowledgeGraphRelation: vi.fn()
}));

const knowledgeServiceMock = vi.hoisted(() => ({
  KnowledgeRelationError: class extends Error {
    constructor(
      message: string,
      public readonly code: string
    ) {
      super(message);
    }
  }
}));

vi.mock("../../../../../../../lib/learning/knowledgeGraphService", () => ({
  updateKnowledgeGraphRelation:
    knowledgeGraphServiceMock.updateKnowledgeGraphRelation,
  deleteKnowledgeGraphRelation:
    knowledgeGraphServiceMock.deleteKnowledgeGraphRelation
}));

vi.mock("../../../../../../../lib/learning/knowledgeService", () => ({
  KnowledgeRelationError: knowledgeServiceMock.KnowledgeRelationError
}));

describe("domain knowledge-graph relation detail API", () => {
  const params = { params: Promise.resolve({ id: "d1", relationId: "rel-1" }) };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates PUT to knowledge graph service", async () => {
    knowledgeGraphServiceMock.updateKnowledgeGraphRelation.mockResolvedValue({
      id: "rel-1",
      status: "confirmed"
    });

    const response = await PUT(
      new Request("http://localhost/api/domains/d1/knowledge-graph/relations/rel-1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "confirmed" })
      }),
      params
    );

    expect(response.status).toBe(200);
    expect(
      knowledgeGraphServiceMock.updateKnowledgeGraphRelation
    ).toHaveBeenCalledWith("d1", "rel-1", { status: "confirmed" });
  });

  it("maps relation validation errors to 400", async () => {
    knowledgeGraphServiceMock.updateKnowledgeGraphRelation.mockRejectedValue(
      new knowledgeServiceMock.KnowledgeRelationError(
        "确认正式关系前必须写下用户解释。",
        "missing_confirmation"
      )
    );

    const response = await PUT(
      new Request("http://localhost/api/domains/d1/knowledge-graph/relations/rel-1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "confirmed" })
      }),
      params
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(
      "确认正式关系前必须写下用户解释。"
    );
  });

  it("delegates DELETE to knowledge graph service", async () => {
    knowledgeGraphServiceMock.deleteKnowledgeGraphRelation.mockResolvedValue(
      undefined
    );

    const response = await DELETE(
      new Request("http://localhost/api/domains/d1/knowledge-graph/relations/rel-1", {
        method: "DELETE"
      }),
      params
    );

    expect(response.status).toBe(200);
    expect(
      knowledgeGraphServiceMock.deleteKnowledgeGraphRelation
    ).toHaveBeenCalledWith("d1", "rel-1");
  });
});
