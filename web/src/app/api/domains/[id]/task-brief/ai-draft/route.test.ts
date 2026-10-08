import { beforeEach, describe, expect, it, vi } from "vitest";
import { AiConfigurationError } from "../../../../../../lib/ai/provider";
import { POST } from "./route";

const tutorServiceMock = vi.hoisted(() => ({
  generateTaskBriefDraft: vi.fn()
}));

vi.mock("../../../../../../lib/ai/tutorService", () => ({
  generateTaskBriefDraft: tutorServiceMock.generateTaskBriefDraft
}));

describe("domain task brief ai draft API", () => {
  const params = { params: Promise.resolve({ id: "d1" }) };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns generated task brief draft", async () => {
    tutorServiceMock.generateTaskBriefDraft.mockResolvedValue({
      draft: {
        taskBrief: "学习目标：建立整体框架",
        summary: "先建立框架，再进入路线图。",
        successCriteria: ["能复述目标"],
        risks: ["避免范围失控"]
      }
    });

    const response = await POST(
      new Request("http://localhost/api/domains/d1/task-brief/ai-draft", {
        method: "POST"
      }),
      params
    );

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.draft.summary).toBe("先建立框架，再进入路线图。");
    expect(tutorServiceMock.generateTaskBriefDraft).toHaveBeenCalledWith("d1");
  });

  it("returns 503 for AI configuration errors", async () => {
    tutorServiceMock.generateTaskBriefDraft.mockRejectedValue(
      new AiConfigurationError("AI not configured")
    );

    const response = await POST(
      new Request("http://localhost/api/domains/d1/task-brief/ai-draft", {
        method: "POST"
      }),
      params
    );

    expect(response.status).toBe(503);
    expect((await response.json()).error).toBe("AI not configured");
  });
});
