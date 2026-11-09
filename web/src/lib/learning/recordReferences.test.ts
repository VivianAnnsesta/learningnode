import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isRecordReferenceSnapshot, paragraphSelector, paragraphSelectorInput, recordReferenceKey, recordReferenceQuote, referenceParagraphs, verifyParagraphSelector } from "./recordReferences";

describe("固定修订段落的原文选择", () => {
  it("保留CRLF/CR/LF、段内换行、缩进及尾部空格，不让空白分隔行进入选区", () => {
    const body = "\r\n  第一行  \r\n第二行\r\n \t\r\n重复\r\r重复\n\n末段  \n";
    const paragraphs = referenceParagraphs(body);
    expect(paragraphs.map(part => part.quote)).toEqual(["  第一行  \r\n第二行", "重复", "重复", "末段  "]);
    expect(paragraphs.every(part => body.slice(part.start, part.end) === part.quote)).toBe(true);
    expect(paragraphs[1].start).not.toBe(paragraphs[2].start);
    expect(referenceParagraphs(" \r\n\t\n")).toEqual([]);
  });

  it("长段不拆分，独立Node哈希与浏览器共享哈希一致", async () => {
    const body = `😀条件\r\n${"同一段中的解释 ".repeat(1000)}\n\n下一段`;
    const [first] = referenceParagraphs(body);
    const selection = await paragraphSelector(body, first.start, first.end);
    expect(selection.quoteHash).toBe(createHash("sha256").update(first.quote, "utf8").digest("hex"));
    expect(await verifyParagraphSelector(body, { ...selection, quote: "伪造原文" })).toEqual({ ...selection, quote: first.quote });
    expect(paragraphSelectorInput({ ...selection, quote: first.quote } as typeof selection)).not.toHaveProperty("quote");
  });

  it("同修订不同位置和全文身份各自保留，同文不同位置仍是不同引用", async () => {
    const body = "相同\n\n相同", parts = referenceParagraphs(body);
    const a = await paragraphSelector(body, parts[0].start, parts[0].end);
    const b = await paragraphSelector(body, parts[1].start, parts[1].end);
    expect(a.quoteHash).toBe(b.quoteHash);
    const base = { knowledgePointId: "p", revisionId: "r" };
    expect(new Set([recordReferenceKey(base), recordReferenceKey({ ...base, selector: a }), recordReferenceKey({ ...base, selector: b })]).size).toBe(3);
    expect(recordReferenceKey({ ...base, selector: a })).toBe(recordReferenceKey({ ...base, selector: { ...a } }));
    expect(recordReferenceKey({ ...base, revisionId: "r2", selector: a })).not.toBe(recordReferenceKey({ ...base, selector: a }));
  });

  it("错误哈希、局部句子、跨段选区和emoji中间偏移全部拒绝", async () => {
    const body = "😀第一段\n\n第二段", [first] = referenceParagraphs(body);
    const selection = await paragraphSelector(body, first.start, first.end);
    await expect(verifyParagraphSelector(body, { ...selection, quoteHash: "0".repeat(64) })).rejects.toThrow("校验不匹配");
    await expect(paragraphSelector(body, 1, first.end)).rejects.toThrow("Unicode");
    await expect(paragraphSelector(body, 0, 1)).rejects.toThrow("Unicode");
    await expect(paragraphSelector(body, 2, first.end)).rejects.toThrow("完整段落");
    await expect(paragraphSelector(body, 0, body.length)).rejects.toThrow("完整段落");
  });

  it.each([null, {}, { type: "future" }, { type: "paragraph-v1", start: "0", end: 2, quoteHash: "a".repeat(64) }, { type: "paragraph-v1", start: -1, end: 2, quoteHash: "a".repeat(64) }, { type: "paragraph-v1", start: 0, end: 2.5, quoteHash: "a".repeat(64) }, { type: "paragraph-v1", start: 0, end: 2, quoteHash: `${"a".repeat(64)}\n` }, { type: "paragraph-v1", start: 0, end: 2, quoteHash: "A".repeat(64) }])("不把非法选择器%j降为全文", async input => {
    await expect(verifyParagraphSelector("原文", input)).rejects.toThrow("选择器");
  });

  it("读模型保持旧全文兼容，已知片段只展示固定quote，未知选择器不降级", async () => {
    const full = { kind: "record", knowledgePointId: "p", revisionId: "r", title: "原文", body: "第一段\n\n第二段", sourceType: "user" } as const;
    const selection = await verifyParagraphSelector(full.body, await paragraphSelector(full.body, 0, 3));
    expect(isRecordReferenceSnapshot(full)).toBe(true);
    expect(recordReferenceQuote(full)).toBe(full.body);
    const selected = { ...full, selector: selection };
    expect(isRecordReferenceSnapshot(selected)).toBe(true);
    expect(recordReferenceQuote(selected)).toBe("第一段");
    expect(isRecordReferenceSnapshot({ ...full, selector: null })).toBe(false);
    expect(isRecordReferenceSnapshot({ ...full, selector: { ...selection, type: "unknown" } })).toBe(false);
  });
});
