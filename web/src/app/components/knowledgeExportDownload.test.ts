import { describe, expect, it, vi } from "vitest";
import { KNOWLEDGE_EXPORT_MAX_BYTES, knowledgeExportFilename, knowledgeExportHeaders } from "../../lib/learning/knowledgeExportContracts";
import { readKnowledgeExportDownload } from "./knowledgeExportDownload";

const bytes = new TextEncoder().encode("binary archive transport fixture: 😀\r\nunchanged\0bytes");
async function headers(value = bytes) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", value);
  const sha256 = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  return new Headers(knowledgeExportHeaders({ bytes: value, filename: knowledgeExportFilename("2026-11-09T17:30:00.123Z"), sha256, recordCount: 1, revisionCount: 1, fileCount: 3 }));
}
const signal = () => new AbortController().signal;

describe("bounded export response verification", () => {
  it("reads all raw archive chunks and verifies SHA while ignoring compressed Content-Length", async () => {
    const responseHeaders = await headers(); responseHeaders.set("Content-Length", "7");
    const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(bytes.slice(0, 8)); controller.enqueue(bytes.slice(8)); controller.close(); } }), { headers: responseHeaders });
    const result = await readKnowledgeExportDownload(response, signal());
    expect(result.bytes).toEqual(bytes); expect(result.metadata.bytes).toBe(bytes.byteLength);
    expect(result.metadata.filename).toBe("englishnode-knowledge-20261109T173000123Z.zip");
  });
  it("accepts a truthful zero-record archive without broadening the scope", async () => {
    const responseHeaders = await headers(); responseHeaders.set("X-EnglishNode-Export-Record-Count", "0"); responseHeaders.set("X-EnglishNode-Export-Revision-Count", "0"); responseHeaders.set("X-EnglishNode-Export-File-Count", "2");
    const result = await readKnowledgeExportDownload(new Response(bytes, { headers: responseHeaders }), signal());
    expect(result.metadata.recordCount).toBe(0); expect(result.metadata.revisionCount).toBe(0);
  });
  it("rejects truncated archive bytes before a file can be handed to the browser", async () => {
    await expect(readKnowledgeExportDownload(new Response(bytes.slice(0, -1), { headers: await headers() }), signal())).rejects.toThrow("不完整");
  });
  it("cancels oversized streams before copying beyond the declared buffer", async () => {
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.enqueue(new Uint8Array([1])); }, cancel }), { headers: await headers() });
    await expect(readKnowledgeExportDownload(response, signal())).rejects.toThrow("超过声明大小");
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("rejects an invalid cap header and cancels the unread response", async () => {
    const responseHeaders = await headers(); responseHeaders.set("X-EnglishNode-Export-Bytes", String(KNOWLEDGE_EXPORT_MAX_BYTES + 1));
    const cancel = vi.fn(), response = new Response(new ReadableStream({ cancel }), { headers: responseHeaders });
    await expect(readKnowledgeExportDownload(response, signal())).rejects.toThrow("大小或计数无效");
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("rejects a same-length damaged body through SHA verification", async () => {
    const damaged = bytes.slice(); damaged[damaged.length - 1] ^= 1;
    await expect(readKnowledgeExportDownload(new Response(damaged, { headers: await headers() }), signal())).rejects.toThrow("摘要不一致");
  });
  it("does not interpret a non-ZIP success or unsafe attachment as a file", async () => {
    await expect(readKnowledgeExportDownload(new Response("{}", { headers: { "Content-Type": "application/json" } }), signal())).rejects.toThrow("不是ZIP");
    const responseHeaders = await headers(); responseHeaders.set("Content-Disposition", 'attachment; filename="../../other.zip"');
    await expect(readKnowledgeExportDownload(new Response(bytes, { headers: responseHeaders }), signal())).rejects.toThrow("身份不完整");
  });
  it("surfaces a bounded JSON error instead of attempting to download it", async () => {
    await expect(readKnowledgeExportDownload(Response.json({ error: "超过导出容量，请缩小检索范围。" }, { status: 413 }), signal())).rejects.toThrow("超过导出容量");
    const cancel = vi.fn();
    const response = new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(9000)); }, cancel }), { status: 503 });
    await expect(readKnowledgeExportDownload(response, signal())).rejects.toThrow("HTTP 503");
    expect(cancel).toHaveBeenCalledOnce();
  });
  it("rejects an already cancelled preparation", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(readKnowledgeExportDownload(new Response(bytes, { headers: await headers() }), controller.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
  it("cancels a pending stream read when the scope or user aborts", async () => {
    const controller = new AbortController(), cancel = vi.fn();
    const response = new Response(new ReadableStream({ start(stream) { stream.enqueue(bytes.slice(0, 4)); }, cancel }), { headers: await headers() });
    const pending = readKnowledgeExportDownload(response, controller.signal);
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" }); expect(cancel).toHaveBeenCalledOnce();
  });
  it("checks cancellation again after the uncancellable WebCrypto digest", async () => {
    const responseHeaders = await headers(), controller = new AbortController();
    let finish!: (value: ArrayBuffer) => void;
    const spy = vi.spyOn(globalThis.crypto.subtle, "digest").mockImplementationOnce(() => new Promise<ArrayBuffer>(resolve => { finish = resolve; }));
    try {
      const pending = readKnowledgeExportDownload(new Response(bytes, { headers: responseHeaders }), controller.signal);
      await vi.waitFor(() => expect(spy).toHaveBeenCalledOnce());
      controller.abort(); finish(new ArrayBuffer(32));
      await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    } finally { spy.mockRestore(); }
  });
});
