import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { listPage } from "./listPage";
import { NodeTeachingError } from "./nodeTeaching";
import { isRecordReferenceSnapshot, type RecordReferenceSnapshot } from "./recordReferences";
import { compareRecordIds, readRecordAliases, recordMention, recordNames } from "./recordNames";
export type { RecordReferenceSnapshot } from "./recordReferences";

function recordReferences(json: string | null | undefined): RecordReferenceSnapshot[] {
  let sources: unknown;
  try { sources = JSON.parse(json || "[]"); } catch { return []; }
  if (!Array.isArray(sources)) return [];
  return sources.filter(isRecordReferenceSnapshot);
}

// Guard both the container and each entry: historical sources may contain malformed
// JSON or scalar entries, and json_extract must never receive those scalar strings.
const backlinkPredicate = (id: string) => Prisma.sql`EXISTS (
  SELECT 1 FROM json_each(
    CASE WHEN json_valid(r.sourcesJson) THEN
      CASE WHEN json_type(r.sourcesJson) = 'array' THEN r.sourcesJson ELSE '[]' END
      ELSE '[]' END
  ) AS source
  WHERE json_extract(CASE WHEN source.type = 'object' THEN source.value ELSE '{}' END, '$.kind') = 'record'
    AND json_extract(CASE WHEN source.type = 'object' THEN source.value ELSE '{}' END, '$.knowledgePointId') = ${id}
    AND json_type(CASE WHEN source.type = 'object' THEN source.value ELSE '{}' END, '$.revisionId') = 'text'
    AND json_type(CASE WHEN source.type = 'object' THEN source.value ELSE '{}' END, '$.title') = 'text'
    AND json_type(CASE WHEN source.type = 'object' THEN source.value ELSE '{}' END, '$.body') = 'text'
    AND json_type(CASE WHEN source.type = 'object' THEN source.value ELSE '{}' END, '$.sourceType') = 'text'
    AND (json_type(CASE WHEN source.type = 'object' THEN source.value ELSE '{}' END, '$.selector') IS NULL OR (
      json_type(CASE WHEN source.type = 'object' THEN source.value ELSE '{}' END, '$.selector') = 'object'
      AND json_extract(CASE WHEN source.type = 'object' THEN source.value ELSE '{}' END, '$.selector.type') = 'paragraph-v1'
      AND json_type(CASE WHEN source.type = 'object' THEN source.value ELSE '{}' END, '$.selector.start') IN ('integer', 'real')
      AND json_type(CASE WHEN source.type = 'object' THEN source.value ELSE '{}' END, '$.selector.end') IN ('integer', 'real')
      AND CAST(json_extract(CASE WHEN source.type = 'object' THEN source.value ELSE '{}' END, '$.selector.start') AS INTEGER) = json_extract(CASE WHEN source.type = 'object' THEN source.value ELSE '{}' END, '$.selector.start')
      AND CAST(json_extract(CASE WHEN source.type = 'object' THEN source.value ELSE '{}' END, '$.selector.end') AS INTEGER) = json_extract(CASE WHEN source.type = 'object' THEN source.value ELSE '{}' END, '$.selector.end')
      AND json_extract(CASE WHEN source.type = 'object' THEN source.value ELSE '{}' END, '$.selector.start') >= 0
      AND json_extract(CASE WHEN source.type = 'object' THEN source.value ELSE '{}' END, '$.selector.end') > json_extract(CASE WHEN source.type = 'object' THEN source.value ELSE '{}' END, '$.selector.start')
      AND json_extract(CASE WHEN source.type = 'object' THEN source.value ELSE '{}' END, '$.selector.start') <= 9007199254740991
      AND json_extract(CASE WHEN source.type = 'object' THEN source.value ELSE '{}' END, '$.selector.end') <= 9007199254740991
      AND json_type(CASE WHEN source.type = 'object' THEN source.value ELSE '{}' END, '$.selector.quoteHash') = 'text'
      -- SQLite 3.41 can truncate decoded JSON strings at NUL. Inspect the hash's
      -- JSON text before decoding; NUL in the quoted body or excerpt stays valid.
      AND instr((CASE WHEN source.type = 'object' THEN source.value ELSE '{}' END -> '$.selector.quoteHash'), char(92) || 'u0000') = 0
      AND length(CAST(json_extract(CASE WHEN source.type = 'object' THEN source.value ELSE '{}' END, '$.selector.quoteHash') AS BLOB)) = 64
      AND instr(json_extract(CASE WHEN source.type = 'object' THEN source.value ELSE '{}' END, '$.selector.quoteHash'), char(0)) = 0
      AND json_extract(CASE WHEN source.type = 'object' THEN source.value ELSE '{}' END, '$.selector.quoteHash') NOT GLOB '*[^0-9a-f]*'
      AND json_type(CASE WHEN source.type = 'object' THEN source.value ELSE '{}' END, '$.selector.quote') = 'text'
    ))
)`;

export async function getPersonalKnowledgeContext(id: string, options: { offset?: unknown; limit?: unknown } = {}) {
  const page = listPage(options.offset, options.limit, 20);
  return prisma.$transaction(async tx => {
    const point = await tx.knowledgePoint.findUnique({ where: { id }, include: { currentRevision: true } });
    if (!point) throw new NodeTeachingError("个人记录不存在。", 404);
    const predicate = backlinkPredicate(id);
    const totals = await tx.$queryRaw<{ total: bigint }[]>(Prisma.sql`
      SELECT COUNT(*) AS total FROM KnowledgePoint p
      JOIN KnowledgePointRevision r ON r.id = p.currentRevisionId
      WHERE ${predicate}`);
    const rows = await tx.$queryRaw<{ id: string; title: string; body: string; revisionId: string; sourcesJson: string }[]>(Prisma.sql`
      SELECT p.id, r.title, substr(r.body, 1, 800) AS body, r.id AS revisionId, r.sourcesJson
      FROM KnowledgePoint p JOIN KnowledgePointRevision r ON r.id = p.currentRevisionId
      WHERE ${predicate}
      ORDER BY p.updatedAt DESC, p.id ASC LIMIT ${page.limit} OFFSET ${page.offset}`);
    const total = Number(totals[0]?.total || 0);
    return {
      outgoing: recordReferences(point.currentRevision?.sourcesJson),
      backlinks: {
        items: rows.map(({ sourcesJson, ...row }) => ({ ...row, sources: recordReferences(sourcesJson).filter(source => source.knowledgePointId === id) })),
        page: { ...page, total, nextOffset: page.offset + rows.length < total ? page.offset + rows.length : null }
      }
    };
  });
}

const pointSelection = { id: true, title: true, recordKind: true, currentRevision: { select: { title: true } } } satisfies Prisma.KnowledgePointSelect;
const edgeSelection = {
  id: true, fromKnowledgePointId: true, toKnowledgePointId: true, relationType: true, detail: true, status: true,
  fromKnowledgePoint: { select: pointSelection }, toKnowledgePoint: { select: pointSelection }
} satisfies Prisma.KnowledgeGraphEdgeSelect;
type GraphPoint = Prisma.KnowledgePointGetPayload<{ select: typeof pointSelection }>;
type GraphEdge = Prisma.KnowledgeGraphEdgeGetPayload<{ select: typeof edgeSelection }>;
const graphPoint = (point: GraphPoint, distance: number) => ({ id: point.id, title: point.currentRevision?.title || point.title, kind: point.recordKind, distance });
const graphEdge = (edge: GraphEdge) => ({ id: edge.id, fromKnowledgePointId: edge.fromKnowledgePointId!, toKnowledgePointId: edge.toKnowledgePointId!, type: edge.relationType, detail: edge.detail, status: edge.status });

export async function getPersonalKnowledgeNeighborhood(id: string, rawDepth?: unknown) {
  const depth = rawDepth === undefined || rawDepth === null || rawDepth === "" ? 1 : Number(rawDepth);
  if (depth !== 1 && depth !== 2) throw new NodeTeachingError("局部联系深度只接受 1 或 2。");
  return prisma.$transaction(async tx => {
    const point = await tx.knowledgePoint.findUnique({ where: { id }, select: pointSelection });
    if (!point) throw new NodeTeachingError("个人记录不存在。", 404);
    const nodes = new Map([[id, graphPoint(point, 0)]]), edges = new Map<string, ReturnType<typeof graphEdge>>();
    const examined = new Set<string>(), truncated = { nodes: false, edges: false };
    let frontier = [id];
    const origins: string[] = [];
    for (let distance = 1; distance <= depth && frontier.length; distance++) {
      origins.push(...frontier);
      const rows = await tx.knowledgeGraphEdge.findMany({
        where: { status: "confirmed", fromKnowledgePointId: { not: null }, toKnowledgePointId: { not: null },
          ...(examined.size ? { id: { notIn: [...examined] } } : {}),
          OR: [{ fromKnowledgePointId: { in: frontier } }, { toKnowledgePointId: { in: frontier } }] },
        select: edgeSelection, orderBy: { id: "asc" }, take: 121
      });
      if (rows.length > 120) { truncated.edges = true; truncated.nodes = true; }
      const next: string[] = [];
      for (const edge of rows.slice(0, 120)) {
        examined.add(edge.id);
        if (!edge.fromKnowledgePoint || !edge.toKnowledgePoint) continue;
        const additions = [edge.fromKnowledgePoint, edge.toKnowledgePoint].filter(endpoint => !nodes.has(endpoint.id));
        if (nodes.size + additions.length > 80) { truncated.nodes = true; truncated.edges = true; continue; }
        if (edges.size >= 120) { truncated.edges = true; if (additions.length) truncated.nodes = true; continue; }
        for (const endpoint of additions) { nodes.set(endpoint.id, graphPoint(endpoint, distance)); next.push(endpoint.id); }
        edges.set(edge.id, graphEdge(edge));
      }
      frontier = next;
    }
    // Include confirmed links between visible peers as well as the discovery paths.
    const ids = [...nodes.keys()];
    const peers = await tx.knowledgeGraphEdge.findMany({
      where: { status: "confirmed", fromKnowledgePointId: { in: ids }, toKnowledgePointId: { in: ids },
        ...(edges.size ? { id: { notIn: [...edges.keys()] } } : {}) },
      select: edgeSelection, orderBy: { id: "asc" }, take: 121 - edges.size
    });
    for (const edge of peers) {
      if (edges.size >= 120) { truncated.edges = true; break; }
      edges.set(edge.id, graphEdge(edge));
    }
    truncated.nodes = !!await tx.knowledgeGraphEdge.findFirst({ where: {
      status: "confirmed", fromKnowledgePointId: { not: null }, toKnowledgePointId: { not: null },
      OR: [{ fromKnowledgePointId: { in: origins }, toKnowledgePointId: { notIn: ids } },
        { toKnowledgePointId: { in: origins }, fromKnowledgePointId: { notIn: ids } }]
    }, select: { id: true } });
    return { nodes: [...nodes.values()], edges: [...edges.values()], depth, truncated };
  });
}

export async function titleOrderedPersonalKnowledgeIds(domainId: string | undefined, options: { offset: number; limit: number; collectionId?: string; kind?: string }, client: Pick<Prisma.TransactionClient, "$queryRaw"> = prisma) {
  const filters: Prisma.Sql[] = [];
  if (options.kind) filters.push(Prisma.sql`p.recordKind = ${options.kind}`);
  if (options.collectionId) filters.push(Prisma.sql`EXISTS (SELECT 1 FROM KnowledgeGraphMembership m WHERE m.knowledgePointId = p.id AND m.groupNodeId = ${options.collectionId})`);
  if (domainId) filters.push(Prisma.sql`(p.domainId = ${domainId}
    OR EXISTS (SELECT 1 FROM LearningNodeKnowledgePoint l JOIN LearningNode n ON n.id = l.nodeId WHERE l.knowledgePointId = p.id AND n.domainId = ${domainId})
    OR EXISTS (SELECT 1 FROM KnowledgeGraphNode g WHERE g.knowledgePointId = p.id AND g.domainId = ${domainId})
    OR EXISTS (SELECT 1 FROM KnowledgeGraphMembership m JOIN KnowledgeGraphNode g ON g.id = m.groupNodeId WHERE m.knowledgePointId = p.id AND g.domainId = ${domainId}))`);
  return client.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT p.id FROM KnowledgePoint p LEFT JOIN KnowledgePointRevision r ON r.id = p.currentRevisionId
    WHERE ${filters.length ? Prisma.join(filters, " AND ") : Prisma.sql`1=1`}
    ORDER BY (CASE WHEN r.id IS NOT NULL THEN r.title ELSE p.title END) COLLATE NOCASE ASC, p.id ASC
    LIMIT ${options.limit} OFFSET ${options.offset}`);
}

export async function getPersonalKnowledgeMentions(id: string, options: { offset?: unknown; limit?: unknown } = {}) {
  const page = listPage(options.offset, options.limit, 20);
  return prisma.$transaction(async tx => {
    const point = await tx.knowledgePoint.findUnique({ where: { id }, select: { id: true, title: true, currentRevision: { select: { id: true, title: true, aliasesJson: true } } } });
    if (!point) throw new NodeTeachingError("个人记录不存在。", 404);
    const target = { id: point.id, title: point.currentRevision ? point.currentRevision.title : point.title, revisionId: point.currentRevision?.id || null, names: point.currentRevision ? recordNames(point.currentRevision.title, readRecordAliases(point.currentRevision.aliasesJson)) : [] };
    if (!point.currentRevision) return { target, mentions: { items: [], page: { ...page, total: 0, nextOffset: null } }, unavailableReason: "这条历史记录没有可引用的当前修订，未引用提及暂不可用。" };
    const matches: { id: string; updatedAt: Date }[] = [];
    let cursor: string | undefined;
    for (;;) {
      const ids = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT p.id FROM KnowledgePoint p JOIN KnowledgePointRevision r ON r.id = p.currentRevisionId
        WHERE p.id <> ${id} AND NOT ${backlinkPredicate(id)} ${cursor ? Prisma.sql`AND p.id > ${cursor}` : Prisma.empty}
        ORDER BY p.id ASC LIMIT 128`);
      const rows = await tx.knowledgePoint.findMany({ where: { id: { in: ids.map(row => row.id) } }, select: { id: true, updatedAt: true, currentRevision: { select: { body: true } } } });
      for (const row of rows) if (row.currentRevision && recordMention(row.currentRevision.body, target.names)) matches.push({ id: row.id, updatedAt: row.updatedAt });
      if (ids.length < 128) break;
      cursor = ids[ids.length - 1].id;
    }
    const ids = matches.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime() || compareRecordIds(a.id, b.id)).slice(page.offset, page.offset + page.limit).map(row => row.id);
    const rows = await tx.knowledgePoint.findMany({ where: { id: { in: ids } }, select: { id: true, currentRevision: { select: { id: true, title: true, body: true } } } }), byId = new Map(rows.map(row => [row.id, row]));
    const items = ids.map(sourceId => {
      const source = byId.get(sourceId);
      const mention = source?.currentRevision && recordMention(source.currentRevision.body, target.names);
      if (!source?.currentRevision || !mention) throw new NodeTeachingError("提及读取状态已变化，请重试。", 503);
      return { id: source.id, title: source.currentRevision.title, revisionId: source.currentRevision.id, ...mention };
    });
    return { target, mentions: { items, page: { ...page, total: matches.length, nextOffset: page.offset + ids.length < matches.length ? page.offset + ids.length : null } } };
  }, { timeout: 30000 });
}
