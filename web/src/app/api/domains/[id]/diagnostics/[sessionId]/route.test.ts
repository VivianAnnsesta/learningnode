import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const diagnosticServiceMock = vi.hoisted(() => ({
  getDiagnosticSession: vi.fn()
}));

vi.mock("../../../../../../lib/learning/diagnosticService", () => ({
  getDiagnosticSession: diagnosticServiceMock.getDiagnosticSession
}));

describe("semantic diagnostic session detail API", () => {
  const params = { params: Promise.resolve({ id: "d1", sessionId: "s1" }) };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the session when found", async () => {
    diagnosticServiceMock.getDiagnosticSession.mockResolvedValue({
      id: "s1",
      title: "Session 1"
    });

    const response = await GET(
      new Request("http://localhost/api/domains/d1/diagnostics/s1"),
      params
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      session: { id: "s1", title: "Session 1" }
    });
  });

  it("returns 404 when the session does not exist", async () => {
    diagnosticServiceMock.getDiagnosticSession.mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/domains/d1/diagnostics/s1"),
      params
    );

    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe("未找到诊断会话。");
  });
});
