import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

const tutorServiceMock = vi.hoisted(() => ({
  generateCourseDesignDraft: vi.fn(),
  repairCourseDesignDraft: vi.fn()
}));

vi.mock("../../../../../../lib/ai/tutorService", () => tutorServiceMock);

describe("course design AI draft route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generates and automatically repairs through the default mode", async () => {
    tutorServiceMock.generateCourseDesignDraft.mockResolvedValue({
      source: "ai",
      repair: { attempted: true, attempts: 1, succeeded: true }
    });

    const response = await POST(
      new Request("http://localhost/api/domains/domain-1/course-design/ai-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback: "Prefer official sources." })
      }),
      { params: Promise.resolve({ id: "domain-1" }) }
    );

    expect(response.status).toBe(200);
    expect(tutorServiceMock.generateCourseDesignDraft).toHaveBeenCalledWith(
      "domain-1",
      { feedback: "Prefer official sources." }
    );
    expect(tutorServiceMock.repairCourseDesignDraft).not.toHaveBeenCalled();
  });

  it("retries the persisted incomplete draft in repair mode", async () => {
    tutorServiceMock.repairCourseDesignDraft.mockResolvedValue({
      source: "ai",
      repair: { attempted: true, attempts: 1, succeeded: true }
    });

    const response = await POST(
      new Request("http://localhost/api/domains/domain-1/course-design/ai-draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "repair" })
      }),
      { params: Promise.resolve({ id: "domain-1" }) }
    );

    expect(response.status).toBe(200);
    expect(tutorServiceMock.repairCourseDesignDraft).toHaveBeenCalledWith(
      "domain-1"
    );
    expect(tutorServiceMock.generateCourseDesignDraft).not.toHaveBeenCalled();
  });
});
