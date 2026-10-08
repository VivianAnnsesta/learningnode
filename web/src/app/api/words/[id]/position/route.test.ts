import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "./route";

const knowledgeServiceMock = vi.hoisted(() => ({
  updateKnowledgeWordPosition: vi.fn(),
  KnowledgeWordError: class extends Error {
    constructor(
      message: string,
      public readonly code: string
    ) {
      super(message);
    }
  }
}));

vi.mock("../../../../../lib/learning/knowledgeService", () => ({
  updateKnowledgeWordPosition: knowledgeServiceMock.updateKnowledgeWordPosition,
  KnowledgeWordError: knowledgeServiceMock.KnowledgeWordError
}));

describe("word position API", () => {
  const params = { params: Promise.resolve({ id: "word-1" }) };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when canvasId is missing", async () => {
    const response = await PATCH(
      new Request("http://localhost/api/words/word-1/position", {
        method: "PATCH",
        body: JSON.stringify({ x: 10, y: 20 })
      }),
      params
    );

    expect(response.status).toBe(400);
  });

  it("delegates valid updates to the knowledge service", async () => {
    knowledgeServiceMock.updateKnowledgeWordPosition.mockResolvedValue({
      id: "word-1",
      positionX: 10,
      positionY: 20
    });

    const response = await PATCH(
      new Request("http://localhost/api/words/word-1/position?canvasId=c1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ x: 10, y: 20 })
      }),
      params
    );

    expect(response.status).toBe(200);
    expect(knowledgeServiceMock.updateKnowledgeWordPosition).toHaveBeenCalledWith(
      "word-1",
      "c1",
      { x: 10, y: 20 }
    );
  });

  it("maps not found errors to 404", async () => {
    knowledgeServiceMock.updateKnowledgeWordPosition.mockRejectedValue(
      new knowledgeServiceMock.KnowledgeWordError("missing", "not_found")
    );

    const response = await PATCH(
      new Request("http://localhost/api/words/word-1/position?canvasId=c1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ x: 10, y: 20 })
      }),
      params
    );

    expect(response.status).toBe(404);
  });
});
