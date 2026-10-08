import { describe, it, expect } from "vitest";
import {
  tokenize,
  scoreSourceRelevance,
  buildSourceRelevanceQuery,
  LOW_RELEVANCE_THRESHOLD
} from "./sourceRelevanceService";

describe("tokenize", () => {
  it("splits English into lowercased word tokens", () => {
    expect(tokenize("Linear Algebra")).toEqual(["linear", "algebra"]);
  });

  it("splits Chinese into character bigrams", () => {
    expect(tokenize("线性代数")).toEqual(["线性", "性代", "代数"]);
  });

  it("mixes Chinese bigrams and English word tokens", () => {
    const tokens = tokenize("线性代数 linear algebra");
    expect(tokens).toContain("线性");
    expect(tokens).toContain("性代");
    expect(tokens).toContain("代数");
    expect(tokens).toContain("linear");
    expect(tokens).toContain("algebra");
  });

  it("drops stopwords, pure numbers, and sub-2-char words", () => {
    expect(tokenize("a the on 2024 of")).toEqual([]);
  });
});

describe("scoreSourceRelevance", () => {
  it("returns null when the source text is empty", () => {
    expect(scoreSourceRelevance("线性代数", "")).toBeNull();
    expect(scoreSourceRelevance("线性代数", "   ")).toBeNull();
  });

  it("scores a clearly related Chinese source above the threshold", () => {
    const result = scoreSourceRelevance(
      "线性代数 线性代数 线性代数",
      "线性代数 课程大纲 与 习题 解析"
    );
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThan(LOW_RELEVANCE_THRESHOLD);
    expect(result!.lowRelevance).toBe(false);
    expect(result!.score).toBeGreaterThanOrEqual(0);
    expect(result!.score).toBeLessThanOrEqual(1);
  });

  it("flags a clearly unrelated Chinese source as low relevance", () => {
    const result = scoreSourceRelevance(
      "线性代数 线性代数 线性代数",
      "足球比赛规则与战术介绍"
    );
    expect(result).not.toBeNull();
    expect(result!.score).toBe(0);
    expect(result!.lowRelevance).toBe(true);
  });

  it("scores an English query against an English source", () => {
    const query = buildSourceRelevanceQuery({ name: "Linear Algebra" });
    const result = scoreSourceRelevance(query, "Linear algebra course syllabus");
    expect(result).not.toBeNull();
    expect(result!.score).toBeGreaterThan(LOW_RELEVANCE_THRESHOLD);
    expect(result!.lowRelevance).toBe(false);
  });

  it("is deterministic for identical inputs", () => {
    const query = buildSourceRelevanceQuery({ name: "微积分", scope: "导数" });
    const source = "微积分 导数 极限 概念 讲解";
    const first = scoreSourceRelevance(query, source);
    const second = scoreSourceRelevance(query, source);
    expect(first).toEqual(second);
  });

  it("documents the cross-language limitation: CJK-only query vs English-only source scores zero", () => {
    const result = scoreSourceRelevance(
      "线性代数 线性代数 线性代数",
      "Algebra basics course"
    );
    expect(result).not.toBeNull();
    expect(result!.lowRelevance).toBe(true);
  });
});

describe("buildSourceRelevanceQuery", () => {
  it("repeats the domain name three times as the strongest signal", () => {
    const query = buildSourceRelevanceQuery({ name: "线性代数" });
    expect(query.split(" ").filter((part) => part === "线性代数")).toHaveLength(3);
  });

  it("appends scope and goal when present", () => {
    const query = buildSourceRelevanceQuery({
      name: "微积分",
      scope: "导数与积分",
      goal: "考试复习"
    });
    expect(query).toContain("导数与积分");
    expect(query).toContain("考试复习");
    expect(query.split(" ").filter((part) => part === "微积分")).toHaveLength(3);
  });

  it("ignores empty fields", () => {
    expect(buildSourceRelevanceQuery({ name: "" })).toBe("");
    expect(buildSourceRelevanceQuery({ name: "  " })).toBe("");
  });
});
