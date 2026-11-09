import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildRecordClipPreview, isRecordClipDraftSource, isRecordClipPreview, isRecordClipSnapshot, makeRecordClipDraftSource, parseRecordClipRequest, parseRecordClipSourceInput, parseRecordClipUrl, recordClipSelectedText, recordClipSnapshot, recordClipSourceInput, recordClipSourceKey, selectedRecordClipFragments, RECORD_CLIP_FRAGMENT_LIMIT, RECORD_CLIP_STORE_BYTES, RECORD_CLIP_STORE_ENTRIES, RECORD_CLIP_ENTRY_BYTES } from "./recordClipContracts";

const capturedAt = "2026-11-09T14:00:00.000Z", expiresAt = "2026-11-09T14:15:00.000Z";
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const makePreview = (text = "第一段🙂\r\n保留同段。  \r\n\r\n重复。\r\n\r\n重复。", extra: Partial<Parameters<typeof buildRecordClipPreview>[0]> = {}) => buildRecordClipPreview({ mode: "pasted", title: "本人提供的文字", requestedUrl: null, finalUrl: null, capturedAt, extractionVersion: "pasted-text-v1", truncated: false, limitations: ["本人提供，未抓取网页。"], text, receiptId: "abcdefghijklmnopqrstuvwxyz012345", expiresAt, ...extra });

describe("clip request boundaries", () => {
  it("keeps pasted original spacing, CRLF, emoji and declared provenance", () => {
    const text = "  🙂正文\r\n\r\n原文。  ";
    expect(parseRecordClipRequest({ mode: "pasted", text, title: "  我的选文  ", url: "https://example.com/a" })).toEqual({ mode: "pasted", text, title: "我的选文", url: "https://example.com/a" });
    expect(parseRecordClipRequest({ mode: "web", url: "https://EXAMPLE.com:443/a?b=1#section" })).toEqual({ mode: "web", url: "https://example.com/a?b=1#section" });
    expect(parseRecordClipUrl("https://example.com:8443/a")).toBe("https://example.com:8443/a");
  });
  it.each([
    { input: undefined }, { input: [] }, { input: { mode: "unknown" } }, { input: { mode: "web" } },
    { input: { mode: "web", url: "https://example.com", headers: { authorization: "not-accepted" } } },
    { input: { mode: "pasted", text: " " } }, { input: { mode: "pasted", text: 123 } },
    { input: { mode: "pasted", text: "x".repeat(32001) } }, { input: { mode: "pasted", text: "x", obtained: true } },
    { input: { mode: "pasted", text: "x", title: "\n恶意标题" } }, { input: { mode: "pasted", text: "x", title: " " } },
    { input: { mode: "pasted", text: "x", url: "" } }
  ])("rejects unsupported or forged preview input $input", ({ input }) => expect(() => parseRecordClipRequest(input)).toThrow());
  it.each(["http://example.com", "data:text/html,test", "javascript:alert(1)", "file:///C:/secret", "https://u:p@example.com", "https://example.com\n", " https://example.com", "https://example.com/\tpath", "not-a-url"])("rejects unsafe URL shape %s", url => expect(() => parseRecordClipUrl(url)).toThrow());
  it("does not mistake URL shape validation for a public DNS decision", () => {
    expect(parseRecordClipUrl("https://127.0.0.1/private")).toBe("https://127.0.0.1/private");
    expect(parseRecordClipUrl("https://localhost/private")).toBe("https://localhost/private");
  });
});

describe("fixed preview and fragment identity", () => {
  it("hashes exact original text and positions, including duplicate paragraphs", async () => {
    const p = await makePreview();
    expect(isRecordClipPreview(p)).toBe(true); expect(p.obtained).toBe(false); expect(p.finalUrl).toBeNull();
    expect(p.contentHash).toBe(sha(p.text)); expect(p.fragments).toHaveLength(3);
    for (const f of p.fragments) { expect(p.text.slice(f.start, f.end)).toBe(f.text); expect(f.textHash).toBe(sha(f.text)); }
    expect(p.fragments[0].text).toBe("第一段🙂\r\n保留同段。  ");
    expect(p.fragments[1].text).toBe(p.fragments[2].text); expect(p.fragments[1].id).not.toBe(p.fragments[2].id);
    expect(recordClipSelectedText(p, p.fragments.map(f => f.id))).toBe(p.text);
  });
  it("captures acquisition identity while temporary receipt changes do not change source text identity", async () => {
    const a = await makePreview(), b = await makePreview(undefined, { receiptId: "anotherReceipt0123456789012345", expiresAt: "2026-11-09T14:16:00.000Z" });
    expect(a.snapshotKey).toBe(b.snapshotKey); expect(a.receiptId).not.toBe(b.receiptId);
    const later = await makePreview(undefined, { capturedAt: "2026-11-09T14:01:00.000Z" });
    expect(later.snapshotKey).not.toBe(a.snapshotKey); expect(later.contentHash).toBe(a.contentHash);
  });
  it("distinguishes actually fetched HTML and user-provided text with the same declared URL", async () => {
    const url = "https://example.com/a", manual = await makePreview("same", { requestedUrl: url });
    const fetched = await makePreview("same", { mode: "web", requestedUrl: url, finalUrl: url, extractionVersion: "html-text-v1", limitations: ["有界文字提取，不代表已核实。"] });
    expect(manual.obtained).toBe(false); expect(fetched.obtained).toBe(true); expect(fetched.snapshotKey).not.toBe(manual.snapshotKey);
  });
  it("never splits a Unicode pair at fragment boundaries and rejoins contiguous ranges exactly", async () => {
    const text = "a".repeat(1799) + "🙂" + "b".repeat(1800), p = await makePreview(text);
    expect(p.fragments).toHaveLength(3); expect(p.fragments[0].end).toBe(1799); expect(p.fragments[1].text.startsWith("🙂")).toBe(true);
    expect(p.fragments.map(f => f.text).join("")).toBe(text); expect(recordClipSelectedText(p, p.fragments.map(f => f.id))).toBe(text);
  });
  it("marks omitted original text between sparse fragments explicitly", async () => {
    const p = await makePreview("first\n\nnot selected\n\nlast");
    expect(recordClipSelectedText(p, [p.fragments[0].id, p.fragments[2].id])).toBe("first\n\n[…未选取的原文…]\n\nlast");
  });
  it("discloses the fragment cap rather than claiming the omitted preview was selected", async () => {
    const p = await makePreview(Array.from({ length: 161 }, (_, i) => `段${i}`).join("\n\n"));
    expect(p.fragments).toHaveLength(RECORD_CLIP_FRAGMENT_LIMIT); expect(p.truncated).toBe(true); expect(p.limitations.some(s => s.includes("后续文字"))).toBe(true);
  });
  it.each([
    { extra: { expiresAt: capturedAt } }, { extra: { capturedAt: "broken" } },
    { extra: { mode: "web" as const, requestedUrl: null } }, { extra: { finalUrl: "https://example.com" } },
    { extra: { extractionVersion: "html-text-v1" as const } }, { extra: { receiptId: "short" } }
  ])("refuses inconsistent capture metadata $extra", async ({ extra }) => { await expect(makePreview("text", extra)).rejects.toThrow(); });
});

describe("short source input, fixed history and client drafts", () => {
  it("keeps receipt authority out of saved source snapshots", async () => {
    const p = await makePreview(), ids = [p.fragments[0].id], d = makeRecordClipDraftSource(p, ids), snapshot = recordClipSnapshot(p, ids);
    expect(isRecordClipDraftSource(d)).toBe(true); expect(isRecordClipSnapshot(snapshot)).toBe(true); expect(isRecordClipSnapshot(d)).toBe(false);
    expect(recordClipSourceInput(d)).toEqual({ kind: "clip", snapshotKey: p.snapshotKey, receiptId: p.receiptId, fragmentIds: ids });
    expect(recordClipSourceKey(d)).toBe(recordClipSourceKey(snapshot)); expect(snapshot.fragments).toEqual([p.fragments[0]]);
    expect(snapshot).not.toHaveProperty("receiptId"); expect(snapshot).not.toHaveProperty("expiresAt"); expect(snapshot).not.toHaveProperty("text");
    snapshot.fragments[0].text = "changed local copy"; snapshot.limitations.push("local");
    expect(p.fragments[0].text).not.toBe("changed local copy"); expect(p.limitations).not.toContain("local");
  });
  it("old saved source shape stays readable after the preview lifetime", async () => {
    const p = await makePreview(), snapshot = recordClipSnapshot(p, [p.fragments[1].id]);
    expect(isRecordClipSnapshot(JSON.parse(JSON.stringify(snapshot)))).toBe(true); expect(snapshot.capturedAt).toBe(capturedAt);
    expect(snapshot.fragments[0].start).toBe(p.fragments[1].start); expect(snapshot.fragments[0].textHash).toBe(sha("重复。"));
  });
  it("rejects client-supplied obtained metadata and text as source input", async () => {
    const p = await makePreview(), input = recordClipSourceInput(makeRecordClipDraftSource(p, [p.fragments[0].id]));
    expect(() => parseRecordClipSourceInput({ ...input, obtained: true })).toThrow();
    expect(() => parseRecordClipSourceInput({ ...input, text: "fabricated" })).toThrow();
    expect(() => parseRecordClipSourceInput(recordClipSnapshot(p, input.fragmentIds))).toThrow();
  });
  it("checks selection existence, uniqueness and source order", async () => {
    const p = await makePreview(), first = p.fragments[0].id, last = p.fragments[2].id;
    expect(() => selectedRecordClipFragments(p, [])).toThrow(); expect(() => selectedRecordClipFragments(p, [first, first])).toThrow();
    expect(() => selectedRecordClipFragments(p, [last, first])).toThrow();
    expect(() => selectedRecordClipFragments(p, [`clip-fragment-0-1-${"a".repeat(64)}`])).toThrow();
    expect(() => selectedRecordClipFragments(p, ["fabricated"])).toThrow();
  });
  it("rejects malformed preview bodies and source ranges without rewriting them", async () => {
    const p = await makePreview();
    expect(isRecordClipPreview({ ...p, text: "different" })).toBe(false);
    expect(isRecordClipPreview({ ...p, obtained: true })).toBe(false);
    const bad = { ...p, fragments: [{ ...p.fragments[0], start: -1 }] };
    expect(isRecordClipPreview(bad)).toBe(false); expect(bad.fragments[0].start).toBe(-1);
    expect(isRecordClipSnapshot({ ...recordClipSnapshot(p, [p.fragments[0].id]), receiptId: p.receiptId })).toBe(false);
    expect(isRecordClipDraftSource({ kind: "clip-draft", preview: p, fragmentIds: ["not-owned"] })).toBe(false);
    expect(isRecordClipSnapshot({ kind: "record" })).toBe(false);
  });
  it("capacity permits the existing thirty-source command at maximum entry size", () => {
    expect(RECORD_CLIP_STORE_ENTRIES).toBeGreaterThanOrEqual(30); expect(RECORD_CLIP_STORE_BYTES).toBeGreaterThanOrEqual(30 * RECORD_CLIP_ENTRY_BYTES);
  });
});
