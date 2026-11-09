import { describe, expect, it } from "vitest";
import { recordAliasesInput, recordAliasSummary } from "./recordDiscoveryTypes";

describe("personal-record alias form input", () => {
  it("trims one name per line and removes blank lines without splitting commas", () => {
    expect(recordAliasesInput("  CP \r\n\r\n条件概率\r conditional probability\nA, B  "))
      .toEqual(["CP", "条件概率", "conditional probability", "A, B"]);
    expect(recordAliasesInput(" \n\r\n ")).toEqual([]);
  });
  it("leaves normalization and duplicate handling to the server", () => {
    expect(recordAliasesInput("CP\nＣＰ\ncp")).toEqual(["CP", "ＣＰ", "cp"]);
  });
  it("enforces the API count and UTF-16 length limits", () => {
    expect(() => recordAliasesInput(Array.from({ length: 21 }, (_, index) => `a${index}`).join("\n"))).toThrow("20");
    expect(recordAliasesInput("😀".repeat(40))[0].length).toBe(80);
    expect(() => recordAliasesInput("😀".repeat(41))).toThrow("80");
    expect(() => recordAliasesInput("a\tb")).toThrow("控制字符");
    expect(() => recordAliasesInput("a\u0080b")).toThrow("控制字符");
    expect(() => recordAliasesInput("a\ud800b")).toThrow("Unicode");
  });
  it("shows the server's matched aliases without rerunning a client matcher", () => {
    expect(recordAliasSummary({ aliases: ["CP", "条件概率"], matchedAliases: ["CP"] })).toBe("匹配别名：CP");
    expect(recordAliasSummary({ aliases: ["CP"], matchedAliases: [] })).toBe("别名：CP");
    expect(recordAliasSummary({})).toBeNull();
  });
});
