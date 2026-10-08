import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const diagnosticServiceMock = vi.hoisted(() => ({
  saveDiagnosticAnswer: vi.fn()
}));

vi.mock("../../../../../lib/learning/diagnosticService", () => ({
  saveDiagnosticAnswer: diagnosticServiceMock.saveDiagnosticAnswer
}));

const params = { params: Promise.resolve({ id: "q1" }) };

const createRequest = (body: BodyInit) =>
  new Request("http://localhost/api/diagnostic-questions/q1/answers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body
  });

describe("semantic diagnostic answer API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when POST JSON is invalid", async () => {
    const response = await POST(createRequest("{"), params);

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("请求体不是合法的 JSON。");
  });

  it("saves an answer from POST", async () => {
    diagnosticServiceMock.saveDiagnosticAnswer.mockResolvedValue({
      id: "a1",
      response: "answer"
    });

    const response = await POST(
      createRequest(JSON.stringify({ response: "answer" })),
      params
    );

    expect(response.status).toBe(200);
    expect((await response.json()).answer.id).toBe("a1");
  });
});
