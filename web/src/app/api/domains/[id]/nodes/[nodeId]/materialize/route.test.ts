import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const domainMapServiceMock = vi.hoisted(() => ({
  assertLearningNodeInDomain: vi.fn()
}));

vi.mock("../../../../../../../lib/learning/domainMapService", () => ({
  assertLearningNodeInDomain: domainMapServiceMock.assertLearningNodeInDomain
}));

describe("domain node materialize API", () => {
  const params = { params: Promise.resolve({ id: "d1", nodeId: "item-1" }) };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not materialize knowledge before the learner submits an understanding", async () => {
    const response = await POST(
      new Request("http://localhost/api/domains/d1/nodes/item-1/materialize", {
        method: "POST"
      }),
      params
    );

    expect(response.status).toBe(409);
    expect(domainMapServiceMock.assertLearningNodeInDomain).toHaveBeenCalledWith(
      "d1",
      "item-1"
    );
    expect((await response.json()).error).toContain("提交自己的理解");
  });

  it("returns 404 when the node does not belong to the URL domain", async () => {
    domainMapServiceMock.assertLearningNodeInDomain.mockRejectedValue(
      new Error("学习节点不属于该领域或不存在。")
    );

    const response = await POST(
      new Request("http://localhost/api/domains/d1/nodes/item-1/materialize", {
        method: "POST"
      }),
      params
    );

    expect(response.status).toBe(404);
    expect((await response.json()).error).toContain("不属于该领域");
  });
});
