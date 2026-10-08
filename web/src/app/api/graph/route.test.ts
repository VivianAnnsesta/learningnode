import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const graphServiceMock = vi.hoisted(() => ({
  getLegacyCanvasGraphPayload: vi.fn()
}));

vi.mock("../../../lib/learning/knowledgeGraphService", () => ({
  getLegacyCanvasGraphPayload: graphServiceMock.getLegacyCanvasGraphPayload
}));

describe("graph API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when canvasId is missing", async () => {
    const response = await GET(new Request("http://localhost/api/graph"));

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(
      "canvasId \u4e0d\u80fd\u4e3a\u7a7a\u3002"
    );
  });

  it("delegates graph loading to the shared compatibility adapter", async () => {
    graphServiceMock.getLegacyCanvasGraphPayload.mockResolvedValue({
      words: [{ id: "w1" }],
      relations: [{ id: "r1" }],
      portalTargets: []
    });

    const response = await GET(
      new Request("http://localhost/api/graph?canvasId=c1")
    );

    expect(response.status).toBe(200);
    expect(graphServiceMock.getLegacyCanvasGraphPayload).toHaveBeenCalledWith("c1");
    expect(await response.json()).toEqual({
      words: [{ id: "w1" }],
      relations: [{ id: "r1" }],
      portalTargets: []
    });
  });
});
