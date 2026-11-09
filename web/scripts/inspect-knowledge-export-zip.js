// Verification only: actual bytes are decoded by the platform ZIP reader, never the writer.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const { crc32 } = require("node:zlib");

function inspectKnowledgeExportZip(filename) {
  if (!path.isAbsolute(filename)) throw new Error("ZIP verification requires an absolute file path.");
  const info = fs.lstatSync(filename);
  if (!info.isFile() || info.isSymbolicLink() || info.size < 22 || info.size > 64 * 1024 * 1024) throw new Error("ZIP verification file or size is invalid.");
  if (typeof crc32 !== "function") throw new Error("Independent CRC verification requires Node's standard zlib.crc32.");
  const read = spawnSync(process.platform === "win32" ? "pwsh.exe" : "pwsh", ["-NoLogo", "-NoProfile", "-NonInteractive", "-File", path.join(__dirname, "read-knowledge-export-zip.ps1"), "-LiteralPath", filename], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, timeout: 120000, windowsHide: true });
  if (read.error || read.status !== 0) throw new Error(`Independent PowerShell/.NET ZIP reader failed: ${read.error?.message || read.stderr?.slice(0, 2000) || `exit ${read.status}`}`);
  const decoded = JSON.parse(read.stdout.replace(/^\uFEFF/, ""));
  if (!Array.isArray(decoded.entries) || decoded.entries.length > 65535) throw new Error("Independent reader did not return a bounded entry table.");
  const sha = bytes => createHash("sha256").update(bytes).digest("hex");
  const names = new Set(), payloads = new Map(); let total = 0;
  const entries = decoded.entries.map(entry => {
    if (typeof entry.name !== "string" || !entry.name || /[\\\u0000]/.test(entry.name) || entry.name.startsWith("/") || entry.name.split("/").some(part => part === ".." || part === "." || !part) || names.has(entry.name.normalize("NFC").toLowerCase())) throw new Error("Independent reader found an unsafe or duplicated ZIP name.");
    names.add(entry.name.normalize("NFC").toLowerCase());
    if (typeof entry.base64 !== "string" || entry.base64.length > Math.ceil(64 * 1024 * 1024 / 3) * 4) throw new Error("Independent reader payload is not bounded base64.");
    const bytes = Buffer.from(entry.base64, "base64"); if (bytes.toString("base64") !== entry.base64) throw new Error("Independent reader payload is not canonical base64."); total += bytes.length;
    if (total > 64 * 1024 * 1024 || bytes.length !== entry.bytes || (crc32(bytes) >>> 0) !== entry.crc32) throw new Error("Independent ZIP entry CRC or length check failed.");
    payloads.set(entry.name, bytes); return { ...entry, sha256: sha(bytes) };
  });
  const bytes = fs.readFileSync(filename), manifestBytes = payloads.get("manifest.json");
  let manifest = null, bodySlicesVerified = 0;
  if (manifestBytes) {
    manifest = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes));
    if (manifest.format !== "englishnode-personal-knowledge" || manifest.formatVersion !== 1 || manifest.integrity?.algorithm !== "sha256" || JSON.stringify(manifest.integrity.fileTableExcludes) !== '["manifest.json"]' || !Array.isArray(manifest.files) || manifest.files.length !== entries.length - 1 || !Array.isArray(manifest.records)) throw new Error("Export manifest identity or file-table integrity contract failed.");
    const fileNames = new Set();
    for (const file of manifest.files) {
      const actual = payloads.get(file.path);
      if (!actual || file.path === "manifest.json" || fileNames.has(file.path) || file.bytes !== actual.length || file.sha256 !== sha(actual)) throw new Error("Export manifest file bytes/hash mismatch.");
      fileNames.add(file.path);
      if (file.role !== "index" && (file.bodyByteOffset === undefined || file.bodyByteLength === undefined || typeof file.bodySha256 !== "string")) throw new Error("Export record/revision file is missing its original body-slice proof.");
      if (file.bodyByteOffset !== undefined) {
        if (!Number.isSafeInteger(file.bodyByteOffset) || !Number.isSafeInteger(file.bodyByteLength) || file.bodyByteOffset < 0 || file.bodyByteLength < 0 || file.bodyByteOffset + file.bodyByteLength > actual.length) throw new Error("Export body byte slice is invalid.");
        const record = manifest.records.find(record => record.id === file.recordId), revision = record?.revisions.find(revision => revision.id === file.revisionId);
        const raw = file.revisionId === null ? record?.legacyFallback?.userUnderstanding || record?.legacyFallback?.coreEssence || "" : revision?.body;
        if (typeof raw !== "string") throw new Error("Export body owner/revision was not preserved.");
        const slice = actual.subarray(file.bodyByteOffset, file.bodyByteOffset + file.bodyByteLength);
        if (!slice.equals(Buffer.from(raw, "utf8")) || file.bodySha256 !== sha(slice)) throw new Error("Export original body byte slice/hash mismatch.");
        bodySlicesVerified++;
      }
    }
    if (!Array.isArray(manifest.references) || manifest.references.some(reference => reference.path !== null && !fileNames.has(reference.path))) throw new Error("Export reference points to a file not independently included.");
  }
  return { reader: decoded.reader, crcReader: "node:zlib.crc32", zipBytes: bytes.length, zipSha256: sha(bytes), entries, manifest, bodySlicesVerified };
}
module.exports = { inspectKnowledgeExportZip };
if (require.main === module) {
  try {
    if (process.argv.length !== 3) throw new Error("Usage: node inspect-knowledge-export-zip.js <absoluteZipPath>");
    process.stdout.write(JSON.stringify(inspectKnowledgeExportZip(process.argv[2])) + "\n");
  } catch (error) { console.error(error instanceof Error ? error.message : "Independent ZIP verification failed."); process.exitCode = 1; }
}
