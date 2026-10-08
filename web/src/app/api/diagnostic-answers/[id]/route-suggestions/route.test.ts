import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const routeSuggestionServiceMock = vi.hoisted(() => ({
  createRouteSuggestionsFromDiagnosticAnswer: vi.fn()
}));

vi.mock("../../../../../lib/learning/routeSuggestionService", () => ({
  createRouteSuggestionsFromDiagnosticAnswer:
    routeSuggestionServiceMock.createRouteSuggestionsFromDiagnosticAnswer
}));

describe("diagnostic answer route suggestions API", () => {
  const params = { params: Promise.resolve({ id: "answer-1" }) };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns suggestions generated from an evaluated diagnostic answer", async () => {
    routeSuggestionServiceMock.createRouteSuggestionsFromDiagnosticAnswer.mockResolvedValue([
      {
        id: "suggestion-1",
        level: "L2",
        title: "补救节点",
        changesMap: true,
        status: "candidate"
      }
    ]);

    const response = await POST(
      new Request(
        "http://localhost/api/diagnostic-answers/answer-1/route-suggestions",
        { method: "POST" }
      ),
      params
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      suggestions: [
        {
          id: "suggestion-1",
          level: "L2",
          title: "补救节点",
          changesMap: true,
          status: "candidate"
        }
      ]
    });
    expect(
      routeSuggestionServiceMock.createRouteSuggestionsFromDiagnosticAnswer
    ).toHaveBeenCalledWith("answer-1");
  });

  it("returns 400 when the diagnostic answer has not been evaluated", async () => {
    routeSuggestionServiceMock.createRouteSuggestionsFromDiagnosticAnswer.mockRejectedValue(
      new Error("Route suggestions require an evaluated diagnostic answer.")
    );

    const response = await POST(
      new Request(
        "http://localhost/api/diagnostic-answers/answer-1/route-suggestions",
        { method: "POST" }
      ),
      params
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(
      "Route suggestions require an evaluated diagnostic answer."
    );
  });
});
