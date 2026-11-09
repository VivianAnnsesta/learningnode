import { createHash } from "node:crypto";
import { KNOWLEDGE_EXPORT_FORMAT, KNOWLEDGE_EXPORT_MAX_BYTES, KNOWLEDGE_EXPORT_MAX_FILES, knowledgeExportFilename, type KnowledgeExportArchive, type KnowledgeExportFile, type KnowledgeExportManifest, type KnowledgeExportRecord, type KnowledgeExportReference, type KnowledgeExportRevision, type KnowledgeExportSnapshot } from "../learning/knowledgeExportContracts";
import { isRecordReferenceSnapshot, recordReferenceQuote, verifyParagraphSelector } from "../learning/recordReferences";
import { isRecordClipSnapshot } from "../learning/recordClipContracts";
import { parseAssignedRecordDate } from "../learning/recordDateContracts";
import { isSafeExternalUrl } from "../security/externalUrl";
import { buildKnowledgeExportZip, KnowledgeExportArchiveError, knowledgeExportCheck, knowledgeExportYield, type KnowledgeExportWork, type KnowledgeExportZipEntry } from "./knowledgeExportZip";
export { KnowledgeExportArchiveError } from "./knowledgeExportZip";

export const knowledgeExportStableId = (id: string) => createHash("sha256").update(JSON.stringify(id), "utf8").digest("hex");
const referenceId = (pointId: string, revisionId: string) => JSON.stringify([pointId, revisionId]);
const plain = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/[\\`*_{}[\]()#+.!|~]/g, "\\$&").replace(/[\r\n\u0000-\u001f\u007f-\u009f]/g, " ");
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const rawJson = (text: string) => { try { return { ok: true as const, value: JSON.parse(text) as unknown }; } catch { return { ok: false as const }; } };
async function fence(value: string, options: KnowledgeExportWork, language = "") {
  let longest = 0, run = 0;
  for (let index = 0; index < value.length; index++) {
    if ((index & 4095) === 0) knowledgeExportCheck(options);
    if (index && (index & 65535) === 0) { await knowledgeExportYield(); knowledgeExportCheck(options); }
    run = value[index] === "`" ? run + 1 : 0; longest = Math.max(longest, run);
  }
  if (Buffer.byteLength(value, "utf8") + 2 * Math.max(3, longest + 1) > KNOWLEDGE_EXPORT_MAX_BYTES) throw new KnowledgeExportArchiveError("TOO_LARGE");
  const marker = "`".repeat(Math.max(3, longest + 1)); return `${marker}${language}\n${value}\n${marker}\n`;
}
const jsonBlock = (value: unknown, options: KnowledgeExportWork) => fence(JSON.stringify(value, null, 2), options, "json");
const yamlString = (value: string) => JSON.stringify(value).replace(/[\u0085\u2028\u2029]/g, char => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`);
function safeLink(value: unknown) {
  if (typeof value !== "string" || /[\u0000-\u0020\u007f-\u009f]/u.test(value) || !isSafeExternalUrl(value)) return null;
  try { const url = new URL(value); return url.username || url.password ? null : url.href.replace(/\(/g, "%28").replace(/\)/g, "%29"); } catch { return null; }
}
function revisionFields(revision: KnowledgeExportRevision): KnowledgeExportRevision {
  return { id: revision.id, knowledgePointId: revision.knowledgePointId, sequence: revision.sequence, title: revision.title, body: revision.body, sourceType: revision.sourceType, sourcesJson: revision.sourcesJson, aliasesJson: revision.aliasesJson, recordDate: revision.recordDate, recordDateTimeZone: revision.recordDateTimeZone, createdAt: revision.createdAt };
}
/** Explicit allowlists also protect against accidental extra runtime columns in a typed DTO. */
function snapshotFields(snapshot: KnowledgeExportSnapshot, records: KnowledgeExportRecord[]): KnowledgeExportSnapshot {
  const graph = (node: KnowledgeExportSnapshot["graphNodes"][number]) => ({ id: node.id, domainId: node.domainId, knowledgePointId: node.knowledgePointId, title: node.title, nodeType: node.nodeType, status: node.status, createdAt: node.createdAt, updatedAt: node.updatedAt });
  return {
    format: snapshot.format, formatVersion: snapshot.formatVersion, exportedAt: snapshot.exportedAt,
    request: snapshot.request, effectiveFilters: snapshot.effectiveFilters, effectiveDateWindow: snapshot.effectiveDateWindow,
    orderedRecordIds: [...snapshot.orderedRecordIds],
    records: records.map(record => ({ id: record.id, domainId: record.domainId, currentRevisionId: record.currentRevisionId, currentRecordKind: record.currentRecordKind, currentTitle: record.currentTitle, createdAt: record.createdAt, updatedAt: record.updatedAt, legacyFallback: record.legacyFallback ? { title: record.legacyFallback.title, userUnderstanding: record.legacyFallback.userUnderstanding, coreEssence: record.legacyFallback.coreEssence } : null, revisions: record.revisions.map(revisionFields) })),
    collections: snapshot.collections.map(graph), memberships: snapshot.memberships.map(x => ({ groupNodeId: x.groupNodeId, knowledgePointId: x.knowledgePointId, createdAt: x.createdAt })),
    domains: snapshot.domains.map(x => ({ id: x.id, name: x.name })), nodeLinks: snapshot.nodeLinks.map(x => ({ nodeId: x.nodeId, knowledgePointId: x.knowledgePointId, createdAt: x.createdAt })),
    nodes: snapshot.nodes.map(x => ({ id: x.id, domainId: x.domainId, title: x.title })), graphNodes: snapshot.graphNodes.map(graph),
    relations: snapshot.relations.map(x => ({ id: x.id, domainId: x.domainId, fromNodeId: x.fromNodeId, toNodeId: x.toNodeId, fromKnowledgePointId: x.fromKnowledgePointId, toKnowledgePointId: x.toKnowledgePointId, relationType: x.relationType, detail: x.detail, status: x.status, evidenceStrength: x.evidenceStrength, userExplanation: x.userExplanation, aiAssessment: x.aiAssessment, applicability: x.applicability, misuseRisk: x.misuseRisk, legacyVariantsJson: x.legacyVariantsJson, createdAt: x.createdAt })),
    externalEndpoints: snapshot.externalEndpoints.map(x => ({ id: x.id, title: x.title })), externalNodes: snapshot.externalNodes.map(x => ({ id: x.id, domainId: x.domainId, title: x.title, nodeType: x.nodeType, status: x.status }))
  };
}
async function digest(bytes: Uint8Array, options: KnowledgeExportWork) {
  const hash = createHash("sha256");
  for (let offset = 0; offset < bytes.byteLength; offset += 65536) { knowledgeExportCheck(options); hash.update(bytes.subarray(offset, offset + 65536)); await knowledgeExportYield(); }
  knowledgeExportCheck(options); return hash.digest("hex");
}

export async function buildKnowledgeExportArchive(snapshot: KnowledgeExportSnapshot, options: KnowledgeExportWork = {}): Promise<KnowledgeExportArchive> {
  knowledgeExportCheck(options);
  if (snapshot.format !== KNOWLEDGE_EXPORT_FORMAT || snapshot.formatVersion !== 1) throw new KnowledgeExportArchiveError("INVALID_SNAPSHOT");
  let filename: string; try { filename = knowledgeExportFilename(snapshot.exportedAt); } catch { throw new KnowledgeExportArchiveError("INVALID_SNAPSHOT"); }
  const byRecord = new Map(snapshot.records.map(record => [record.id, record]));
  if (byRecord.size !== snapshot.records.length || new Set(snapshot.orderedRecordIds).size !== snapshot.records.length || snapshot.orderedRecordIds.length !== snapshot.records.length || snapshot.orderedRecordIds.some(id => !byRecord.has(id))) throw new KnowledgeExportArchiveError("INVALID_SNAPSHOT");
  const records = snapshot.orderedRecordIds.map(id => byRecord.get(id)!);
  const revisionPaths = new Map<string, string>(), revisionsByIdentity = new Map<string, KnowledgeExportRevision>(), pointPaths = new Map<string, string>(), revisionIds = new Set<string>();
  let revisionCount = 0, fileCount = 2;
  for (const record of records) {
    knowledgeExportCheck(options);
    const currentPath = `records/${knowledgeExportStableId(record.id)}.md`; pointPaths.set(record.id, currentPath); fileCount++;
    if (record.currentRevisionId !== null && !record.revisions.some(revision => revision.id === record.currentRevisionId) || record.currentRevisionId === null && !record.legacyFallback) throw new KnowledgeExportArchiveError("INVALID_SNAPSHOT");
    if (!snapshot.request.includeHistory && (record.currentRevisionId === null ? record.revisions.length !== 0 : record.revisions.length !== 1)) throw new KnowledgeExportArchiveError("INVALID_SNAPSHOT");
    for (const revision of record.revisions) {
      if (revision.knowledgePointId !== record.id || revisionIds.has(revision.id)) throw new KnowledgeExportArchiveError("INVALID_SNAPSHOT");
      revisionIds.add(revision.id); revisionCount++;
      const current = revision.id === record.currentRevisionId;
      revisionPaths.set(referenceId(record.id, revision.id), current ? currentPath : `revisions/${knowledgeExportStableId(revision.id)}.md`);
      revisionsByIdentity.set(referenceId(record.id, revision.id), revision);
      if (!current) fileCount++;
    }
    if (fileCount > KNOWLEDGE_EXPORT_MAX_FILES) throw new KnowledgeExportArchiveError("TOO_LARGE");
  }
  const selected = snapshotFields(snapshot, records);
  knowledgeExportCheck(options);
  if (Buffer.byteLength(JSON.stringify(selected), "utf8") > KNOWLEDGE_EXPORT_MAX_BYTES) throw new KnowledgeExportArchiveError("TOO_LARGE");
  knowledgeExportCheck(options);
  const domainsById = new Map(selected.domains.map(value => [value.id, value]));
  const collectionsById = new Map(selected.collections.map((value, index) => [value.id, { value, index }]));
  const nodesById = new Map(selected.nodes.map((value, index) => [value.id, { value, index }]));
  const membershipsByRecord = new Map<string, KnowledgeExportSnapshot["memberships"]>();
  const linksByRecord = new Map<string, KnowledgeExportSnapshot["nodeLinks"]>();
  const relationsByRecord = new Map<string, KnowledgeExportSnapshot["relations"]>();
  // Index once instead of repeatedly scanning every collection/node/link for every record.
  for (const [index, value] of selected.memberships.entries()) {
    const rows = membershipsByRecord.get(value.knowledgePointId) ?? []; rows.push(value); membershipsByRecord.set(value.knowledgePointId, rows);
    if ((index & 255) === 255) { await knowledgeExportYield(); knowledgeExportCheck(options); }
  }
  for (const [index, value] of selected.nodeLinks.entries()) {
    const rows = linksByRecord.get(value.knowledgePointId) ?? []; rows.push(value); linksByRecord.set(value.knowledgePointId, rows);
    if ((index & 255) === 255) { await knowledgeExportYield(); knowledgeExportCheck(options); }
  }
  for (const [index, value] of selected.relations.entries()) {
    for (const id of new Set([value.fromKnowledgePointId, value.toKnowledgePointId])) if (id !== null && byRecord.has(id)) {
      const rows = relationsByRecord.get(id) ?? []; rows.push(value); relationsByRecord.set(id, rows);
    }
    if ((index & 255) === 255) { await knowledgeExportYield(); knowledgeExportCheck(options); }
  }
  const entries: KnowledgeExportZipEntry[] = [], files: KnowledgeExportFile[] = [], references: KnowledgeExportReference[] = [];
  let archiveSize = 22;
  const add = async (path: string, bytes: Uint8Array, metadata: Omit<KnowledgeExportFile, "path" | "bytes" | "sha256">) => {
    knowledgeExportCheck(options); archiveSize += 76 + 2 * Buffer.byteLength(path, "utf8") + bytes.byteLength;
    if (archiveSize > KNOWLEDGE_EXPORT_MAX_BYTES) throw new KnowledgeExportArchiveError("TOO_LARGE");
    entries.push({ path, bytes }); files.push({ path, ...metadata, bytes: bytes.byteLength, sha256: await digest(bytes, options) });
  };
  const sources = async (record: KnowledgeExportRecord, revision: KnowledgeExportRevision) => {
    const saved = rawJson(revision.sourcesJson), parts = ["\n## 已保存来源（固定快照，不代表核实）\n"];
    if (!saved.ok || !Array.isArray(saved.value)) return parts.join("") + "来源JSON无法按数组读取；原始sourcesJson完整保留在manifest。\n" + await fence(revision.sourcesJson, options);
    for (const [index, source] of saved.value.entries()) {
      knowledgeExportCheck(options); parts.push(`\n### 来源 ${index + 1}\n`);
      if (object(source) && source.kind === "record" && typeof source.knowledgePointId === "string" && typeof source.revisionId === "string") {
        const identity = referenceId(source.knowledgePointId, source.revisionId), included = revisionsByIdentity.get(identity), valid = isRecordReferenceSnapshot(source);
        let selectorVerified = valid;
        if (valid && source.selector) {
          try { selectorVerified = (await verifyParagraphSelector(source.body, source.selector)).quote === source.selector.quote; }
          catch { selectorVerified = false; }
          knowledgeExportCheck(options);
        }
        const consistent = valid && selectorVerified && included?.knowledgePointId === source.knowledgePointId && included.id === source.revisionId && included.title === source.title && included.body === source.body && included.sourceType === source.sourceType;
        const target = consistent ? revisionPaths.get(identity)! : null;
        const readable = typeof source.body === "string", resolution = target ? "included_revision" as const : readable ? "stored_snapshot" as const : "unavailable" as const;
        const limitation = target ? undefined : !valid || !selectorVerified ? "固定来源或选段原文/哈希无法核验；只保留原快照，不建立指定修订链接。" : included ? "已存快照与指定修订的原文或元数据不一致；只保留原快照，不建立指定修订链接。" : "目标修订未独立包含；以下仅为已存固定快照/选段，不跳转到当前正文。";
        references.push({ ownerRecordId: record.id, ownerRevisionId: revision.id, sourceIndex: index, knowledgePointId: source.knowledgePointId, revisionId: source.revisionId, path: target, outsideSelection: !byRecord.has(source.knowledgePointId), resolution, ...(limitation ? { limitation } : {}) });
        parts.push(target ? `[独立包含的指定修订](../${target})\n` : `${limitation}\n`);
        parts.push(await jsonBlock({ knowledgePointId: source.knowledgePointId, revisionId: source.revisionId, title: source.title, sourceType: source.sourceType, ...(source.selector === undefined ? {} : { selector: source.selector }) }, options));
        parts.push(valid ? await fence(recordReferenceQuote(source), options) : await jsonBlock(source, options));
      } else if (isRecordClipSnapshot(source)) {
        parts.push(source.mode === "web" ? "系统取得的网页文字；内容未核实。\n" : "本人提供的文字；系统未从声明网址取得正文，内容未核实。\n");
        parts.push(await jsonBlock({ title: source.title, mode: source.mode, obtained: source.obtained, capturedAt: source.capturedAt, requestedUrl: source.requestedUrl, finalUrl: source.finalUrl, contentHash: source.contentHash, extractionVersion: source.extractionVersion, truncated: source.truncated, limitations: source.limitations }, options));
        for (const fragment of source.fragments) { parts.push(await jsonBlock({ location: fragment.location, start: fragment.start, end: fragment.end, textHash: fragment.textHash }, options), await fence(fragment.text, options)); await knowledgeExportYield(); knowledgeExportCheck(options); }
        const url = safeLink(source.finalUrl ?? source.requestedUrl); if (url) parts.push(`[HTTPS来源](<${url}>)\n`);
      } else {
        parts.push("已存来源原值（未知格式不推定其取得方式或真实性）。\n", await jsonBlock(source, options));
        const url = object(source) ? safeLink(source.url) : null; if (url) parts.push(`[HTTPS来源](<${url}>)\n`);
      }
      await knowledgeExportYield(); knowledgeExportCheck(options);
    }
    return parts.join("");
  };
  const writeRecord = async (record: KnowledgeExportRecord, revision: KnowledgeExportRevision | null, path: string, current: boolean) => {
    knowledgeExportCheck(options);
    const body = revision ? revision.body : record.legacyFallback!.userUnderstanding || record.legacyFallback!.coreEssence || "";
    const label = revision ? current ? "当前已保存修订" : "历史已保存修订" : "无当前修订的旧记录（未生成修订）";
    const metadata = { recordId: record.id, revisionId: revision?.id ?? null, title: revision?.title ?? record.legacyFallback!.title, ...(current ? { currentRecordKind: record.currentRecordKind } : {}), ...(revision ? { sequence: revision.sequence, sourceType: revision.sourceType, revisionCreatedAt: revision.createdAt, aliasesJson: revision.aliasesJson, recordDate: revision.recordDate, recordDateTimeZone: revision.recordDateTimeZone } : { legacyFallback: record.legacyFallback }), recordCreatedAt: record.createdAt, recordUpdatedAt: record.updatedAt };
    let warnings = "";
    if (revision) {
      const aliases = rawJson(revision.aliasesJson);
      if (!aliases.ok || !Array.isArray(aliases.value) || aliases.value.some(alias => typeof alias !== "string")) warnings += "别名原字段无法完整按字符串数组读取；未改写为默认空值。\n";
      try { if (revision.recordDate !== null || revision.recordDateTimeZone !== null) parseAssignedRecordDate({ date: revision.recordDate, timeZone: revision.recordDateTimeZone }); }
      catch { warnings += "本人日期原字段无效或不完整；原值保留，不推定学习日期。\n"; }
    }
    // The surrounding fence is generated; this exact UTF-8 body slice is never rewritten.
    let longest = 0, run = 0;
    for (let index = 0; index < body.length; index++) { if ((index & 4095) === 0) knowledgeExportCheck(options); if (index && (index & 65535) === 0) { await knowledgeExportYield(); knowledgeExportCheck(options); } run = body[index] === "`" ? run + 1 : 0; longest = Math.max(longest, run); }
    if (Buffer.byteLength(body, "utf8") + 2 * Math.max(3, longest + 1) > KNOWLEDGE_EXPORT_MAX_BYTES) throw new KnowledgeExportArchiveError("TOO_LARGE");
    const marker = "`".repeat(Math.max(3, longest + 1));
    const frontmatter = `---\nformat: ${yamlString(KNOWLEDGE_EXPORT_FORMAT)}\nrecordId: ${yamlString(record.id)}\nrevisionId: ${revision ? yamlString(revision.id) : "null"}\ntitle: ${yamlString(revision?.title ?? record.legacyFallback!.title)}\nrole: ${yamlString(current ? "current" : "revision")}\n${current ? `currentRecordKind: ${yamlString(record.currentRecordKind)}\n` : ""}---\n`;
    const prefix = Buffer.from(`${frontmatter}# ${label}\n\n${await jsonBlock(metadata, options)}\n${warnings}\n## 原始正文（UTF-8字节保真）\n\n${marker}text\n`, "utf8"), rawBody = Buffer.from(body, "utf8");
    const memberships = membershipsByRecord.get(record.id) ?? [];
    const collections = memberships.map(value => collectionsById.get(value.groupNodeId)).filter((value): value is NonNullable<typeof value> => !!value).sort((a, b) => a.index - b.index).map(value => value.value);
    const nodes = (linksByRecord.get(record.id) ?? []).map(value => nodesById.get(value.nodeId)).filter((value): value is NonNullable<typeof value> => !!value).sort((a, b) => a.index - b.index).map(value => value.value);
    const context = { note: "以下为导出时的当前归属和显式关系，不推定历史归属或关系真实性。", domain: record.domainId ? domainsById.get(record.domainId) ?? null : null, memberships, collections, nodes, relations: relationsByRecord.get(record.id) ?? [] };
    const suffix = Buffer.from(`\n${marker}\n\n## 导出时上下文（保留候选/拒绝/确认及证据强弱）\n\n${await jsonBlock(context, options)}${revision ? await sources(record, revision) : "\n旧记录没有当前修订来源；原fallback字段见manifest。\n"}`, "utf8");
    if (archiveSize + prefix.length + rawBody.length + suffix.length + 76 + 2 * Buffer.byteLength(path) > KNOWLEDGE_EXPORT_MAX_BYTES) throw new KnowledgeExportArchiveError("TOO_LARGE");
    await add(path, Buffer.concat([prefix, rawBody, suffix]), { role: current ? "current" : "revision", recordId: record.id, revisionId: revision?.id ?? null, bodyByteOffset: prefix.length, bodyByteLength: rawBody.length, bodySha256: await digest(rawBody, options) });
  };
  for (const record of records) {
    const current = record.revisions.find(revision => revision.id === record.currentRevisionId) ?? null;
    await writeRecord(record, current, pointPaths.get(record.id)!, true);
    for (const revision of record.revisions) if (revision !== current) await writeRecord(record, revision, revisionPaths.get(referenceId(record.id, revision.id))!, false);
    await knowledgeExportYield(); knowledgeExportCheck(options);
  }
  const index = ["# EnglishNode 个人记录导出\n", "本包只读取已保存状态，不是数据库备份、导入/恢复命令或学习效果认证。\n", `捕获时间：${snapshot.exportedAt}\n`, `记录：${records.length}；所含修订：${revisionCount}；全部历史：${snapshot.request.includeHistory ? "是" : "否"}。\n`, "\n## 完整选择与有效日期窗口\n", await jsonBlock({ request: selected.request, effectiveFilters: selected.effectiveFilters, effectiveDateWindow: selected.effectiveDateWindow }, options), "\n## 当前记录索引\n", ...records.map(record => `- [${plain(record.currentTitle || "无标题")}](${pointPaths.get(record.id)})${record.currentRevisionId === null ? "（旧记录，无当前修订）" : ""}\n`), "\n完整原始字段、文件哈希与固定引用身份见manifest.json。原正文在各Markdown中以原始UTF-8字节切片保留；偏移/长度/哈希见文件表。生成来源文字以纯文本展示；候选关系、本人日期和来源取得不表示核实或学习事实。\n"];
  await add("README.md", Buffer.from(index.join(""), "utf8"), { role: "index" });
  const manifest: KnowledgeExportManifest = { ...selected, files, references, integrity: { algorithm: "sha256", fileTableExcludes: ["manifest.json"] } };
  knowledgeExportCheck(options); const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2), "utf8");
  if (archiveSize + 76 + 2 * Buffer.byteLength("manifest.json") + manifestBytes.length > KNOWLEDGE_EXPORT_MAX_BYTES) throw new KnowledgeExportArchiveError("TOO_LARGE");
  entries.push({ path: "manifest.json", bytes: manifestBytes });
  if (entries.length !== fileCount) throw new KnowledgeExportArchiveError("INVALID_SNAPSHOT");
  const bytes = await buildKnowledgeExportZip(entries, options);
  return { bytes, filename, sha256: await digest(bytes, options), recordCount: records.length, revisionCount, fileCount: entries.length };
}
