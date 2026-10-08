import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

const diagnosticServiceMock = vi.hoisted(() => ({
  listDiagnosticSessions: vi.fn(),
  createDiagnosticSession: vi.fn()
}));

vi.mock("../../../../../lib/learning/diagnosticService", () => ({
  listDiagnosticSessions: diagnosticServiceMock.listDiagnosticSessions,
  createDiagnosticSession: diagnosticServiceMock.createDiagnosticSession
}));

const params = { params: Promise.resolve({ id: "d1" }) };

const createRequest = (body: BodyInit) =>
  new Request("http://localhost/api/domains/d1/diagnostics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body
  });

describe("domain diagnostics API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns sessions from GET", async () => {
    diagnosticServiceMock.listDiagnosticSessions.mockResolvedValue([
      { id: "s1", title: "Session 1" }
    ]);

    const response = await GET(
      new Request("http://localhost/api/domains/d1/diagnostics"),
      params
    );

    expect(response.status).toBe(200);
    expect((await response.json()).sessions[0].id).toBe("s1");
  });

  it("returns 400 when POST JSON is invalid", async () => {
    const response = await POST(createRequest("{"), params);

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("请求体不是合法的 JSON。");
  });

  it("creates a session from POST", async () => {
    diagnosticServiceMock.createDiagnosticSession.mockResolvedValue({
      id: "s1",
      title: "Session 1"
    });

    const response = await POST(
      createRequest(JSON.stringify({ title: "Session 1", questions: [] })),
      params
    );

    expect(response.status).toBe(200);
    expect((await response.json()).session.id).toBe("s1");
    expect(diagnosticServiceMock.createDiagnosticSession).toHaveBeenCalledWith(
      "d1",
      { title: "Session 1", questions: [] }
    );
  });
});
