import { describe, expect, it } from "vitest";
import { canUndoTemplateInsertion, planTemplateInsertion, textareaText } from "./recordTemplateInsertion";

describe("record template draft insertion", () => {
  it("maps textarea LF offsets to original CRLF and lone CR without rewriting text", () => {
    const body = "甲\r\n😀乙\r丙\n丁";
    const plan = planTemplateInsertion(body, "[插入]", { value: textareaText(body), start: 4, end: 4 });
    expect(plan.after).toBe("甲\r\n😀[插入]乙\r丙\n丁");
    expect(plan.offset).toBe(5); expect(plan.caret).toBe(8); expect(plan.position).toBe("caret");
  });
  it("keeps selected text and inserts after the selection", () => {
    const body = "前\r\n选中😀\r后";
    const plan = planTemplateInsertion(body, "新增\r\n", { value: textareaText(body), start: 2, end: 6 });
    expect(plan.after).toBe("前\r\n选中😀新增\r\n\r后");
    expect(plan.position).toBe("after_selection");
  });
  it("appends exactly the preview text when there is no cursor", () => {
    expect(planTemplateInsertion("原文", "{{unknown}}\n", null)).toMatchObject({ after: "原文{{unknown}}\n", position: "end", fallback: false });
  });
  it.each([
    { value: "different", start: 0, end: 0 },
    { value: "😀原文", start: 1, end: 1 },
    { value: "😀原文", start: -1, end: 0 },
    { value: "😀原文", start: 0, end: 50 },
    { value: "😀原文", start: 3, end: 2 },
    { value: "😀原文", start: 0.5, end: 2 }
  ])("requires a visible end-position fallback for invalid selection %j", selection => {
    expect(planTemplateInsertion("😀原文", "追加", selection)).toMatchObject({ after: "😀原文追加", position: "end", fallback: true });
  });
  it("does not add separators, trim, or truncate either original or insertion", () => {
    expect(planTemplateInsertion("  原文\r\n", "\t新文\r", null).after).toBe("  原文\r\n\t新文\r");
    expect(() => planTemplateInsertion("a".repeat(24000), "x", null)).toThrow("超过24000");
    expect(() => planTemplateInsertion("", " \r\n", null)).toThrow("为空");
  });
  it("allows undo only for the exact body epoch and save base", () => {
    const undo = { baseKey: "record:r1", epoch: 3, before: "原文", after: "原文模板", caret: 2 };
    expect(canUndoTemplateInsertion(undo, { baseKey: "record:r1", epoch: 3, body: "原文模板" })).toBe(true);
    expect(canUndoTemplateInsertion(undo, { baseKey: "record:r2", epoch: 3, body: "原文模板" })).toBe(false);
    expect(canUndoTemplateInsertion(undo, { baseKey: "record:r1", epoch: 4, body: "原文模板" })).toBe(false);
    expect(canUndoTemplateInsertion(undo, { baseKey: "record:r1", epoch: 3, body: "后来文字" })).toBe(false);
    expect(canUndoTemplateInsertion(null, { baseKey: "record:r1", epoch: 3, body: "原文模板" })).toBe(false);
  });
});
