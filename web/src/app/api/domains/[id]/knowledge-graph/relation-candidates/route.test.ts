import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiConfigurationError } from "../../../../../../lib/ai/provider";
import { POST } from "./route";

const tutorServiceMock = vi.hoisted(() => ({
  generateRelationCandidates: vi.fn()
}));
const prismaMock = vi.hoisted(() => ({
  knowledgePoint: { findFirst: vi.fn() }
}));

vi.mock("../../../../../../lib/ai/tutorService", () => ({
  generateRelationCandidates: tutorServiceMock.generateRelationCandidates
}));
vi.mock("../../../../../../lib/prisma", () => ({ prisma: prismaMock }));

describe("knowledge graph relation candidates API", () => {
  const params = { params: Promise.resolve({ id: "d1" }) };

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.knowledgePoint.findFirst.mockResolvedValue({ id: "w1" });
  });

  it("requires sourceKnowledgePointId", async () => {
    const response = await POST(
      new Request(
        "http://localhost/api/domains/d1/knowledge-graph/relation-candidates",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({})
        }
      ),
      params
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("sourceKnowledgePointId 不能为空。");
  });

  it("returns generated relation candidates", async () => {
    tutorServiceMock.generateRelationCandidates.mockResolvedValue({
      candidates: [{ targetWordId: "w2" }],
      targets: [{ id: "w2" }]
    });

    const response = await POST(
      new Request(
        "http://localhost/api/domains/d1/knowledge-graph/relation-candidates",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceKnowledgePointId: "w1",
            userQuestion: "Find transfer relations"
          })
        }
      ),
      params
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      candidates: [{ targetWordId: "w2" }],
      targets: [{ id: "w2" }]
    });
    expect(tutorServiceMock.generateRelationCandidates).toHaveBeenCalledWith("w1", {
      canvasId: "d1",
      userQuestion: "Find transfer relations"
    });
  });

  it("returns 503 for AI configuration errors", async () => {
    tutorServiceMock.generateRelationCandidates.mockRejectedValue(
      new AiConfigurationError("AI not configured")
    );

    const response = await POST(
      new Request(
        "http://localhost/api/domains/d1/knowledge-graph/relation-candidates",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceKnowledgePointId: "w1" })
        }
      ),
      params
    );

    expect(response.status).toBe(503);
    expect((await response.json()).error).toBe("AI not configured");
  });

  it("rejects a source knowledge point outside the URL domain", async () => {
    prismaMock.knowledgePoint.findFirst.mockResolvedValue(null);

    const response = await POST(
      new Request(
        "http://localhost/api/domains/d1/knowledge-graph/relation-candidates",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceKnowledgePointId: "other-domain-point" })
        }
      ),
      params
    );

    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("起点不属于该领域。");
    expect(tutorServiceMock.generateRelationCandidates).not.toHaveBeenCalled();
  });
});
