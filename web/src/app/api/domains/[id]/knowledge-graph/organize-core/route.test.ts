import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiConfigurationError } from "../../../../../../lib/ai/provider";
import { POST } from "./route";

const tutorServiceMock = vi.hoisted(() => ({
  organizeKnowledgeGraphCoreConcepts: vi.fn()
}));

vi.mock("../../../../../../lib/ai/tutorService", () => ({
  organizeKnowledgeGraphCoreConcepts:
    tutorServiceMock.organizeKnowledgeGraphCoreConcepts
}));

describe("knowledge graph organize-core API", () => {
  const params = { params: Promise.resolve({ id: "d1" }) };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns organized core concepts", async () => {
    tutorServiceMock.organizeKnowledgeGraphCoreConcepts.mockResolvedValue({
      insight: { summary: "Organized summary", coreConcepts: [], priorityGaps: [] }
    });

    const response = await POST(
      new Request("http://localhost/api/domains/d1/knowledge-graph/organize-core", {
        method: "POST"
      }),
      params
    );

    expect(response.status).toBe(200);
    expect(
      tutorServiceMock.organizeKnowledgeGraphCoreConcepts
    ).toHaveBeenCalledWith("d1");
  });

  it("returns 503 for AI configuration errors", async () => {
    tutorServiceMock.organizeKnowledgeGraphCoreConcepts.mockRejectedValue(
      new AiConfigurationError("AI not configured")
    );

    const response = await POST(
      new Request("http://localhost/api/domains/d1/knowledge-graph/organize-core", {
        method: "POST"
      }),
      params
    );

    expect(response.status).toBe(503);
    expect((await response.json()).error).toBe("AI not configured");
  });
});
