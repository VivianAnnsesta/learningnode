import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const routeSuggestionServiceMock = vi.hoisted(() => ({
  acceptRouteSuggestion: vi.fn()
}));

vi.mock("../../../../../lib/learning/routeSuggestionService", () => ({
  acceptRouteSuggestion: routeSuggestionServiceMock.acceptRouteSuggestion
}));

describe("route suggestion accept API", () => {
  const params = { params: Promise.resolve({ id: "suggestion-1" }) };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes confirmation reason to the service", async () => {
    routeSuggestionServiceMock.acceptRouteSuggestion.mockResolvedValue({
      applied: true
    });

    const response = await POST(
      new Request("http://localhost/api/route-suggestions/suggestion-1/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          confirmationReason: "诊断显示该节点需要补救。"
        })
      }),
      params
    );

    expect(response.status).toBe(200);
    expect(routeSuggestionServiceMock.acceptRouteSuggestion).toHaveBeenCalledWith(
      "suggestion-1",
      { confirmationReason: "诊断显示该节点需要补救。" }
    );
  });

  it("maps missing confirmation reason errors to 400", async () => {
    routeSuggestionServiceMock.acceptRouteSuggestion.mockRejectedValue(
      new Error("Map-changing route suggestions require a confirmation reason.")
    );

    const response = await POST(
      new Request("http://localhost/api/route-suggestions/suggestion-1/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      }),
      params
    );

    expect(response.status).toBe(400);
  });
});
