import { parseCivilDay } from "./civilDateContracts";
import { parseKnowledgeFilters, type KnowledgeDateWindow, type KnowledgeViewFilters } from "./knowledgeViewContracts";

export const KNOWLEDGE_EXPORT_MAX_BYTES = 64 * 1024 * 1024;
export const KNOWLEDGE_EXPORT_MAX_FILES = 65535;
export const KNOWLEDGE_EXPORT_TIMEOUT_MS = 30000;
export const KNOWLEDGE_EXPORT_FORMAT = "englishnode-personal-knowledge";

export type KnowledgeExportScope = { mode: "view"; filters: KnowledgeViewFilters; observedDateWindow: KnowledgeDateWindow | null } | { mode: "record"; pointId: string };
export type KnowledgeExportRequest = { scope: KnowledgeExportScope; includeHistory: boolean };
const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v) && [Object.prototype, null].includes(Object.getPrototypeOf(v));
function exact(v: Record<string, unknown>, keys: string[]) {
  if (Object.keys(v).length !== keys.length || keys.some(key => !Object.prototype.hasOwnProperty.call(v, key))) throw new Error("导出配置需要完整字段，不能包含分页或显示设置。");
}
function observedWindow(v: unknown, filters: KnowledgeViewFilters): KnowledgeDateWindow | null {
  const date = filters.date;
  if (date.mode === "all") { if (v !== null) throw new Error("不限日期的导出不接受额外日期窗口。"); return null; }
  if (!object(v)) throw new Error("请先读取当前检索日期窗口，再导出。");
  exact(v, ["field", "timeZone", "from", "to"]);
  if (v.field !== date.field || v.timeZone !== date.timeZone) throw new Error("导出日期依据或时区与已应用检索不一致。");
  const from = v.from === null ? null : parseCivilDay(v.from), to = v.to === null ? null : parseCivilDay(v.to);
  if (!from && !to || from && to && from > to) throw new Error("导出日期窗口无效。");
  if (date.mode === "range") {
    if (from !== (date.from ?? null) || to !== (date.to ?? null)) throw new Error("导出日期范围与页面已应用范围不一致。");
  } else {
    if (!from || !to) throw new Error("最近日期规则需要完整的已应用窗口。");
    const earliest = Date.parse("0001-01-01T00:00:00.000Z");
    const expectedFrom = new Date(Math.max(earliest, Date.parse(`${to}T00:00:00.000Z`) - (date.days - 1) * 86400000)).toISOString().slice(0, 10);
    if (from !== expectedFrom) throw new Error("导出窗口天数与页面最近日期规则不一致。");
  }
  return { field: date.field, timeZone: date.timeZone, from, to };
}
export function parseKnowledgeExportRequest(value: unknown): KnowledgeExportRequest {
  if (!object(value)) throw new Error("请提供导出范围和历史选择。");
  exact(value, ["scope", "includeHistory"]);
  if (typeof value.includeHistory !== "boolean" || !object(value.scope)) throw new Error("请明确选择是否导出全部历史修订。");
  const scope = value.scope;
  if (scope.mode === "record") {
    exact(scope, ["mode", "pointId"]);
    if (typeof scope.pointId !== "string" || !scope.pointId || scope.pointId !== scope.pointId.trim() || scope.pointId.length > 200 || /\p{Cc}/u.test(scope.pointId)) throw new Error("导出记录身份无效。");
    return { scope: { mode: "record", pointId: scope.pointId }, includeHistory: value.includeHistory };
  }
  if (scope.mode !== "view") throw new Error("导出范围无效。");
  exact(scope, ["mode", "filters", "observedDateWindow"]);
  if (!object(scope.filters)) throw new Error("请提供完整的已应用检索条件。");
  exact(scope.filters, ["q", "domainId", "collectionId", "kind", "sourceType", "sort", "date"]);
  const date = scope.filters.date;
  if (!object(date) || !["mode", "field", "timeZone"].every(key => Object.prototype.hasOwnProperty.call(date, key))) throw new Error("请提供已应用日期规则。");
  const filters = parseKnowledgeFilters(scope.filters);
  return { scope: { mode: "view", filters, observedDateWindow: observedWindow(scope.observedDateWindow, filters) }, includeHistory: value.includeHistory };
}
export function knowledgeExportEffectiveFilters(request: KnowledgeExportRequest): KnowledgeViewFilters | null {
  if (request.scope.mode === "record") return null;
  const { filters, observedDateWindow: window } = request.scope;
  return { ...filters, date: window ? { mode: "range", field: window.field, timeZone: window.timeZone, ...(window.from ? { from: window.from } : {}), ...(window.to ? { to: window.to } : {}) } : { ...filters.date } };
}

export type KnowledgeExportRevision = { id: string; knowledgePointId: string; sequence: number; title: string; body: string; sourceType: string; sourcesJson: string; aliasesJson: string; recordDate: string | null; recordDateTimeZone: string | null; createdAt: string };
export type KnowledgeExportRecord = {
  id: string; domainId: string | null; currentRevisionId: string | null; currentRecordKind: string; currentTitle: string; createdAt: string; updatedAt: string;
  legacyFallback: { title: string; userUnderstanding: string | null; coreEssence: string | null } | null;
  revisions: KnowledgeExportRevision[];
};
export type KnowledgeExportGraphNode = { id: string; domainId: string | null; knowledgePointId: string | null; title: string; nodeType: string; status: string; createdAt: string; updatedAt: string };
export type KnowledgeExportRelation = { id: string; domainId: string | null; fromNodeId: string | null; toNodeId: string | null; fromKnowledgePointId: string | null; toKnowledgePointId: string | null; relationType: string; detail: string | null; status: string; evidenceStrength: string; userExplanation: string | null; aiAssessment: string | null; applicability: string | null; misuseRisk: string | null; legacyVariantsJson: string | null; createdAt: string };
export type KnowledgeExportSnapshot = {
  format: typeof KNOWLEDGE_EXPORT_FORMAT; formatVersion: 1; exportedAt: string; request: KnowledgeExportRequest;
  effectiveFilters: KnowledgeViewFilters | null; effectiveDateWindow: KnowledgeDateWindow | null; orderedRecordIds: string[];
  records: KnowledgeExportRecord[];
  collections: KnowledgeExportGraphNode[];
  memberships: { groupNodeId: string; knowledgePointId: string; createdAt: string }[];
  domains: { id: string; name: string }[];
  nodeLinks: { nodeId: string; knowledgePointId: string; createdAt: string }[];
  nodes: { id: string; domainId: string; title: string }[];
  graphNodes: KnowledgeExportGraphNode[];
  relations: KnowledgeExportRelation[];
  externalEndpoints: { id: string; title: string | null }[];
  externalNodes: { id: string; domainId: string | null; title: string; nodeType: string; status: string }[];
};
export type KnowledgeExportFile = {
  path: string; role: "current" | "revision" | "index"; bytes: number; sha256: string;
  recordId?: string; revisionId?: string | null; bodyByteOffset?: number; bodyByteLength?: number; bodySha256?: string;
};
export type KnowledgeExportReference = { ownerRecordId: string; ownerRevisionId: string | null; sourceIndex: number; knowledgePointId: string; revisionId: string; path: string | null; outsideSelection: boolean; resolution: "included_revision" | "stored_snapshot" | "unavailable"; limitation?: string };
export type KnowledgeExportManifest = KnowledgeExportSnapshot & { files: KnowledgeExportFile[]; references: KnowledgeExportReference[]; integrity: { algorithm: "sha256"; fileTableExcludes: ["manifest.json"] } };
export type KnowledgeExportArchive = { bytes: Uint8Array; filename: string; sha256: string; recordCount: number; revisionCount: number; fileCount: number };
export type KnowledgeExportDownloadMetadata = Omit<KnowledgeExportArchive, "bytes"> & { bytes: number };

export function knowledgeExportFilename(exportedAt: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(exportedAt) || !Number.isFinite(Date.parse(exportedAt)) || new Date(exportedAt).toISOString() !== exportedAt) throw new Error("导出时间无效。");
  return `englishnode-knowledge-${exportedAt.replace(/[-:.]/g, "")}.zip`;
}
export function knowledgeExportHeaders(archive: KnowledgeExportArchive): Record<string, string> {
  return { "Content-Type": "application/zip", "Content-Disposition": `attachment; filename="${archive.filename}"`, "Content-Length": String(archive.bytes.byteLength), "Cache-Control": "no-store, no-transform", "X-Content-Type-Options": "nosniff", "X-EnglishNode-Export-Bytes": String(archive.bytes.byteLength), "X-EnglishNode-Export-Sha256": archive.sha256, "X-EnglishNode-Export-Record-Count": String(archive.recordCount), "X-EnglishNode-Export-Revision-Count": String(archive.revisionCount), "X-EnglishNode-Export-File-Count": String(archive.fileCount) };
}
export function parseKnowledgeExportDownloadHeaders(headers: Pick<Headers, "get">): KnowledgeExportDownloadMetadata {
  if (headers.get("Content-Type")?.split(";", 1)[0].trim().toLowerCase() !== "application/zip") throw new Error("导出响应不是ZIP文件，未请求下载。");
  const disposition = headers.get("Content-Disposition") || "", filename = /^attachment; filename="(englishnode-knowledge-\d{8}T\d{9}Z\.zip)"$/.exec(disposition)?.[1];
  const sha256 = headers.get("X-EnglishNode-Export-Sha256") || "";
  if (!filename || !/^[0-9a-f]{64}$/.test(sha256)) throw new Error("导出文件身份不完整，未请求下载。");
  const count = (name: string, max: number) => { const raw = headers.get(name) || ""; if (!/^(0|[1-9][0-9]*)$/.test(raw) || !Number.isSafeInteger(Number(raw)) || Number(raw) > max) throw new Error("导出大小或计数无效，未请求下载。"); return Number(raw); };
  const bytes = count("X-EnglishNode-Export-Bytes", KNOWLEDGE_EXPORT_MAX_BYTES), recordCount = count("X-EnglishNode-Export-Record-Count", KNOWLEDGE_EXPORT_MAX_FILES), revisionCount = count("X-EnglishNode-Export-Revision-Count", KNOWLEDGE_EXPORT_MAX_FILES), fileCount = count("X-EnglishNode-Export-File-Count", KNOWLEDGE_EXPORT_MAX_FILES);
  if (bytes < 22 || fileCount < 2 || fileCount < recordCount + 2 || fileCount < revisionCount + 2) throw new Error("导出文件数量或大小不一致，未请求下载。");
  return { filename, sha256, bytes, recordCount, revisionCount, fileCount };
}
