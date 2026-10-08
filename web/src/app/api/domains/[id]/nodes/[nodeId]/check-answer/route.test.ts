import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const tutorServiceMock = vi.hoisted(() => ({
  evaluateLearningNodeAnswer: vi.fn()
}));
const domainMapServiceMock = vi.hoisted(() => ({
  assertLearningNodeInDomain: vi.fn()
}));

vi.mock("../../../../../../../lib/ai/tutorService", () => ({
  evaluateLearningNodeAnswer: tutorServiceMock.evaluateLearningNodeAnswer
}));
vi.mock("../../../../../../../lib/learning/domainMapService", () => ({
  assertLearningNodeInDomain: domainMapServiceMock.assertLearningNodeInDomain
}));

describe("domain node check-answer API", () => {
  const params = { params: Promise.resolve({ id: "d1", nodeId: "item-1" }) };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retires self-explanation review without making an AI call", async () => {
    tutorServiceMock.evaluateLearningNodeAnswer.mockResolvedValue({
      score: 0.82,
      feedback: "已经抓住核心"
    });

    const response = await POST(
      new Request("http://localhost/api/domains/d1/nodes/item-1/check-answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userUnderstanding: "我理解它的定义和用法",
          coreEssence: "把多个概念压缩成一句话"
        })
      }),
      params
    );

    expect(response.status).toBe(410);
    expect(domainMapServiceMock.assertLearningNodeInDomain).toHaveBeenCalledWith(
      "d1",
      "item-1"
    );
    expect(tutorServiceMock.evaluateLearningNodeAnswer).not.toHaveBeenCalled();
    expect((await response.json()).code).toBe("SELF_EXPLANATION_REVIEW_REMOVED");
  });

  it("still rejects a node belonging to another domain", async () => {
    domainMapServiceMock.assertLearningNodeInDomain.mockRejectedValue(new Error("学习节点不属于当前领域。"));

    const response = await POST(
      new Request("http://localhost/api/domains/d1/nodes/item-1/check-answer", {
        method: "POST"
      }),
      params
    );

    expect(response.status).toBe(404);
    expect(tutorServiceMock.evaluateLearningNodeAnswer).not.toHaveBeenCalled();
  });
});
