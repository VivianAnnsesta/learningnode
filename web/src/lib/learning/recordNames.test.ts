import { describe, expect, it } from "vitest";
import { compareRecordIds, compareRecordTitles, matchRecordSearch, normalizeRecordName, readRecordAliases, recordAliases, recordMention, recordNames } from "./recordNames";

describe("revision-owned record names", () => {
  it("preserves display names and deduplicates compatibility/case forms", () => {
    expect(recordAliases([" ＡＩ ", "ai", "Café", "Cafe\u0301", "人工智能"])).toEqual(["ＡＩ", "Café", "人工智能"]);
    expect(recordAliases(undefined)).toEqual([]);
    expect(recordAliases([])).toEqual([]);
  });
  it.each([null, "AI", [1], [" "], ["a\nb"], ["a\0b"], ["\ud800"], ["x".repeat(81)], Array(21).fill("same")])("rejects invalid alias input %#", value => {
    expect(() => recordAliases(value)).toThrow();
  });
  it("reads malformed historical metadata without making it a name", () => {
    for (const value of [null, "broken", '{}', '["AI",1]', 'null']) expect(readRecordAliases(value)).toEqual([]);
    expect(readRecordAliases('[" AI ","ai"]')).toEqual(["AI"]);
  });
  it("normalizes literal title, body and alias searches without LIKE wildcards", () => {
    const record = { title: "当前标题", body: "Café 的想法", aliases: ["A_B%", "ＡＩ"] };
    expect(matchRecordSearch(record, "Cafe\u0301").matches).toBe(true);
    expect(matchRecordSearch(record, "ai")).toEqual({ matches: true, matchedAliases: ["ＡＩ"] });
    expect(matchRecordSearch(record, "A_B%").matchedAliases).toEqual(["A_B%"]);
    expect(matchRecordSearch(record, "A%B").matches).toBe(false);
    expect(matchRecordSearch(record, "_").matchedAliases).toEqual(["A_B%"]);
    expect(matchRecordSearch({ ...record, aliases: [] }, "%").matches).toBe(false);
  });
  it("deduplicates target title/aliases while preserving the first display name", () => {
    expect(recordNames("AI", ["ＡＩ", "人工智能", "人工智能"])).toEqual(["AI", "人工智能"]);
    expect(normalizeRecordName("Cafe\u0301")).toBe("café");
  });
  it("finds whole western words and names embedded in East Asian sentences", () => {
    expect(recordMention("OpenAI, AIs, AI2, x_AI, BAI", ["AI"])).toBeNull();
    expect(recordMention("学习ＡＩ模型与人工智能。", ["AI", "人工智能"])?.matchedNames).toEqual(["AI", "人工智能"]);
    expect(recordMention("An AI model and R.", ["AI", "R"])?.matchedNames).toEqual(["AI", "R"]);
  });
  it("checks non-ASCII letters, combining marks and astral letters at boundaries", () => {
    expect(recordMention("éAI AIβ \u{10400}AI AI\u{10400}", ["AI"])).toBeNull();
    expect(recordMention("A\u0301I", ["AI"])).toBeNull();
    expect(recordMention("ＡＩ", ["AI"])?.matchedNames).toEqual(["AI"]);
  });
  it("returns exact original paragraph offsets after normalization changes length", () => {
    const body = "🙂 开头\r\n\r\n  Cafe\u0301 和ＡＩ  \r\n原文保留\r\n\r\n后文 AI";
    const found = recordMention(body, ["Café", "AI"])!;
    expect(found.matchedNames).toEqual(["Café", "AI"]);
    expect(found.context.quote).toBe("  Cafe\u0301 和ＡＩ  \r\n原文保留");
    expect(body.slice(found.context.start, found.context.end)).toBe(found.context.quote);
    expect(found.context.start).toBe(body.indexOf("  Cafe"));
  });
  it("collects names across paragraphs but counts repeated mentions once", () => {
    const found = recordMention("AI AI\n\n人工智能\n\nAI", ["AI", "ＡＩ", "人工智能"]);
    expect(found?.matchedNames).toEqual(["AI", "人工智能"]);
    expect(found?.context.quote).toBe("AI AI");
    expect(recordMention("anything", [])).toBeNull();
  });
  it("keeps punctuation literal and does not interpret name syntax", () => {
    expect(recordMention("C++ 与 A_B%", ["C++", "A_B%"])?.matchedNames).toEqual(["C++", "A_B%"]);
    expect(recordMention("<script>alert(1)</script>", ["<script>"])?.context.quote).toContain("<script>");
  });
  it("sorts as SQLite NOCASE rather than the system locale", () => {
    const values = ["é", "a", "A", "Z", "z", "Ａ", "🙂", "\ue000"];
    expect([...values].sort(compareRecordTitles)).toEqual(["a", "A", "Z", "z", "é", "\ue000", "Ａ", "🙂"]);
    expect(compareRecordTitles("a\0z", "a\0b")).toBe(0);
    expect(compareRecordTitles("a\0", "a\0b")).toBeLessThan(0);
  });
  it("uses case-sensitive UTF8 BINARY identity ties including NUL", () => {
    expect(["🙂", "\ue000", "a", "A"].sort(compareRecordIds)).toEqual(["A", "a", "\ue000", "🙂"]);
    expect(compareRecordIds("a\0z", "a\0b")).toBeGreaterThan(0);
  });
});
