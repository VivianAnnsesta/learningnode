import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiConfigurationError } from "../../../../../../../../lib/ai/provider";
import { KnowledgeRelationError } from "../../../../../../../../lib/learning/knowledgeService";
import { POST } from "./route";

const tutorServiceMock = vi.hoisted(() => ({
  explainKnowledgeRelation: vi.fn()
}));

vi.mock("../../../../../../../../lib/ai/tutorService", () => ({
  explainKnowledgeRelation: tutorServiceMock.explainKnowledgeRelation
}));

describe("knowledge graph relation explain API", () => {
  const params = { params: Promise.resolve({ id: "d1", relationId: "r1" }) };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the generated relation explanation", async () => {
    tutorServiceMock.explainKnowledgeRelation.mockResolvedValue({
      explanation: { summary: "Relation explanation" }
    });

    const response = await POST(
      new Request(
        "http://localhost/api/domains/d1/knowledge-graph/relations/r1/explain",
        { method: "POST" }
      ),
      params
    );

    expect(response.status).toBe(200);
    expect(tutorServiceMock.explainKnowledgeRelation).toHaveBeenCalledWith(
      "d1",
      "r1"
    );
  });

  it("returns 503 for AI configuration errors", async () => {
    tutorServiceMock.explainKnowledgeRelation.mockRejectedValue(
      new AiConfigurationError("AI not configured")
    );

    const response = await POST(
      new Request(
        "http://localhost/api/domains/d1/knowledge-graph/relations/r1/explain",
        { method: "POST" }
      ),
      params
    );

    expect(response.status).toBe(503);
    expect((await response.json()).error).toBe("AI not configured");
  });

  it("returns 404 when the relation does not belong to the URL Domain", async () => {
    tutorServiceMock.explainKnowledgeRelation.mockRejectedValue(
      new KnowledgeRelationError("Relation not found in this domain.", "not_found")
    );

    const response = await POST(
      new Request(
        "http://localhost/api/domains/d1/knowledge-graph/relations/r1/explain",
        { method: "POST" }
      ),
      params
    );

    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("Relation not found in this domain.");
  });
});
