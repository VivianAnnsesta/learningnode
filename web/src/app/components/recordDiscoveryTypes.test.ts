import { describe, expect, it } from "vitest";
import { paragraphSelector } from "../../lib/learning/recordReferences";
import { buildRecordClipPreview, makeRecordClipDraftSource, recordClipSnapshot } from "../../lib/learning/recordClipContracts";
import { isRecordSnapshot, recordReferenceKey, recordReferenceLabel, recordReferenceQuote, recordSourceInputs, type RecordSnapshot } from "./recordDiscoveryTypes";

const whole: RecordSnapshot = { kind: "record", knowledgePointId: "source", revisionId: "source-v1", title: "原始解释", body: "第一段。\n\n第二段。\n\n第一段。", sourceType: "user" };

describe("record-reference UI descriptors", () => {
  it("keeps old full-record references compact and unchanged", () => {
    expect(recordSourceInputs([whole], [])).toEqual([{ kind: "record", knowledgePointId: "source", revisionId: "source-v1" }]);
    expect(recordReferenceQuote(whole)).toBe(whole.body);
    expect(recordReferenceLabel(whole)).toBe("全文");
  });

  it("sends only range/hash identity for a new paragraph, never snapshot text", async () => {
    const selector = await paragraphSelector(whole.body, 0, 4);
    const paragraph = { ...whole, selector: { ...selector, quote: "第一段。" } };
    const [input] = recordSourceInputs([paragraph], []);
    expect(input).toEqual({ kind: "record", knowledgePointId: "source", revisionId: "source-v1", selector });
    expect(JSON.stringify(input)).not.toContain("第一段");
    expect(recordReferenceQuote(paragraph)).toBe("第一段。");
    expect(recordReferenceLabel(paragraph)).toBe("第1段");
  });

  it("retains existing full/paragraph/session snapshots by their original index", async () => {
    const selector = await paragraphSelector(whole.body, 6, 10);
    const paragraph = { ...whole, selector: { ...selector, quote: "第二段。" } };
    const session = { kind: "session", material: "旧正文".repeat(30000) };
    const saved = [whole, paragraph, session];
    expect(recordSourceInputs([paragraph, session, whole], saved)).toEqual([
      { kind: "retained", sourceIndex: 1 }, { kind: "retained", sourceIndex: 2 }, { kind: "retained", sourceIndex: 0 }
    ]);
  });

  it("keeps full references and identical text at different paragraph positions distinct", async () => {
    const first = { ...whole, selector: { ...await paragraphSelector(whole.body, 0, 4), quote: "第一段。" } };
    const repeated = { ...whole, selector: { ...await paragraphSelector(whole.body, 12, 16), quote: "第一段。" } };
    expect(new Set([whole, first, repeated].map(recordReferenceKey)).size).toBe(3);
    expect(recordSourceInputs([whole, first, repeated], [])).toHaveLength(3);
    expect(recordReferenceLabel(repeated)).toBe("第3段");
  });

  it.each([null, {}, { type: "unknown" }, { type: "paragraph-v1", start: 0, end: 4, quoteHash: "not-a-hash", quote: "第一段。" }])("does not reinterpret an invalid selector as a whole-record reference: %j", selector => {
    const invalid = { ...whole, selector };
    expect(isRecordSnapshot(invalid)).toBe(false);
    expect(() => recordSourceInputs([invalid], [])).toThrow("原始来源已变化");
  });
  it("sends new clips as receipt identities and retains historical clips without a receipt", async () => {
    const preview = await buildRecordClipPreview({ mode: "pasted", title: "本人提供", requestedUrl: "https://example.com/declared", finalUrl: null, capturedAt: "2026-11-09T10:00:00.000Z", expiresAt: "2026-11-09T10:15:00.000Z", extractionVersion: "pasted-text-v1", truncated: false, limitations: ["未抓取网页"], text: "段一😀\r\n\r\n段二", receiptId: "receipt_for_ui_input_test_1" });
    const ids = preview.fragments.map(fragment => fragment.id);
    const draft = makeRecordClipDraftSource(preview, ids);
    expect(recordSourceInputs([draft], [])).toEqual([{ kind: "clip", snapshotKey: preview.snapshotKey, receiptId: preview.receiptId, fragmentIds: ids }]);
    expect(JSON.stringify(recordSourceInputs([draft], []))).not.toContain("段一");
    const saved = recordClipSnapshot(preview, ids);
    expect(recordSourceInputs([saved, whole], [saved])).toEqual([{ kind: "retained", sourceIndex: 0 }, { kind: "record", knowledgePointId: "source", revisionId: "source-v1" }]);
    expect(recordSourceInputs([{ unknown: "raw" }, saved], [{ unknown: "raw" }, saved])).toEqual([{ kind: "retained", sourceIndex: 0 }, { kind: "retained", sourceIndex: 1 }]);
    expect(() => recordSourceInputs([saved], [])).toThrow("原始来源已变化");
    expect(() => recordSourceInputs([{ ...draft, fragmentIds: ["forged"] }], [])).toThrow("原始来源已变化");
  });
});
