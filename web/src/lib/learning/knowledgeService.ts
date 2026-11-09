import { prisma } from "../prisma";
import { createPersonalRelation, updatePersonalRelation, deletePersonalRelation } from "./personalKnowledgeService";
import { NodeTeachingError } from "./nodeTeaching";
export type KnowledgeBranchInput = {
    title?: string;
    detail?: string;
};
export type KnowledgeWordUpdateInput = {
    word?: string;
    language?: string | null;
    sentenceSample?: string | null;
    coreEssence?: string | null;
    branches?: KnowledgeBranchInput[];
    nodeType?: string | null;
    masteryStatus?: string | null;
    isIsland?: boolean | null;
    islandReason?: string | null;
    userUnderstanding?: string | null;
};
export type KnowledgeWordSearchInput = {
    canvasId?: string | null;
    query?: string | null;
};
export type KnowledgeWordPositionInput = {
    x?: number;
    y?: number;
};
export type KnowledgeRelationUpdateInput = {
    fromWordId?: string;
    toWordId?: string;
    relationType?: string;
    detail?: string | null;
    status?: string | null;
    evidenceStrength?: string | null;
    userExplanation?: string | null;
    aiAssessment?: string | null;
    applicability?: string | null;
    misuseRisk?: string | null;
};
export type KnowledgeRelationCreateOptions = {
    defaultStatus?: string;
    defaultWormholeStatus?: string;
};
export interface KnowledgeRelationDto {
    id: string;
    fromWordId: string;
    toWordId: string;
    relationType: string;
    detail: string | null;
    status: string;
    evidenceStrength: string;
    userExplanation: string | null;
    aiAssessment: string | null;
    applicability: string | null;
    misuseRisk: string | null;
    fromWord: {
        id: string;
        text: string;
        canvasId: string;
        canvas: {
            id: string;
            name: string;
        };
    };
    toWord: {
        id: string;
        text: string;
        canvasId: string;
        canvas: {
            id: string;
            name: string;
        };
    };
    createdAt: Date;
}
export class KnowledgeRelationError extends Error {
    constructor(message: string, public readonly code: "missing_canvas" | "missing_required" | "missing_confirmation" | "invalid_source" | "target_not_found" | "cross_canvas" | "not_found") {
        super(message);
        this.name = "KnowledgeRelationError";
    }
}
export class KnowledgeWordError extends Error {
    constructor(message: string, public readonly code: "missing_canvas" | "missing_word" | "invalid_json" | "not_found" | "invalid_position" | "forbidden_mastery_status") {
        super(message);
        this.name = "KnowledgeWordError";
    }
}
// Compatibility vocabulary is read-only. New content belongs to revisions.
function compat(point: Awaited<ReturnType<typeof readPoint>>) {
    if (!point)
        throw new KnowledgeWordError("记录不存在或不属于当前领域。", "not_found");
    const r = point.currentRevision;
    let branches: {
        title?: string;
        detail?: string;
    }[] = [];
    try {
        const b = JSON.parse(point.manualBranchesJson || '[]');
        branches = Array.isArray(b) ? b : b.branches || [];
    }
    catch { }
    return { id: point.id, text: r?.title || point.title, language: point.language || 'und', sentenceSample: point.sentenceSample, nodeType: 'knowledge', masteryStatus: point.masteryStatus, isIsland: point.isIsland, islandReason: point.islandReason, userUnderstanding: r?.body || point.userUnderstanding, lastReviewedAt: point.lastReviewedAt, nextReviewAt: point.nextReviewAt, reviewIntervalDays: point.reviewIntervalDays, positionX: point.graphNodes?.[0]?.positionX ?? null, positionY: point.graphNodes?.[0]?.positionY ?? null, canvasId: point.domainId || '', createdAt: point.createdAt, updatedAt: point.updatedAt, coreEssences: point.coreEssence ? [{ id: point.id, wordId: point.id, summary: point.coreEssence, rationale: null }] : [], trees: branches.length ? [{ id: point.id + ':tree', wordId: point.id, name: '历史推演', description: null, nodes: branches.map((b, i) => ({ id: point.id + ':branch:' + i, treeId: point.id + ':tree', label: b.title || '历史分支', nodeType: 'branch', content: b.detail || null })), relations: [] }] : [], wordTags: [] };
}
async function readPoint(id: string, domainId?: string) { return prisma.knowledgePoint.findFirst({ where: { id, ...(domainId ? { OR: [{ domainId }, { graphNodes: { some: { domainId } } }, { nodeLinks: { some: { node: { domainId } } } }] } : {}) }, include: { currentRevision: true, graphNodes: true } }); }
export async function searchKnowledgeWords(input: KnowledgeWordSearchInput) { const points = await prisma.knowledgePoint.findMany({ where: { ...(input.canvasId ? { OR: [{ domainId: input.canvasId }, { graphNodes: { some: { domainId: input.canvasId } } }] } : {}), ...(input.query ? { AND: [{ OR: [{ title: { contains: input.query } }, { currentRevision: { title: { contains: input.query } } }] }] } : {}) }, include: { currentRevision: true, graphNodes: true } }); return points.map(compat); }
export async function getKnowledgeWord(id: string, domainId: string) { return compat(await readPoint(id, domainId)); }
const retired = (): never => { throw new NodeTeachingError("兼容写入已退役，请使用个人记录与修订接口。", 410); };
export async function upsertKnowledgeWord(_payload: KnowledgeWordUpdateInput & {
    canvasId?: string | null;
}): Promise<ReturnType<typeof compat>> { return retired(); }
export async function updateKnowledgeWord(_id: string, _domainId: string, _payload: KnowledgeWordUpdateInput): Promise<ReturnType<typeof compat>> { return retired(); }
export async function deleteKnowledgeWord(_id: string, _domainId: string) { return retired(); }
export async function updateKnowledgeWordPosition(_id: string, _domainId: string, _payload: KnowledgeWordPositionInput): Promise<{
    id: string;
    positionX: number | null;
    positionY: number | null;
}> { return retired(); }
const relationInclude = { fromKnowledgePoint: { include: { currentRevision: true, domain: true } }, toKnowledgePoint: { include: { currentRevision: true, domain: true } }, fromNode: { include: { domain: true, knowledgePoint: { include: { currentRevision: true } } } }, toNode: { include: { domain: true, knowledgePoint: { include: { currentRevision: true } } } } } as const;
type Edge = import('@prisma/client').Prisma.KnowledgeGraphEdgeGetPayload<{
    include: typeof relationInclude;
}>;
function compatRelation(e: Edge): KnowledgeRelationDto { const from = e.fromKnowledgePoint || e.fromNode?.knowledgePoint, to = e.toKnowledgePoint || e.toNode?.knowledgePoint; return { id: e.id, fromWordId: from?.id || e.fromNodeId || '', toWordId: to?.id || e.toNodeId || '', relationType: e.relationType, detail: e.detail, status: e.status, evidenceStrength: e.evidenceStrength, userExplanation: e.userExplanation, aiAssessment: e.aiAssessment, applicability: e.applicability, misuseRisk: e.misuseRisk, fromWord: { id: from?.id || e.fromNodeId || '', text: from?.currentRevision?.title || from?.title || e.fromNode?.title || '', canvasId: from?.domainId || e.fromNode?.domainId || '', canvas: e.fromKnowledgePoint?.domain || e.fromNode?.domain || { id: '', name: '未归属领域' } }, toWord: { id: to?.id || e.toNodeId || '', text: to?.currentRevision?.title || to?.title || e.toNode?.title || '', canvasId: to?.domainId || e.toNode?.domainId || '', canvas: e.toKnowledgePoint?.domain || e.toNode?.domain || { id: '', name: '未归属领域' } }, createdAt: e.createdAt }; }
export async function listKnowledgeRelations(domainId: string, pointId?: string | null): Promise<KnowledgeRelationDto[]> { if (!domainId)
    throw new KnowledgeRelationError('领域不能为空。', 'missing_canvas'); const edges = await prisma.knowledgeGraphEdge.findMany({ where: { OR: [{ domainId }, { fromKnowledgePoint: { OR:[{domainId},{graphNodes:{some:{domainId}}},{nodeLinks:{some:{node:{domainId}}}}] } }, { toKnowledgePoint: { OR:[{domainId},{graphNodes:{some:{domainId}}},{nodeLinks:{some:{node:{domainId}}}}] } }], ...(pointId ? { AND: [{ OR: [{ fromKnowledgePointId: pointId }, { toKnowledgePointId: pointId }, { fromNodeId: pointId }, { toNodeId: pointId }] }] } : {}) }, include: relationInclude }); return edges.map(compatRelation); }
export async function assertOwnedKnowledgeRelation(id: string, domainId: string) { const e = await prisma.knowledgeGraphEdge.findUnique({ where: { id }, include: relationInclude }); if (!e || !domainId || (e.domainId !== domainId && !await readPoint(e.fromKnowledgePointId || e.fromNode?.knowledgePointId || '', domainId) && !await readPoint(e.toKnowledgePointId || e.toNode?.knowledgePointId || '', domainId)))
    throw new KnowledgeRelationError('关系不属于当前领域。', 'not_found'); return e; }
export async function createKnowledgeRelation(domainId: string, p: KnowledgeRelationUpdateInput, options: KnowledgeRelationCreateOptions = {}): Promise<KnowledgeRelationDto> { if (!p.fromWordId || !await readPoint(p.fromWordId, domainId))
    throw new KnowledgeRelationError('起点不属于当前领域。', 'invalid_source'); const result = await createPersonalRelation({ fromKnowledgePointId: p.fromWordId, toKnowledgePointId: p.toWordId, type: p.relationType, detail: p.detail || p.userExplanation, applicability: p.applicability, misuseRisk: p.misuseRisk }, (p.status || options.defaultStatus || 'confirmed').includes('candidate')); const e = await prisma.knowledgeGraphEdge.findUnique({ where: { id: result.id }, include: relationInclude }); return compatRelation(e!); }
export async function updateKnowledgeRelation(id: string, domainId: string, p: KnowledgeRelationUpdateInput): Promise<KnowledgeRelationDto> { await assertOwnedKnowledgeRelation(id, domainId); await updatePersonalRelation(id, { action: p.status?.includes('confirmed') ? 'accept' : p.status?.includes('rejected') ? 'reject' : 'edit', detail: p.userExplanation || p.detail, evidenceStrength: p.evidenceStrength }); return compatRelation((await prisma.knowledgeGraphEdge.findUnique({ where: { id }, include: relationInclude }))!); }
export async function deleteKnowledgeRelation(id: string, domainId: string) { await assertOwnedKnowledgeRelation(id, domainId); return deletePersonalRelation(id); }
