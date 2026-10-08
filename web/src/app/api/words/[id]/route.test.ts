import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, PATCH } from "./route";

const knowledgeServiceMock = vi.hoisted(() => ({
  getKnowledgeWord: vi.fn(),
  updateKnowledgeWord: vi.fn(),
  deleteKnowledgeWord: vi.fn(),
  KnowledgeWordError: class extends Error {
    constructor(
      message: string,
      public readonly code: string
    ) {
      super(message);
    }
  }
}));

vi.mock("../../../../lib/learning/knowledgeService", () => ({
  getKnowledgeWord: knowledgeServiceMock.getKnowledgeWord,
  updateKnowledgeWord: knowledgeServiceMock.updateKnowledgeWord,
  deleteKnowledgeWord: knowledgeServiceMock.deleteKnowledgeWord,
  KnowledgeWordError: knowledgeServiceMock.KnowledgeWordError
}));

describe("word detail API", () => {
  const params = { params: Promise.resolve({ id: "word-1" }) };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns 400 when GET is missing canvasId", async () => {
    const response = await GET(
      new Request("http://localhost/api/words/word-1"),
      params
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe(
      "canvasId \u4e0d\u80fd\u4e3a\u7a7a\u3002"
    );
  });

  it("returns word details from GET", async () => {
    knowledgeServiceMock.getKnowledgeWord.mockResolvedValue({
      id: "word-1",
      text: "derive"
    });

    const response = await GET(
      new Request("http://localhost/api/words/word-1?canvasId=c1"),
      params
    );

    expect(response.status).toBe(200);
    expect((await response.json()).word.text).toBe("derive");
  });

  it("uses knowledge service in PATCH", async () => {
    knowledgeServiceMock.updateKnowledgeWord.mockResolvedValue({
      id: "word-1",
      text: "derive"
    });

    const response = await PATCH(
      new Request("http://localhost/api/words/word-1?canvasId=c1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word: "derive" })
      }),
      params
    );

    expect(response.status).toBe(200);
    expect(knowledgeServiceMock.updateKnowledgeWord).toHaveBeenCalledWith(
      "word-1",
      "c1",
      { word: "derive" }
    );
  });

  it.each(["can_apply", "can_transfer", "integrated"])(
    "rejects direct high-mastery updates through the compatibility API: %s",
    async (masteryStatus) => {
      knowledgeServiceMock.updateKnowledgeWord.mockRejectedValue(
        new knowledgeServiceMock.KnowledgeWordError(
          "兼容接口不能直接写入高阶掌握状态；请通过后续 Mastery Evidence 流程升级。",
          "forbidden_mastery_status"
        )
      );
      const response = await PATCH(
        new Request("http://localhost/api/words/word-1?canvasId=c1", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ word: "derive", masteryStatus })
        }),
        params
      );

      expect(response.status).toBe(400);
      expect((await response.json()).error).toContain("高阶掌握状态");
      expect(knowledgeServiceMock.updateKnowledgeWord).toHaveBeenCalledWith(
        "word-1",
        "c1",
        { word: "derive", masteryStatus }
      );
    }
  );

  it("maps not found errors from PATCH to 404", async () => {
    knowledgeServiceMock.updateKnowledgeWord.mockRejectedValue(
      new knowledgeServiceMock.KnowledgeWordError(
        "\u672a\u627e\u5230\u8be5\u77e5\u8bc6\u70b9\u3002",
        "not_found"
      )
    );

    const response = await PATCH(
      new Request("http://localhost/api/words/word-1?canvasId=c1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word: "derive" })
      }),
      params
    );

    expect(response.status).toBe(404);
    expect((await response.json()).error).toBe(
      "\u672a\u627e\u5230\u8be5\u77e5\u8bc6\u70b9\u3002"
    );
  });

  it("deletes the word through the shared service", async () => {
    knowledgeServiceMock.deleteKnowledgeWord.mockResolvedValue(undefined);

    const response = await DELETE(
      new Request("http://localhost/api/words/word-1?canvasId=c1", {
        method: "DELETE"
      }),
      params
    );

    expect(response.status).toBe(200);
    expect(knowledgeServiceMock.deleteKnowledgeWord).toHaveBeenCalledWith(
      "word-1",
      "c1"
    );
  });
});
