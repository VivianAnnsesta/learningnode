import { describe, expect, it } from "vitest";
import { crc32 } from "node:zlib";
import { buildKnowledgeExportZip, KnowledgeExportArchiveError } from "./knowledgeExportZip";
import { KNOWLEDGE_EXPORT_MAX_BYTES, KNOWLEDGE_EXPORT_MAX_FILES } from "../learning/knowledgeExportContracts";

// Header assertions supplement independent Python/.NET readers; they are not the interoperability proof.
function entriesFromLocalHeaders(value: Uint8Array) {
  const bytes = Buffer.from(value), entries = new Map<string, Buffer>(); let at = 0;
  while (bytes.readUInt32LE(at) === 0x04034b50) {
    expect(bytes.readUInt16LE(at + 6)).toBe(0x800); expect(bytes.readUInt16LE(at + 8)).toBe(0);
    const size = bytes.readUInt32LE(at + 18), nameLength = bytes.readUInt16LE(at + 26), extra = bytes.readUInt16LE(at + 28);
    expect(bytes.readUInt32LE(at + 22)).toBe(size); expect(extra).toBe(0);
    const name = bytes.subarray(at + 30, at + 30 + nameLength).toString("utf8"), data = bytes.subarray(at + 30 + nameLength, at + 30 + nameLength + size);
    expect(bytes.readUInt32LE(at + 14)).toBe(crc32(data) >>> 0); entries.set(name, data); at += 30 + nameLength + size;
  }
  const end = bytes.length - 22;
  expect(bytes.readUInt32LE(end)).toBe(0x06054b50); expect(bytes.readUInt32LE(end + 16)).toBe(at);
  expect(bytes.readUInt16LE(end + 10)).toBe(entries.size); expect(bytes.readUInt32LE(end + 12) + at).toBe(end);
  return entries;
}
describe("ZIP32 STORE payload and boundary contract", () => {
  it("preserves UTF-8 names, exact binary bytes, empty files and a standard CRC vector", async () => {
    const raw = Buffer.from("原文\r\n😀\0\n"), archive = await buildKnowledgeExportZip([{ path: "中文/记录😀.md", bytes: raw }, { path: "vector.txt", bytes: Buffer.from("123456789") }, { path: "empty", bytes: new Uint8Array() }]);
    const files = entriesFromLocalHeaders(archive);
    expect(files.get("中文/记录😀.md")).toEqual(raw); expect(files.get("empty")).toHaveLength(0); expect(crc32(files.get("vector.txt")!) >>> 0).toBe(0xcbf43926);
  });
  it("creates a valid empty ZIP rather than an incomplete header", async () => {
    const bytes = await buildKnowledgeExportZip([]); expect(bytes).toHaveLength(22); expect(entriesFromLocalHeaders(bytes).size).toBe(0);
  });
  it("counts the full local/name/central/EOCD overhead at an exact configurable size boundary", async () => {
    const file = { path: "x", bytes: new Uint8Array(10) }, size = 22 + 76 + 2 + 10;
    expect((await buildKnowledgeExportZip([file], { maxBytes: size })).byteLength).toBe(size);
    await expect(buildKnowledgeExportZip([file], { maxBytes: size - 1 })).rejects.toMatchObject({ code: "TOO_LARGE", status: 413 });
  });
  it.each(["../a", "/absolute", "C:/absolute", "a\\b", "a/../b", "a/./b", "a//b", "a/", "NUL.txt", "a/CON", "a/LPT¹", "a. ", "bad\0name", "\ud800"])("rejects unsafe, ambiguous or non-UTF8 path %j", async path => {
    await expect(buildKnowledgeExportZip([{ path, bytes: new Uint8Array() }])).rejects.toMatchObject({ code: "INVALID_INPUT", status: 400 });
  });
  it.each([{ paths: ["a", "A"] }, { paths: ["é.txt", "e\u0301.txt"] }])("rejects case/normalization collisions $paths", async ({ paths }) => {
    await expect(buildKnowledgeExportZip(paths.map(path => ({ path, bytes: new Uint8Array() })))).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
  it("supports the actual 65535-entry ZIP32 ceiling and rejects the next entry", async () => {
    const entries = Array.from({ length: KNOWLEDGE_EXPORT_MAX_FILES }, (_, index) => ({ path: `f${index}`, bytes: new Uint8Array() }));
    const bytes = await buildKnowledgeExportZip(entries); const end = Buffer.from(bytes).subarray(bytes.length - 22);
    expect(end.readUInt16LE(8)).toBe(65535); expect(end.readUInt16LE(10)).toBe(65535);
    await expect(buildKnowledgeExportZip([...entries, { path: "too-many", bytes: new Uint8Array() }])).rejects.toMatchObject({ code: "TOO_LARGE" });
  });
  it("enforces the real 64MiB archive cap including headers", async () => {
    const overhead = 22 + 76 + 2;
    const bytes = new Uint8Array(KNOWLEDGE_EXPORT_MAX_BYTES - overhead);
    const result = await buildKnowledgeExportZip([{ path: "x", bytes }]); expect(result.byteLength).toBe(KNOWLEDGE_EXPORT_MAX_BYTES);
    await expect(buildKnowledgeExportZip([{ path: "xx", bytes }])).rejects.toMatchObject({ code: "TOO_LARGE" });
  });
  it("observes cancellation between real CRC/copy chunks without returning a partial ZIP", async () => {
    const controller = new AbortController();
    const pending = buildKnowledgeExportZip([{ path: "data", bytes: new Uint8Array(1024 * 1024) }], { signal: controller.signal });
    setImmediate(() => controller.abort()); await expect(pending).rejects.toMatchObject({ code: "ABORTED", status: 499 });
  });
  it("retains a caller's synchronous whole-operation deadline error", async () => {
    const error = new KnowledgeExportArchiveError("TIMEOUT"); let checks = 0;
    await expect(buildKnowledgeExportZip([{ path: "data", bytes: new Uint8Array(1024 * 1024) }], { check: () => { if (++checks > 4) throw error; } })).rejects.toBe(error);
  });
});
