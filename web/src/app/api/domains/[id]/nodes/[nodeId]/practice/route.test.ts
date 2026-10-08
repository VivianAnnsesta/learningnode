import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiConfigurationError } from "../../../../../../../lib/ai/provider";
import { POST } from "./route";

const tutorServiceMock = vi.hoisted(() => ({
  generateLearningNodePractice: vi.fn()
}));
const domainMapServiceMock = vi.hoisted(() => ({
  assertLearningNodeInDomain: vi.fn()
}));

vi.mock("../../../../../../../lib/ai/tutorService", () => ({
  generateLearningNodePractice: tutorServiceMock.generateLearningNodePractice
}));
vi.mock("../../../../../../../lib/learning/domainMapService", () => ({
  assertLearningNodeInDomain: domainMapServiceMock.assertLearningNodeInDomain
}));

describe("domain node practice API", () => {
  const params = { params: Promise.resolve({ id: "d1", nodeId: "n1" }) };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes parsed body to tutor service", async () => {
    tutorServiceMock.generateLearningNodePractice.mockResolvedValue({
      practice: { prompt: "Practice prompt" }
    });

    const response = await POST(
      new Request("http://localhost/api/domains/d1/nodes/n1/practice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userGoal: "use this in a new case" })
      }),
      params
    );

    expect(response.status).toBe(200);
    expect(domainMapServiceMock.assertLearningNodeInDomain).toHaveBeenCalledWith(
      "d1",
      "n1"
    );
    expect(tutorServiceMock.generateLearningNodePractice).toHaveBeenCalledWith(
      "n1",
      { userGoal: "use this in a new case" }
    );
  });

  it("returns 503 for AI configuration errors", async () => {
    tutorServiceMock.generateLearningNodePractice.mockRejectedValue(
      new AiConfigurationError("AI not configured")
    );

    const response = await POST(
      new Request("http://localhost/api/domains/d1/nodes/n1/practice", {
        method: "POST"
      }),
      params
    );

    expect(response.status).toBe(503);
    expect((await response.json()).error).toBe("AI not configured");
  });
});
