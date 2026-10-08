import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";

const knowledgeServiceMock = vi.hoisted(() => ({
  searchKnowledgeWords: vi.fn(),
  upsertKnowledgeWord: vi.fn(),
  KnowledgeWordError: class extends Error {
    constructor(
      message: string,
      public readonly code: string
    ) {
      super(message);
    }
  }
}));

vi.mock("../../../lib/learning/knowledgeService", () => ({
  searchKnowledgeWords: knowledgeServiceMock.searchKnowledgeWords,
  upsertKnowledgeWord: knowledgeServiceMock.upsertKnowledgeWord,
  KnowledgeWordError: knowledgeServiceMock.KnowledgeWordError
}));

const createRequest = (body: unknown) =>
  new Request("http://localhost/api/words", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

describe("words API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when word is missing", async () => {
    knowledgeServiceMock.upsertKnowledgeWord.mockRejectedValue(
      new knowledgeServiceMock.KnowledgeWordError(
        "word 不能为空",
        "missing_word"
      )
    );

    const response = await POST(createRequest({}));
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("word 不能为空");
  });

  it("delegates GET to the shared search service", async () => {
    knowledgeServiceMock.searchKnowledgeWords.mockResolvedValue([{ id: "w1" }]);

    const response = await GET(
      new Request("http://localhost/api/words?canvasId=c1&query=derive")
    );

    expect(response.status).toBe(200);
    expect(knowledgeServiceMock.searchKnowledgeWords).toHaveBeenCalledWith({
      query: "derive",
      canvasId: "c1"
    });
  });

  it("creates a word through the shared upsert service", async () => {
    knowledgeServiceMock.upsertKnowledgeWord.mockResolvedValue({ id: "w1" });

    const response = await POST(
      createRequest({ word: "derive", coreEssence: "", canvasId: "c1" })
    );

    expect(response.status).toBe(200);
    expect(knowledgeServiceMock.upsertKnowledgeWord).toHaveBeenCalledWith({
      word: "derive",
      coreEssence: "",
      canvasId: "c1"
    });
  });

  it.each(["can_apply", "can_transfer", "integrated"])(
    "rejects direct high-mastery creation through the compatibility API: %s",
    async (masteryStatus) => {
      knowledgeServiceMock.upsertKnowledgeWord.mockRejectedValue(
        new knowledgeServiceMock.KnowledgeWordError(
          "兼容接口不能直接写入高阶掌握状态；请通过后续 Mastery Evidence 流程升级。",
          "forbidden_mastery_status"
        )
      );
      const response = await POST(
        createRequest({ word: "derive", canvasId: "c1", masteryStatus })
      );

      expect(response.status).toBe(400);
      expect((await response.json()).error).toContain("高阶掌握状态");
      expect(knowledgeServiceMock.upsertKnowledgeWord).toHaveBeenCalledWith({
        word: "derive",
        canvasId: "c1",
        masteryStatus
      });
    }
  );

  it("returns 400 when canvasId is missing for search", async () => {
    knowledgeServiceMock.searchKnowledgeWords.mockRejectedValue(
      new knowledgeServiceMock.KnowledgeWordError(
        "canvasId 不能为空",
        "missing_canvas"
      )
    );

    const response = await GET(new Request("http://localhost/api/words?query=derive"));
    expect(response.status).toBe(400);
  });

  it("returns 500 when the shared service throws an unknown error", async () => {
    knowledgeServiceMock.upsertKnowledgeWord.mockRejectedValue(new Error("db down"));
    const response = await POST(createRequest({ word: "error", canvasId: "c1" }));
    expect(response.status).toBe(500);
    expect((await response.json()).error).toBe("db down");
  });
});
