import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, PUT } from "./route";

const knowledgeServiceMock = vi.hoisted(() => ({
  updateKnowledgeRelation: vi.fn(),
  deleteKnowledgeRelation: vi.fn(),
  KnowledgeRelationError: class extends Error {
    constructor(
      message: string,
      public readonly code: string
    ) {
      super(message);
    }
  }
}));

vi.mock("../../../../lib/learning/knowledgeService", () => ({
  updateKnowledgeRelation: knowledgeServiceMock.updateKnowledgeRelation,
  deleteKnowledgeRelation: knowledgeServiceMock.deleteKnowledgeRelation,
  KnowledgeRelationError: knowledgeServiceMock.KnowledgeRelationError
}));

describe("relation detail API", () => {
  const params = { params: Promise.resolve({ id: "rel-1" }) };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when PUT is missing canvasId", async () => {
    const response = await PUT(
      new Request("http://localhost/api/relations/rel-1", {
        method: "PUT",
        body: JSON.stringify({ relationType: "SUPPORTS" })
      }),
      params
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("画布 ID 不能为空。");
  });

  it("uses knowledge service in PUT", async () => {
    knowledgeServiceMock.updateKnowledgeRelation.mockResolvedValue({
      id: "rel-1"
    });

    const response = await PUT(
      new Request("http://localhost/api/relations/rel-1?canvasId=c1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relationType: "SUPPORTS" })
      }),
      params
    );

    expect(response.status).toBe(200);
    expect(knowledgeServiceMock.updateKnowledgeRelation).toHaveBeenCalledWith(
      "rel-1",
      "c1",
      { relationType: "SUPPORTS" }
    );
  });

  it("maps validation errors from PUT to 400", async () => {
    knowledgeServiceMock.updateKnowledgeRelation.mockRejectedValue(
      new Error("不允许跨画布创建关系。")
    );

    const response = await PUT(
      new Request("http://localhost/api/relations/rel-1?canvasId=c1", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ relationType: "SUPPORTS" })
      }),
      params
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("不允许跨画布创建关系。");
  });

  it("maps formal confirmation guard errors from PUT to 400", async () => {
    knowledgeServiceMock.updateKnowledgeRelation.mockRejectedValue(
      new knowledgeServiceMock.KnowledgeRelationError(
        "确认正式关系前必须写下用户解释。",
        "missing_confirmation"
      )
    );

    const response = await PUT(
      new Request("http://localhost/api/relations/rel-1?canvasId=c1", {
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

  it("delegates relation deletion to knowledge service", async () => {
    knowledgeServiceMock.deleteKnowledgeRelation.mockResolvedValue(undefined);

    const response = await DELETE(
      new Request("http://localhost/api/relations/rel-1?canvasId=c1", {
        method: "DELETE"
      }),
      params
    );

    expect(response.status).toBe(200);
    expect(knowledgeServiceMock.deleteKnowledgeRelation).toHaveBeenCalledWith(
      "rel-1",
      "c1"
    );
  });
});
