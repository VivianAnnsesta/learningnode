import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { listPage } from "./listPage";
import { NodeTeachingError } from "./nodeTeaching";

export type RecordReferenceSnapshot = {
  kind: "record";
  knowledgePointId: string;
  revisionId: string;
  title: string;
  body: string;
  sourceType: string;
};

function recordReferences(json: string | null | undefined): RecordReferenceSnapshot[] {
  let sources: unknown;
  try { sources = JSON.parse(json || "[]"); } catch { return []; }
  if (!Array.isArray(sources)) return [];
  return sources.filter((source): source is RecordReferenceSnapshot => !!source && typeof source === "object" &&
    source.kind === "record" && ["knowledgePointId", "revisionId", "title", "body", "sourceType"].every(key => typeof source[key] === "string"));
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

export async function titleOrderedPersonalKnowledgeIds(q: string, domainId: string | undefined, options: { offset: number; limit: number; collectionId?: string; kind?: string }, client: Pick<Prisma.TransactionClient, "$queryRaw"> = prisma) {
  const filters: Prisma.Sql[] = [];
  if (q) filters.push(Prisma.sql`(r.title LIKE '%' || ${q} || '%' OR r.body LIKE '%' || ${q} || '%' OR p.title LIKE '%' || ${q} || '%')`);
  if (options.kind) filters.push(Prisma.sql`p.recordKind = ${options.kind}`);
  if (options.collectionId) filters.push(Prisma.sql`EXISTS (SELECT 1 FROM KnowledgeGraphMembership m WHERE m.knowledgePointId = p.id AND m.groupNodeId = ${options.collectionId})`);
  if (domainId) filters.push(Prisma.sql`(p.domainId = ${domainId}
    OR EXISTS (SELECT 1 FROM LearningNodeKnowledgePoint l JOIN LearningNode n ON n.id = l.nodeId WHERE l.knowledgePointId = p.id AND n.domainId = ${domainId})
    OR EXISTS (SELECT 1 FROM KnowledgeGraphNode g WHERE g.knowledgePointId = p.id AND g.domainId = ${domainId})
    OR EXISTS (SELECT 1 FROM KnowledgeGraphMembership m JOIN KnowledgeGraphNode g ON g.id = m.groupNodeId WHERE m.knowledgePointId = p.id AND g.domainId = ${domainId}))`);
  return client.$queryRaw<{ id: string }[]>(Prisma.sql`
    SELECT p.id FROM KnowledgePoint p LEFT JOIN KnowledgePointRevision r ON r.id = p.currentRevisionId
    WHERE ${filters.length ? Prisma.join(filters, " AND ") : Prisma.sql`1=1`}
    ORDER BY COALESCE(NULLIF(r.title, ''), p.title) COLLATE NOCASE ASC, p.id ASC
    LIMIT ${options.limit} OFFSET ${options.offset}`);
}
