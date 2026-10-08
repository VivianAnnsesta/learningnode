import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, PATCH } from "./route";

const domainServiceMock = vi.hoisted(() => ({
  deleteLearningDomain: vi.fn(),
  getLearningDomain: vi.fn(),
  updateLearningDomain: vi.fn()
}));

const domainMapServiceMock = vi.hoisted(() => ({
  getDomainMap: vi.fn()
}));

vi.mock("../../../../lib/learning/domainService", () => ({
  deleteLearningDomain: domainServiceMock.deleteLearningDomain,
  getLearningDomain: domainServiceMock.getLearningDomain,
  updateLearningDomain: domainServiceMock.updateLearningDomain
}));

vi.mock("../../../../lib/learning/domainMapService", () => ({
  getDomainMap: domainMapServiceMock.getDomainMap
}));

const params = { params: Promise.resolve({ id: "d1" }) };

const createPatchRequest = (body: BodyInit) =>
  new Request("http://localhost/api/domains/d1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body
  });

describe("domain detail API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns domain and map summary from GET", async () => {
    domainServiceMock.getLearningDomain.mockResolvedValue({
      id: "d1",
      name: "English"
    });
    domainMapServiceMock.getDomainMap.mockResolvedValue({
      progress: { percent: 20 }
    });

    const response = await GET(
      new Request("http://localhost/api/domains/d1"),
      params
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      domain: { id: "d1" },
      mapSummary: { percent: 20 }
    });
  });

  it("updates domain from PATCH", async () => {
    domainServiceMock.updateLearningDomain.mockResolvedValue({
      id: "d1",
      name: "Updated"
    });

    const response = await PATCH(
      createPatchRequest(JSON.stringify({ name: "Updated" })),
      params
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      domain: { name: "Updated" }
    });
    expect(domainServiceMock.updateLearningDomain).toHaveBeenCalledWith("d1", {
      name: "Updated"
    });
  });

  it("deletes domain from DELETE", async () => {
    domainServiceMock.deleteLearningDomain.mockResolvedValue(undefined);

    const response = await DELETE(
      new Request("http://localhost/api/domains/d1", { method: "DELETE" }),
      params
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(domainServiceMock.deleteLearningDomain).toHaveBeenCalledWith("d1");
  });
});
