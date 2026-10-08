import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

const domainServiceMock = vi.hoisted(() => ({
  listLearningDomains: vi.fn(),
  createLearningDomain: vi.fn()
}));

vi.mock("../../../lib/learning/domainService", () => ({
  listLearningDomains: domainServiceMock.listLearningDomains,
  createLearningDomain: domainServiceMock.createLearningDomain
}));

describe("canvas compatibility API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delegates GET to domainService", async () => {
    domainServiceMock.listLearningDomains.mockResolvedValue([{ id: "c1" }]);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(domainServiceMock.listLearningDomains).toHaveBeenCalledTimes(1);
    expect((await response.json()).canvases[0].id).toBe("c1");
  });

  it("returns 400 when POST name is missing", async () => {
    const response = await POST(
      new Request("http://localhost/api/canvas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      })
    );

    expect(response.status).toBe(400);
  });

  it("delegates POST to domainService", async () => {
    domainServiceMock.createLearningDomain.mockResolvedValue({ id: "c1" });

    const response = await POST(
      new Request("http://localhost/api/canvas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Canvas 1" })
      })
    );

    expect(response.status).toBe(200);
    expect(domainServiceMock.createLearningDomain).toHaveBeenCalledWith({
      name: "Canvas 1"
    });
    expect((await response.json()).canvas.id).toBe("c1");
  });
});
