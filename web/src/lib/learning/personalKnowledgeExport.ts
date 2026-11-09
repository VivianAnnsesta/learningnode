import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { buildKnowledgeExportArchive, KnowledgeExportArchiveError } from "../exports/knowledgeExportArchive";
import { NodeTeachingError } from "./nodeTeaching";
import { personalKnowledgeBaseWhere } from "./personalKnowledgeService";
import { knowledgeViewScopeIssue } from "./savedKnowledgeViewService";
import { compareRecordIds, compareRecordTitles, matchRecordSearch, readRecordAliases } from "./recordNames";
import { createKnowledgeDateMatcher, recordSourceCategory } from "./knowledgeViewContracts";
import {
  KNOWLEDGE_EXPORT_FORMAT, KNOWLEDGE_EXPORT_MAX_BYTES, KNOWLEDGE_EXPORT_MAX_FILES, KNOWLEDGE_EXPORT_TIMEOUT_MS,
  knowledgeExportEffectiveFilters, parseKnowledgeExportRequest,
  type KnowledgeExportGraphNode, type KnowledgeExportRecord, type KnowledgeExportRequest,
  type KnowledgeExportRevision, type KnowledgeExportSnapshot
} from "./knowledgeExportContracts";
import { knowledgeExportCaptureBudget, runKnowledgeExportOperation, type KnowledgeExportControl } from "./knowledgeExportControl";

const revisionColumns = { id: true, knowledgePointId: true, sequence: true, title: true, body: true, sourceType: true, sourcesJson: true, aliasesJson: true, recordDate: true, recordDateTimeZone: true, createdAt: true } satisfies Prisma.KnowledgePointRevisionSelect;
const pointColumns = { id: true, domainId: true, currentRevisionId: true, recordKind: true, title: true, userUnderstanding: true, coreEssence: true, createdAt: true, updatedAt: true, currentRevision: { select: revisionColumns } } satisfies Prisma.KnowledgePointSelect;
const graphColumns = { id: true, domainId: true, knowledgePointId: true, title: true, nodeType: true, status: true, createdAt: true, updatedAt: true } satisfies Prisma.KnowledgeGraphNodeSelect;
const relationColumns = { id: true, domainId: true, fromNodeId: true, toNodeId: true, fromKnowledgePointId: true, toKnowledgePointId: true, relationType: true, detail: true, status: true, evidenceStrength: true, userExplanation: true, aiAssessment: true, applicability: true, misuseRisk: true, legacyVariantsJson: true, createdAt: true } satisfies Prisma.KnowledgeGraphEdgeSelect;
type PointRow = Prisma.KnowledgePointGetPayload<{ select: typeof pointColumns }>;
const chunks = function* (ids: string[]) { for (let index = 0; index < ids.length; index += 128) yield ids.slice(index, index + 128); };
const mismatch = () => new NodeTeachingError("记录的当前修订身份或归属不一致，导出已停止；原数据未改变。", 503);
function verifyCurrent(row: { id: string; currentRevisionId: string | null; currentRevision: { id: string; knowledgePointId: string } | null }) {
  if (row.currentRevisionId ? !row.currentRevision || row.currentRevision.id !== row.currentRevisionId || row.currentRevision.knowledgePointId !== row.id : row.currentRevision !== null) throw mismatch();
}
const revision = (row: Prisma.KnowledgePointRevisionGetPayload<{ select: typeof revisionColumns }>): KnowledgeExportRevision => ({ ...row, createdAt: row.createdAt.toISOString() });
const graphNode = (row: Prisma.KnowledgeGraphNodeGetPayload<{ select: typeof graphColumns }>): KnowledgeExportGraphNode => ({ ...row, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() });

type CaptureOptions = Partial<KnowledgeExportControl> & { afterSelection?: () => Promise<void>; exportedAt?: Date };

/** Internal read-only boundary; hooks are available to native transaction tests, never HTTP. */
export async function capturePersonalKnowledgeExport(request: KnowledgeExportRequest, options: CaptureOptions = {}): Promise<KnowledgeExportSnapshot> {
  const check = () => {
    options.check?.();
    if (options.signal?.aborted) throw new NodeTeachingError("导出准备已取消。", 499);
    if (options.deadline !== undefined && Date.now() >= options.deadline) throw new NodeTeachingError("导出准备超过30秒。", 504);
  };
  check();
  const effectiveFilters = knowledgeExportEffectiveFilters(request), matcher = effectiveFilters ? createKnowledgeDateMatcher(effectiveFilters.date) : null;
  const snapshot: KnowledgeExportSnapshot = {
    format: KNOWLEDGE_EXPORT_FORMAT, formatVersion: 1, exportedAt: (options.exportedAt || new Date()).toISOString(), request: structuredClone(request),
    effectiveFilters, effectiveDateWindow: matcher?.window || null, orderedRecordIds: [], records: [], collections: [], memberships: [], domains: [], nodeLinks: [], nodes: [], graphNodes: [], relations: [], externalEndpoints: [], externalNodes: []
  };
  const budget = knowledgeExportCaptureBudget(snapshot);
  let fileCount = 2;
  const file = () => { if (++fileCount > KNOWLEDGE_EXPORT_MAX_FILES) throw new NodeTeachingError("导出文件数超过ZIP格式上限，请缩小范围或关闭历史修订。", 413); };
  return prisma.$transaction(async tx => {
    const selected: { id: string; title: string; updatedAt: Date }[] = [];
    if (effectiveFilters) {
      const issue = await knowledgeViewScopeIssue(effectiveFilters, tx); check();
      if (issue) throw new NodeTeachingError(issue, 409);
      const where = personalKnowledgeBaseWhere(effectiveFilters);
      let cursor: string | undefined;
      for (;;) {
        check();
        const rows = await tx.knowledgePoint.findMany({ where: { AND: [where, ...(cursor ? [{ id: { gt: cursor } }] : [])] }, orderBy: { id: "asc" }, take: 128, select: {
          id: true, title: true, currentRevisionId: true, createdAt: true, updatedAt: true, ...(effectiveFilters.q ? { userUnderstanding: true, coreEssence: true } : {}),
          currentRevision: { select: { id: true, knowledgePointId: true, title: true, sourceType: true, recordDate: true, recordDateTimeZone: true, ...(effectiveFilters.q ? { body: true, aliasesJson: true } : {}) } }
        } }); check();
        for (const row of rows) {
          verifyCurrent(row);
          if (effectiveFilters.sourceType && recordSourceCategory(row.currentRevision?.sourceType) !== effectiveFilters.sourceType || !matcher!.matches({ ...row, recordDate: row.currentRevision?.recordDate ?? null, recordDateTimeZone: row.currentRevision?.recordDateTimeZone ?? null })) continue;
          const title = row.currentRevision ? row.currentRevision.title : row.title;
          if (effectiveFilters.q && !matchRecordSearch({ title, body: row.currentRevision ? row.currentRevision.body || "" : row.userUnderstanding || row.coreEssence || "", aliases: readRecordAliases(row.currentRevision?.aliasesJson) }, effectiveFilters.q).matches) continue;
          file(); budget.append(snapshot.orderedRecordIds, row.id); selected.push({ id: row.id, title, updatedAt: row.updatedAt });
        }
        if (rows.length < 128) break;
        cursor = rows[rows.length - 1].id;
      }
      selected.sort((a, b) => (effectiveFilters.sort === "title_asc" ? compareRecordTitles(a.title, b.title) : b.updatedAt.getTime() - a.updatedAt.getTime()) || compareRecordIds(a.id, b.id));
      const positions = new Map(selected.map((row, index) => [row.id, index])); snapshot.orderedRecordIds.sort((a, b) => positions.get(a)! - positions.get(b)!);
    } else {
      const row = await tx.knowledgePoint.findUnique({ where: { id: request.scope.mode === "record" ? request.scope.pointId : "" }, select: { id: true, currentRevisionId: true, currentRevision: { select: { id: true, knowledgePointId: true } } } }); check();
      if (!row) throw new NodeTeachingError("个人记录不存在，无法导出。", 404);
      verifyCurrent(row);
      file(); budget.append(snapshot.orderedRecordIds, row.id);
    }
    if (options.afterSelection) { await options.afterSelection(); check(); }
    const recordMap = new Map<string, KnowledgeExportRecord>(), domainIds = new Set<string>(), groupIds = new Set<string>(), nodeIds = new Set<string>(), outsidePointIds = new Set<string>(), relationNodeIds = new Set<string>();
    const domain = (id: string | null) => { if (id) domainIds.add(id); };
    const addPoint = (row: PointRow) => {
      verifyCurrent(row); domain(row.domainId);
      const record: KnowledgeExportRecord = { id: row.id, domainId: row.domainId, currentRevisionId: row.currentRevisionId, currentRecordKind: row.recordKind, currentTitle: row.currentRevision ? row.currentRevision.title : row.title, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), legacyFallback: row.currentRevision ? null : { title: row.title, userUnderstanding: row.userUnderstanding, coreEssence: row.coreEssence }, revisions: [] };
      budget.append(snapshot.records, record); recordMap.set(record.id, record);
      if (!request.includeHistory && row.currentRevision) budget.append(record.revisions, revision(row.currentRevision));
    };
    let rawLowerBound = 0;
    for (const ids of chunks(snapshot.orderedRecordIds)) {
      // Required raw UTF-8 strings are a lower bound on their JSON representation.
      // Check inside SQLite before transferring a potentially oversized source row.
      check();
      const sizes = await tx.$queryRaw<{ bytes: bigint }[]>(Prisma.sql`
        SELECT COALESCE((SELECT SUM(
          length(CAST(r.id AS BLOB)) + length(CAST(r.knowledgePointId AS BLOB)) + length(CAST(r.title AS BLOB)) +
          length(CAST(r.body AS BLOB)) + length(CAST(r.sourceType AS BLOB)) + length(CAST(r.sourcesJson AS BLOB)) +
          length(CAST(r.aliasesJson AS BLOB)) + COALESCE(length(CAST(r.recordDate AS BLOB)),0) + COALESCE(length(CAST(r.recordDateTimeZone AS BLOB)),0)
        ) FROM KnowledgePointRevision r WHERE r.knowledgePointId IN (${Prisma.join(ids)})
          ${request.includeHistory ? Prisma.empty : Prisma.sql`AND r.id IN (SELECT currentRevisionId FROM KnowledgePoint WHERE id IN (${Prisma.join(ids)}))`}),0)
        + COALESCE((SELECT SUM(length(CAST(p.id AS BLOB)) + COALESCE(length(CAST(p.domainId AS BLOB)),0) + length(CAST(p.recordKind AS BLOB)) +
          CASE WHEN p.currentRevisionId IS NULL THEN length(CAST(p.title AS BLOB)) + COALESCE(length(CAST(p.userUnderstanding AS BLOB)),0) + COALESCE(length(CAST(p.coreEssence AS BLOB)),0) ELSE 0 END)
          FROM KnowledgePoint p WHERE p.id IN (${Prisma.join(ids)})),0) AS bytes`);
      check(); rawLowerBound += Number(sizes[0]?.bytes || 0);
      if (rawLowerBound > KNOWLEDGE_EXPORT_MAX_BYTES) throw new NodeTeachingError("导出原始内容超过64 MiB，请缩小范围或关闭历史修订后重试。", 413);
      check(); const points = await tx.knowledgePoint.findMany({ where: { id: { in: ids } }, select: pointColumns, orderBy: { id: "asc" } }); check();
      if (points.length !== ids.length) throw mismatch(); points.forEach(addPoint);
      if (request.includeHistory) {
        let cursor: string | undefined;
        for (;;) {
          check(); const rows = await tx.knowledgePointRevision.findMany({ where: { knowledgePointId: { in: ids }, ...(cursor ? { id: { gt: cursor } } : {}) }, select: revisionColumns, take: 128, orderBy: { id: "asc" } }); check();
          for (const row of rows) { const owner = recordMap.get(row.knowledgePointId)!; if (row.id !== owner.currentRevisionId) file(); budget.append(owner.revisions, revision(row)); }
          if (rows.length < 128) break; cursor = rows[rows.length - 1].id;
        }
      }
      let memberCursor: { groupNodeId: string; knowledgePointId: string } | undefined;
      for (;;) {
        check(); const rows = await tx.knowledgeGraphMembership.findMany({ where: { knowledgePointId: { in: ids }, ...(memberCursor ? { OR: [{ groupNodeId: { gt: memberCursor.groupNodeId } }, { groupNodeId: memberCursor.groupNodeId, knowledgePointId: { gt: memberCursor.knowledgePointId } }] } : {}) }, select: { groupNodeId: true, knowledgePointId: true, createdAt: true }, orderBy: [{ groupNodeId: "asc" }, { knowledgePointId: "asc" }], take: 128 }); check();
        for (const row of rows) { groupIds.add(row.groupNodeId); budget.append(snapshot.memberships, { ...row, createdAt: row.createdAt.toISOString() }); }
        if (rows.length < 128) break; memberCursor = rows[rows.length - 1];
      }
      let nodeCursor: { nodeId: string; knowledgePointId: string } | undefined;
      for (;;) {
        check(); const rows = await tx.learningNodeKnowledgePoint.findMany({ where: { knowledgePointId: { in: ids }, ...(nodeCursor ? { OR: [{ nodeId: { gt: nodeCursor.nodeId } }, { nodeId: nodeCursor.nodeId, knowledgePointId: { gt: nodeCursor.knowledgePointId } }] } : {}) }, select: { nodeId: true, knowledgePointId: true, createdAt: true }, orderBy: [{ nodeId: "asc" }, { knowledgePointId: "asc" }], take: 128 }); check();
        for (const row of rows) { nodeIds.add(row.nodeId); budget.append(snapshot.nodeLinks, { ...row, createdAt: row.createdAt.toISOString() }); }
        if (rows.length < 128) break; nodeCursor = rows[rows.length - 1];
      }
      let graphCursor: string | undefined;
      for (;;) {
        check(); const rows = await tx.knowledgeGraphNode.findMany({ where: { knowledgePointId: { in: ids }, ...(graphCursor ? { id: { gt: graphCursor } } : {}) }, select: graphColumns, orderBy: { id: "asc" }, take: 128 }); check();
        for (const row of rows) { domain(row.domainId); budget.append(snapshot.graphNodes, graphNode(row)); }
        if (rows.length < 128) break; graphCursor = rows[rows.length - 1].id;
      }
    }
    const selectedIds = new Set(snapshot.orderedRecordIds), relationIds = new Set<string>();
    for (const ids of chunks(snapshot.orderedRecordIds)) {
      let cursor: string | undefined;
      for (;;) {
        check(); const rows = await tx.knowledgeGraphEdge.findMany({ where: { OR: [{ fromKnowledgePointId: { in: ids } }, { toKnowledgePointId: { in: ids } }], ...(cursor ? { id: { gt: cursor } } : {}) }, select: relationColumns, orderBy: { id: "asc" }, take: 128 }); check();
        for (const row of rows) {
          if (relationIds.has(row.id)) continue; relationIds.add(row.id); domain(row.domainId);
          budget.append(snapshot.relations, { ...row, createdAt: row.createdAt.toISOString() });
          for (const id of [row.fromKnowledgePointId, row.toKnowledgePointId]) if (id && !selectedIds.has(id)) outsidePointIds.add(id);
          for (const id of [row.fromNodeId, row.toNodeId]) if (id) relationNodeIds.add(id);
        }
        if (rows.length < 128) break; cursor = rows[rows.length - 1].id;
      }
    }
    for (const ids of chunks([...groupIds])) {
      check(); const rows = await tx.knowledgeGraphNode.findMany({ where: { id: { in: ids } }, select: graphColumns, orderBy: { id: "asc" } }); check();
      for (const row of rows) { domain(row.domainId); budget.append(snapshot.collections, graphNode(row)); }
    }
    for (const ids of chunks([...nodeIds])) {
      check(); const rows = await tx.learningNode.findMany({ where: { id: { in: ids } }, select: { id: true, domainId: true, title: true }, orderBy: { id: "asc" } }); check();
      for (const row of rows) { domain(row.domainId); budget.append(snapshot.nodes, row); }
    }
    for (const ids of chunks([...outsidePointIds])) {
      check(); const rows = await tx.knowledgePoint.findMany({ where: { id: { in: ids } }, select: { id: true, title: true, currentRevisionId: true, currentRevision: { select: { id: true, knowledgePointId: true, title: true } } } }); check();
      const byId = new Map(rows.map(row => [row.id, row]));
      for (const id of ids) { const row = byId.get(id); if (row) verifyCurrent(row); budget.append(snapshot.externalEndpoints, { id, title: row ? row.currentRevision ? row.currentRevision.title : row.title : null }); }
    }
    const includedGraphIds = new Set([...snapshot.graphNodes, ...snapshot.collections].map(row => row.id));
    for (const ids of chunks([...relationNodeIds].filter(id => !includedGraphIds.has(id)))) {
      check(); const rows = await tx.knowledgeGraphNode.findMany({ where: { id: { in: ids } }, select: { id: true, domainId: true, title: true, nodeType: true, status: true }, orderBy: { id: "asc" } }); check();
      for (const row of rows) { domain(row.domainId); budget.append(snapshot.externalNodes, row); }
    }
    for (const ids of chunks([...domainIds])) {
      check(); const rows = await tx.domain.findMany({ where: { id: { in: ids } }, select: { id: true, name: true }, orderBy: { id: "asc" } }); check(); rows.forEach(row => budget.append(snapshot.domains, row));
    }
    const positions = new Map(snapshot.orderedRecordIds.map((id, index) => [id, index])); snapshot.records.sort((a, b) => positions.get(a.id)! - positions.get(b.id)!);
    for (const record of snapshot.records) { record.revisions.sort((a, b) => a.sequence - b.sequence || compareRecordIds(a.id, b.id)); if (record.currentRevisionId && !record.revisions.some(row => row.id === record.currentRevisionId)) throw mismatch(); }
    for (const array of [snapshot.collections, snapshot.domains, snapshot.nodes, snapshot.graphNodes, snapshot.relations, snapshot.externalEndpoints, snapshot.externalNodes]) array.sort((a, b) => compareRecordIds(a.id, b.id));
    snapshot.memberships.sort((a, b) => compareRecordIds(a.groupNodeId, b.groupNodeId) || compareRecordIds(a.knowledgePointId, b.knowledgePointId));
    snapshot.nodeLinks.sort((a, b) => compareRecordIds(a.nodeId, b.nodeId) || compareRecordIds(a.knowledgePointId, b.knowledgePointId));
    check(); return snapshot;
  }, { timeout: Math.max(1, Math.min(KNOWLEDGE_EXPORT_TIMEOUT_MS, (options.deadline ?? Date.now() + KNOWLEDGE_EXPORT_TIMEOUT_MS) - Date.now())) });
}

export async function preparePersonalKnowledgeExport(value: unknown, options: { signal?: AbortSignal } = {}) {
  let request: KnowledgeExportRequest;
  try { request = parseKnowledgeExportRequest(value); }
  catch (error) { throw new NodeTeachingError(error instanceof Error ? error.message : "导出配置无效。"); }
  return runKnowledgeExportOperation(async control => {
    try {
      const snapshot = await capturePersonalKnowledgeExport(request, control); control.check();
      const archive = await buildKnowledgeExportArchive(snapshot, { signal: control.signal, check: control.check }); control.check(); return archive;
    } catch (error) {
      if (error instanceof NodeTeachingError) throw error;
      if (error instanceof KnowledgeExportArchiveError) throw new NodeTeachingError(error.message, error.status);
      throw new NodeTeachingError("个人记录导出暂时不可用，请重试；原记录与草稿保留。", 503);
    }
  }, options);
}
