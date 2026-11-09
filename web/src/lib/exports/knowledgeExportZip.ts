import { KNOWLEDGE_EXPORT_MAX_BYTES, KNOWLEDGE_EXPORT_MAX_FILES } from "../learning/knowledgeExportContracts";

const errors = {
  INVALID_INPUT: [400, "导出文件配置无效，未生成归档。"],
  TOO_LARGE: [413, "导出超过大小或文件数量上限，请缩小范围或关闭全部历史后重试。"],
  ABORTED: [499, "导出准备已取消，原记录和草稿保持。"],
  TIMEOUT: [504, "导出准备超时，请缩小范围后重试。"],
  INVALID_SNAPSHOT: [503, "导出快照不一致，未生成归档，请重新读取后重试。"]
} as const;
export class KnowledgeExportArchiveError extends Error {
  readonly status: number;
  constructor(readonly code: keyof typeof errors) { super(errors[code][1]); this.name = "KnowledgeExportArchiveError"; this.status = errors[code][0]; }
}
export type KnowledgeExportWork = { signal?: AbortSignal; check?: () => void };
export type KnowledgeExportZipEntry = { path: string; bytes: Uint8Array };
export function knowledgeExportCheck(options: KnowledgeExportWork) {
  if (options.signal?.aborted) throw new KnowledgeExportArchiveError("ABORTED");
  options.check?.();
}
export const knowledgeExportYield = () => new Promise<void>(resolve => setImmediate(resolve));
const crcTable = Array.from({ length: 256 }, (_, value) => {
  let crc = value; for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  return crc >>> 0;
});
export function validateKnowledgeExportZipPath(path: string) {
  if (!path || path.includes("\\") || /[\u0000-\u001f\u007f-\u009f:*?"<>|]/u.test(path) || path.startsWith("/") || path.endsWith("/")) throw new KnowledgeExportArchiveError("INVALID_INPUT");
  const segments = path.split("/");
  if (segments.some(segment => !segment || segment === "." || segment === ".." || segment !== segment.trim() || segment.endsWith(".") || /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(segment))) throw new KnowledgeExportArchiveError("INVALID_INPUT");
  const encoded = Buffer.from(path, "utf8");
  if (encoded.length > 0xffff || encoded.toString("utf8") !== path) throw new KnowledgeExportArchiveError("INVALID_INPUT");
  return encoded;
}

/** Single-disk ZIP32 STORE. No compression, encryption, descriptors, extras or directory entries.
 * All sizes include both headers and names. Payload bytes are copied unchanged.
 */
export async function buildKnowledgeExportZip(entries: readonly KnowledgeExportZipEntry[], options: KnowledgeExportWork & { maxBytes?: number; maxFiles?: number } = {}): Promise<Uint8Array> {
  knowledgeExportCheck(options);
  const maxBytes = options.maxBytes ?? KNOWLEDGE_EXPORT_MAX_BYTES, maxFiles = options.maxFiles ?? KNOWLEDGE_EXPORT_MAX_FILES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 22 || maxBytes > KNOWLEDGE_EXPORT_MAX_BYTES || !Number.isSafeInteger(maxFiles) || maxFiles < 0 || maxFiles > KNOWLEDGE_EXPORT_MAX_FILES) throw new KnowledgeExportArchiveError("INVALID_INPUT");
  if (entries.length > maxFiles) throw new KnowledgeExportArchiveError("TOO_LARGE");
  const prepared: { entry: KnowledgeExportZipEntry; name: Buffer; offset: number; crc: number }[] = [], names = new Set<string>();
  let size = 22, localSize = 0;
  for (const entry of entries) {
    knowledgeExportCheck(options);
    const name = validateKnowledgeExportZipPath(entry.path), key = entry.path.normalize("NFC").toLowerCase();
    if (names.has(key) || !(entry.bytes instanceof Uint8Array)) throw new KnowledgeExportArchiveError("INVALID_INPUT");
    names.add(key);
    size += 76 + 2 * name.length + entry.bytes.byteLength;
    if (size > maxBytes || entry.bytes.byteLength >= 0xffffffff || localSize >= 0xffffffff) throw new KnowledgeExportArchiveError("TOO_LARGE");
    prepared.push({ entry, name, offset: localSize, crc: 0 }); localSize += 30 + name.length + entry.bytes.byteLength;
    if ((prepared.length & 255) === 0) { await knowledgeExportYield(); knowledgeExportCheck(options); }
  }
  const archive = Buffer.alloc(size);
  for (let index = 0; index < prepared.length; index++) {
    knowledgeExportCheck(options);
    const item = prepared[index], { entry, name, offset } = item;
    archive.writeUInt32LE(0x04034b50, offset); archive.writeUInt16LE(20, offset + 4); archive.writeUInt16LE(0x0800, offset + 6);
    // Fixed DOS 1980-01-01; capture time belongs to the manifest, not local timezone conversion.
    archive.writeUInt16LE(33, offset + 12); archive.writeUInt32LE(entry.bytes.byteLength, offset + 18); archive.writeUInt32LE(entry.bytes.byteLength, offset + 22);
    archive.writeUInt16LE(name.length, offset + 26); archive.set(name, offset + 30);
    let crc = 0xffffffff;
    for (let start = 0; start < entry.bytes.byteLength; start += 65536) {
      knowledgeExportCheck(options);
      const chunk = entry.bytes.subarray(start, Math.min(start + 65536, entry.bytes.byteLength)); archive.set(chunk, offset + 30 + name.length + start);
      // CRC uses the copied bytes, so even a caller-owned view cannot disagree with the archive.
      for (let cursor = 0; cursor < chunk.length; cursor++) crc = crcTable[(crc ^ archive[offset + 30 + name.length + start + cursor]) & 0xff] ^ (crc >>> 8);
      await knowledgeExportYield(); knowledgeExportCheck(options);
    }
    item.crc = (crc ^ 0xffffffff) >>> 0; archive.writeUInt32LE(item.crc, offset + 14);
    if ((index & 255) === 255) { await knowledgeExportYield(); knowledgeExportCheck(options); }
  }
  let cursor = localSize;
  for (let index = 0; index < prepared.length; index++) {
    knowledgeExportCheck(options);
    const { entry, name, offset, crc } = prepared[index];
    archive.writeUInt32LE(0x02014b50, cursor); archive.writeUInt16LE(20, cursor + 4); archive.writeUInt16LE(20, cursor + 6); archive.writeUInt16LE(0x0800, cursor + 8);
    archive.writeUInt16LE(33, cursor + 14); archive.writeUInt32LE(crc, cursor + 16);
    archive.writeUInt32LE(entry.bytes.byteLength, cursor + 20); archive.writeUInt32LE(entry.bytes.byteLength, cursor + 24);
    archive.writeUInt16LE(name.length, cursor + 28); archive.writeUInt32LE(offset, cursor + 42); archive.set(name, cursor + 46); cursor += 46 + name.length;
    if ((index & 255) === 255) { await knowledgeExportYield(); knowledgeExportCheck(options); }
  }
  const directorySize = cursor - localSize;
  archive.writeUInt32LE(0x06054b50, cursor); archive.writeUInt16LE(prepared.length, cursor + 8); archive.writeUInt16LE(prepared.length, cursor + 10);
  archive.writeUInt32LE(directorySize, cursor + 12); archive.writeUInt32LE(localSize, cursor + 16);
  knowledgeExportCheck(options);
  return archive;
}
