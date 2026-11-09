import type { Prisma } from "@prisma/client";
import { isDeepStrictEqual } from "node:util";
import { prisma } from "../prisma";
import { runJsonTask } from "../ai/tutorService";
import { AiTaskValidationError } from "../ai/tasks";
import { isSafeExternalUrl } from "../security/externalUrl";
import { NodeTeachingError, teachingObject, teachingText } from "./nodeTeaching";
import { historicalPublicContent, parseSaved } from "./learningSessionService";
import { emptyLearningProgress, publicLearningMaterial, type LearningMaterial, type LearningProgressState } from "./flexibleTeaching";
import { digest } from "./teachingSources";
import { relationKinds } from "./types";
import type { SourceFragment } from "./teachingContracts";
import { historyRecordSnapshot } from "./historyService";
import { listPage } from "./listPage";
import { titleOrderedPersonalKnowledgeIds } from "./personalKnowledgeDiscovery";
import { isRecordReferenceSnapshot, recordReferenceKey, verifyParagraphSelector } from "./recordReferences";
const kinds = ["note", "question", "example", "experience", "excerpt", "understanding"];
const symmetric = new Set(["related", "analogy", "contrast"]);
const contentInclude = { currentRevision: true, nodeLinks: { include: { node: { select: { id: true, domainId: true, title: true } } } }, memberships: { include: { groupNode: { select: { id: true, title: true, domainId: true } } } }, graphNodes: { select: { domainId: true } } } satisfies Prisma.KnowledgePointInclude;
function present(point: Prisma.KnowledgePointGetPayload<{
    include: typeof contentInclude;
}>) { return { id: point.id, domainId: point.domainId, title: point.currentRevision?.title || point.title, body: point.currentRevision?.body || point.userUnderstanding || point.coreEssence || "", kind: point.recordKind, currentRevisionId: point.currentRevisionId, sourceType: point.currentRevision?.sourceType || "legacy_unknown", sources: parseSaved(point.currentRevision?.sourcesJson, []), createdAt: point.createdAt, updatedAt: point.updatedAt, nodes: point.nodeLinks.map(x => x.node), collections: point.memberships.map(x => x.groupNode), domainIds: [...new Set([point.domainId, ...point.nodeLinks.map(x => x.node.domainId), ...point.graphNodes.map(x => x.domainId), ...point.memberships.map(x => x.groupNode.domainId)].filter((x): x is string => !!x))] }; }
export async function listPersonalKnowledge(q = "", domainId?: string, options:{offset?:unknown;limit?:unknown;collectionId?:string;kind?:string;sort?:string}={}) {
    const page=listPage(options.offset,options.limit,300);
    if(options.kind&&!kinds.includes(options.kind))throw new NodeTeachingError("记录类型筛选无效。");
    if(options.sort&&!["updated_desc","title_asc"].includes(options.sort))throw new NodeTeachingError("记录排序方式无效。");
    const where:Prisma.KnowledgePointWhereInput={...(domainId?{OR:[{domainId},{nodeLinks:{some:{node:{domainId}}}},{graphNodes:{some:{domainId}}},{memberships:{some:{groupNode:{domainId}}}}]}:{}),...(options.collectionId?{memberships:{some:{groupNodeId:options.collectionId}}}:{}),...(options.kind?{recordKind:options.kind}:{}),...(q?{AND:[{OR:[{currentRevision:{title:{contains:q}}},{currentRevision:{body:{contains:q}}},{title:{contains:q}}]}]}:{})};
    if(options.sort==="title_asc")return prisma.$transaction(async tx=>{
        const ids=await titleOrderedPersonalKnowledgeIds(q,domainId,{...page,collectionId:options.collectionId,kind:options.kind},tx);
        const [points,total]=await Promise.all([tx.knowledgePoint.findMany({where:{id:{in:ids.map(row=>row.id)}},include:contentInclude}),tx.knowledgePoint.count({where})]);
        const byId=new Map(points.map(point=>[point.id,point]));
        return {knowledgePoints:ids.map(row=>present(byId.get(row.id)!)),page:{...page,total,nextOffset:page.offset+points.length<total?page.offset+points.length:null}};
    });
    const [points,total]=await prisma.$transaction([prisma.knowledgePoint.findMany({where,include:contentInclude,orderBy:[{updatedAt:"desc"},{id:"asc"}],skip:page.offset,take:page.limit}),prisma.knowledgePoint.count({where})]);
    return {knowledgePoints:points.map(present),page:{...page,total,nextOffset:page.offset+points.length<total?page.offset+points.length:null}};
}
export async function getPersonalKnowledge(id: string) { const p = await prisma.knowledgePoint.findUnique({ where: { id }, include: contentInclude }); if (!p)
    throw new NodeTeachingError("个人记录不存在。", 404); const revisions = await prisma.knowledgePointRevision.findMany({ where: { knowledgePointId: id }, orderBy: { sequence: "desc" } }); const relations = await prisma.knowledgeGraphEdge.findMany({ where: { OR: [{ fromKnowledgePointId: id }, { toKnowledgePointId: id }] }, include: { fromKnowledgePoint: { include: { currentRevision: true } }, toKnowledgePoint: { include: { currentRevision: true } } } }); return { knowledgePoint: present(p), revisions: revisions.map(r => ({ ...r, sources: parseSaved(r.sourcesJson, []) })), relations: relations.map(relationView) }; }
async function sourceSnapshots(v: unknown) {
    if (v === undefined)
        return [];
    if (!Array.isArray(v) || v.length > 30)
        throw new NodeTeachingError("来源引用不合法。");
    const result: Record<string, unknown>[] = [];
    for (const raw of v) {
        const s = teachingObject(raw);
        if (s.kind === "session") {
            const session = await prisma.nodeTeachingSession.findUnique({ where: { id: String(s.sessionId) } });
            if (!session)
                throw new NodeTeachingError("来源会话不存在。");
            const snapshot: Record<string, unknown> = { kind: "session", sessionId: session.id, lessonVersion: session.lessonVersion, context: parseSaved(session.contextJson, {}), framework: historicalPublicContent(parseSaved(session.lessonJson, null)) };
            if (s.segmentId) {
                const segment = await prisma.teachingSegment.findFirst({ where: { id: String(s.segmentId), sessionId: session.id } });
                if (!segment || segment.version !== s.materialVersion)
                    throw new NodeTeachingError("来源材料版本不匹配。", 409);
                const material=parseSaved<LearningMaterial|null>(segment.materialJson,null), progress={...emptyLearningProgress(),...parseSaved<Partial<LearningProgressState>>(session.progressJson,{})};
                Object.assign(snapshot, { segmentId: segment.id, materialVersion: segment.version, material: material?.schemaVersion===4?publicLearningMaterial(material,segment.id,segment.version,progress):historicalPublicContent(material), sources: parseSaved(segment.sourceSnapshotJson, []) });
            }
            if (s.interactionId) {
                const interaction = await prisma.teachingInteraction.findFirst({ where: { id: String(s.interactionId), sessionId: session.id } });
                if (!interaction)
                    throw new NodeTeachingError("来源交互不属于当前会话。");
                snapshot.interaction = { id: interaction.id, input: interaction.input, kind: interaction.kind, response: parseSaved(interaction.responseJson, null), assistance: interaction.assistance, segmentId: interaction.segmentId, materialVersion: interaction.materialVersion };
            }
            result.push(snapshot);
        }
        else if (s.kind === "record") {
            const r = await prisma.knowledgePointRevision.findFirst({ where: { id: String(s.revisionId), knowledgePointId: String(s.knowledgePointId) } });
            if (!r)
                throw new NodeTeachingError("引用的个人记录修订不存在。");
            let selector;
            if (Object.prototype.hasOwnProperty.call(s, "selector")) {
                try { selector = await verifyParagraphSelector(r.body, s.selector); }
                catch (error) { throw new NodeTeachingError(error instanceof Error ? error.message : "段落选择器无效。"); }
            }
            result.push({ kind: "record", knowledgePointId: r.knowledgePointId, revisionId: r.id, title: r.title, body: r.body, sourceType: r.sourceType, ...(selector ? { selector } : {}) });
        }
        else if (s.kind === "source") {
            const source = await prisma.teachingSource.findFirst({ where: { sessionId: String(s.sessionId), id: String(s.sourceId) } });
            if (!source)
                throw new NodeTeachingError("实际来源片段不存在。");
            const f = parseSaved<SourceFragment[]>(source.fragmentsJson, []).find(x => x.id === s.fragmentId);
            if (!f)
                throw new NodeTeachingError("来源没有提供该片段。");
            result.push({ kind: "source", sessionId: source.sessionId, sourceId: source.id, fragment: f, limitation: source.limitation });
        }
        else if (s.kind === "external") {
            const url = teachingText(s.url, "来源网址", 2000);
            if (!isSafeExternalUrl(url))
                throw new NodeTeachingError("来源只接受安全 HTTPS 地址。");
            result.push({ kind: "external", url, title: teachingText(s.title || url, "来源标题", 500), quote: teachingText(s.quote || "", "摘录", 12000, true), obtained: false, limitation: "用户声明的来源；正文尚未由系统取得。" });
        }
        else if (s.kind === "history")
            result.push(await historyRecordSnapshot(String(s.sourceId), String(s.recordId), typeof s.recordTable === "string" ? s.recordTable : undefined));
        else
            throw new NodeTeachingError("来源类型无效。");
    }
    const recordKeys = new Set<string>();
    return result.filter(source => {
        if (!isRecordReferenceSnapshot(source)) return true;
        const key = recordReferenceKey(source);
        if (recordKeys.has(key)) return false;
        recordKeys.add(key);
        return true;
    });
}
function recordInput(v: unknown) { const d = teachingObject(v); const kind = String(d.kind || "understanding"); if (!kinds.includes(kind))
    throw new NodeTeachingError("记录类型无效。"); const sourceType = String(d.sourceType || "user"); if (!["user", "accepted_ai", "excerpt"].includes(sourceType))
    throw new NodeTeachingError("来源分类无效。"); if (sourceType === "accepted_ai" && d.acceptAiContent !== true)
    throw new NodeTeachingError("请明确接受 AI 内容后再保存。"); return { d, title: teachingText(d.title, "记录标题", 500), body: teachingText(d.body, "个人内容", 24000), kind, sourceType }; }
async function addReferences(tx: Prisma.TransactionClient, id: string, d: Record<string, unknown>) {
    if (Array.isArray(d.nodeIds)) {
        for (const nodeId of d.nodeIds) {
            const node = await tx.learningNode.findUnique({ where: { id: String(nodeId) } });
            if (!node)
                throw new NodeTeachingError("引用的任务不存在。");
            await tx.learningNodeKnowledgePoint.upsert({ where: { nodeId_knowledgePointId: { nodeId: node.id, knowledgePointId: id } }, create: { nodeId: node.id, knowledgePointId: id }, update: {} });
        }
    }
    const domains = Array.isArray(d.domainIds) ? d.domainIds : [];
    if (typeof d.domainId === "string")
        domains.push(d.domainId);
    for (const raw of [...new Set(domains)]) {
        const domainId = String(raw);
        if (!await tx.domain.findUnique({ where: { id: domainId } }))
            throw new NodeTeachingError("引用领域不存在。");
        if (!await tx.knowledgeGraphNode.findFirst({ where: { domainId, knowledgePointId: id } }))
            await tx.knowledgeGraphNode.create({ data: { domainId, knowledgePointId: id, title: "", status: "confirmed" } });
    }
}
export async function createPersonalKnowledge(value: unknown) {
    const {d,title,body,kind,sourceType}=recordInput(value),requestId=teachingText(d.requestId,"保存请求标识",160);
    const auditId=`record-save:${digest(requestId)}`,inputHash=digest({title,body,kind,sourceType,domainId:d.domainId||null,nodeIds:d.nodeIds||[],domainIds:d.domainIds||[],sessionId:d.sessionId||null,sources:d.sources||[]});
    const prior=await prisma.learningProgress.findUnique({where:{id:auditId}});
    if(prior){const p=parseSaved<{inputHash:string;knowledgePointId:string}>(prior.payloadJson,{} as {inputHash:string;knowledgePointId:string});if(p.inputHash!==inputHash)throw new NodeTeachingError("此保存标识已用于另一份内容。",409);return getPersonalKnowledge(p.knowledgePointId);}
    const sources=await sourceSnapshots(d.sources);
    const id=await prisma.$transaction(async tx=>{
        const prior=await tx.learningProgress.findUnique({where:{id:auditId}});
        if(prior){const p=parseSaved<{inputHash:string;knowledgePointId:string}>(prior.payloadJson,{} as {inputHash:string;knowledgePointId:string});if(p.inputHash!==inputHash)throw new NodeTeachingError("此保存标识已用于另一份内容。",409);return p.knowledgePointId;}
        const session=d.sessionId?await tx.nodeTeachingSession.findUnique({where:{id:String(d.sessionId)}}):null;
        if(d.sessionId&&!session)throw new NodeTeachingError("关联学习会话不存在。");
        const point=await tx.knowledgePoint.create({data:{domainId:typeof d.domainId==="string"?d.domainId:null,recordKind:kind,masteryStatus:"seen"}});
        const revision=await tx.knowledgePointRevision.create({data:{knowledgePointId:point.id,sequence:1,title,body,sourceType,sourcesJson:JSON.stringify(sources)}});
        await tx.knowledgePoint.update({where:{id:point.id},data:{currentRevisionId:revision.id}});await addReferences(tx,point.id,d);
        await tx.learningProgress.create({data:{id:auditId,domainId:session?.domainId||point.domainId,nodeId:session?.nodeId||null,status:"record_saved",payloadJson:JSON.stringify({requestId,inputHash,sessionId:session?.id||null,knowledgePointId:point.id,revisionId:revision.id})}});
        return point.id;
    });
    return getPersonalKnowledge(id);
}
async function revisionSourceSnapshots(id: string, d: Record<string, unknown>) {
    if (d.sources === undefined) return [];
    if (!Array.isArray(d.sources) || d.sources.length > 30) throw new NodeTeachingError("来源引用不合法。");
    if (typeof d.expectedRevisionId !== "string") throw new NodeTeachingError("请提供当前修订身份。", 409);
    const revision = await prisma.knowledgePointRevision.findFirst({ where: { id: d.expectedRevisionId, knowledgePointId: id } });
    if (!revision) throw new NodeTeachingError("记录修订不存在或不属于当前记录。", 409);
    const saved = parseSaved<unknown>(revision.sourcesJson, []), prior = Array.isArray(saved) ? saved : [];
    const preservedSources = d.sources.map(input => {
        if (input && typeof input === "object" && !Array.isArray(input) && input.kind === "retained") {
            const index = input.sourceIndex;
            if (typeof index !== "number" || !Number.isSafeInteger(index) || index < 0 || index >= prior.length)
                throw new NodeTeachingError("保留来源的索引无效。");
            const source = prior[index];
            if (!source || typeof source !== "object" || Array.isArray(source)) throw new NodeTeachingError("保留来源不是有效快照。");
            return source as Record<string, unknown>;
        }
        const preserved = prior.find(source => isDeepStrictEqual(source, input));
        return preserved && typeof preserved === "object" && !Array.isArray(preserved) ? preserved as Record<string, unknown> : null;
    });
    const recordKeys = new Set(preservedSources.filter(isRecordReferenceSnapshot).map(recordReferenceKey));
    const result: Record<string, unknown>[] = [];
    for (const [index, input] of d.sources.entries()) {
        const preserved = preservedSources[index];
        if (preserved) { result.push(preserved); continue; }
        for (const source of await sourceSnapshots([input])) {
            if (isRecordReferenceSnapshot(source)) {
                const key = recordReferenceKey(source);
                if (recordKeys.has(key)) continue;
                recordKeys.add(key);
            }
            result.push(source);
        }
    }
    return result;
}
export async function revisePersonalKnowledge(id: string, value: unknown) { const { d, title, body, kind, sourceType } = recordInput(value), sources = await revisionSourceSnapshots(id, d); await prisma.$transaction(async (tx) => { const point = await tx.knowledgePoint.findUnique({ where: { id } }); if (!point)
    throw new NodeTeachingError("个人记录不存在。", 404); if (typeof d.expectedRevisionId !== "string" || point.currentRevisionId !== d.expectedRevisionId)
    throw new NodeTeachingError("记录已有新修订，请回看并合并自己的内容。", 409); const latest = await tx.knowledgePointRevision.findFirst({ where: { knowledgePointId: id }, orderBy: { sequence: "desc" } }); const r = await tx.knowledgePointRevision.create({ data: { knowledgePointId: id, sequence: (latest?.sequence || 0) + 1, title, body, sourceType, sourcesJson: JSON.stringify(d.sources === undefined ? parseSaved(latest?.sourcesJson, []) : sources) } }); if (!(await tx.knowledgePoint.updateMany({ where: { id, currentRevisionId: d.expectedRevisionId }, data: { currentRevisionId: r.id, recordKind: kind } })).count)
    throw new NodeTeachingError("另一个窗口已保存新版本。", 409); await addReferences(tx, id, d); }); return getPersonalKnowledge(id); }
export async function linkPersonalKnowledge(id: string, value: unknown) { const d = teachingObject(value); if (!await prisma.knowledgePoint.findUnique({ where: { id } }))
    throw new NodeTeachingError("记录不存在。", 404); await prisma.$transaction(tx => addReferences(tx, id, d)); return getPersonalKnowledge(id); }
export async function deletePersonalKnowledge(id: string, value: unknown) { const d = teachingObject(value); if (d.confirmPermanent !== true)
    throw new NodeTeachingError("永久删除会清除该记录修订、主题成员及相关关系，需明确确认。"); await prisma.$transaction(async (tx) => { await tx.knowledgeGraphEdge.deleteMany({ where: { OR: [{ fromKnowledgePointId: id }, { toKnowledgePointId: id }] } }); await tx.knowledgeGraphNode.deleteMany({ where: { knowledgePointId: id } }); await tx.knowledgePoint.update({ where: { id }, data: { currentRevisionId: null } }); await tx.knowledgePoint.delete({ where: { id } }); }); return { deleted: true }; }
type RelationRow = Prisma.KnowledgeGraphEdgeGetPayload<{
    include: {
        fromKnowledgePoint: {
            include: {
                currentRevision: true;
            };
        };
        toKnowledgePoint: {
            include: {
                currentRevision: true;
            };
        };
    };
}>;
function relationView(e: RelationRow) { return { id: e.id, domainId: e.domainId, fromKnowledgePointId: e.fromKnowledgePointId, toKnowledgePointId: e.toKnowledgePointId, fromTitle: e.fromKnowledgePoint?.currentRevision?.title || e.fromKnowledgePoint?.title || "历史端点", toTitle: e.toKnowledgePoint?.currentRevision?.title || e.toKnowledgePoint?.title || "历史端点", type: e.relationType, detail: e.detail, status: e.status, evidenceStrength: e.evidenceStrength, aiAssessment: e.aiAssessment, userExplanation: e.userExplanation, applicability: e.applicability, misuseRisk: e.misuseRisk }; }
export async function listPersonalRelations(domainId?: string) { return { relations: (await prisma.knowledgeGraphEdge.findMany({ where: { ...(domainId ? { OR: [{ domainId }, { fromKnowledgePoint: { OR:[{domainId},{graphNodes:{some:{domainId}}},{nodeLinks:{some:{node:{domainId}}}}] } }, { toKnowledgePoint: { OR:[{domainId},{graphNodes:{some:{domainId}}},{nodeLinks:{some:{node:{domainId}}}}] } }] } : {}), fromKnowledgePointId: { not: null }, toKnowledgePointId: { not: null } }, include: { fromKnowledgePoint: { include: { currentRevision: true } }, toKnowledgePoint: { include: { currentRevision: true } } }, orderBy: { createdAt: "desc" } })).map(relationView) }; }
export async function createPersonalRelation(value: unknown, candidate = false, endpointRevisions?: { id: string; revisionId: string | null }[]) {
    const d = teachingObject(value); let from = teachingText(d.fromKnowledgePointId, '起点', 160), to = teachingText(d.toKnowledgePointId, '终点', 160);
    const type = String(d.type || 'related');
    if (from === to || !relationKinds.includes(type as typeof relationKinds[number])) throw new NodeTeachingError('关系端点或类型无效。');
    if (symmetric.has(type) && from > to) [from, to] = [to, from];
    return prisma.$transaction(async tx => {
        const points = await tx.knowledgePoint.findMany({ where: { id: { in: [from, to] } } });
        if (points.length !== 2) throw new NodeTeachingError('关系必须连接两个已保存的个人记录。');
        const identity = { fromKnowledgePointId: from, toKnowledgePointId: to, relationType: type };
        const existing = await tx.knowledgeGraphEdge.findUnique({ where: { fromKnowledgePointId_toKnowledgePointId_relationType: identity } });
        const detail = teachingText(d.detail || '用户建立的联系', '关系说明', 10000);
        if (existing) {
            if (!candidate && existing.status !== 'confirmed') await tx.knowledgeGraphEdge.update({ where: { id: existing.id }, data: { status: 'confirmed', detail, userExplanation: detail } });
            return { id: existing.id, existing: true };
        }
        const e = await tx.knowledgeGraphEdge.create({ data: { ...identity, domainId: points[0].domainId === points[1].domainId ? points[0].domainId : null, status: candidate ? 'candidate' : 'confirmed', detail, userExplanation: candidate ? null : detail, evidenceStrength: 'unknown', aiAssessment: candidate ? JSON.stringify({ proposal: d, endpointRevisions: endpointRevisions?.filter(p => p.id === from || p.id === to) || points.map(p => ({ id: p.id, revisionId: p.currentRevisionId })) }) : null, applicability: typeof d.applicability === 'string' ? d.applicability : null, misuseRisk: typeof d.misuseRisk === 'string' ? d.misuseRisk : null } });
        return { id: e.id, existing: false };
    });
}
export async function updatePersonalRelation(id: string, value: unknown) {
    const d = teachingObject(value), edge = await prisma.knowledgeGraphEdge.findUnique({ where: { id } });
    if (!edge || !edge.fromKnowledgePointId || !edge.toKnowledgePointId)
        throw new NodeTeachingError("关系不存在或属于只读旧记录。", 404);
    if (d.action === "accept" && edge.status === "candidate") {
        const proposal = parseSaved<{
            endpointRevisions?: {
                id: string;
                revisionId: string;
            }[];
        }>(edge.aiAssessment, {});
        for (const ref of proposal.endpointRevisions || []) {
            if ((await prisma.knowledgePoint.findUnique({ where: { id: ref.id } }))?.currentRevisionId !== ref.revisionId)
                throw new NodeTeachingError("端点内容已修订，请重新评估候选关系。", 409);
        }
    }
    if (!["accept", "reject", "edit"].includes(String(d.action)))
        throw new NodeTeachingError("关系操作无效。");
    return { relation: await prisma.knowledgeGraphEdge.update({ where: { id }, data: { ...(d.action === "accept" ? { status: "confirmed" } : d.action === "reject" ? { status: "rejected" } : {}), ...(typeof d.detail === "string" ? { detail: teachingText(d.detail, "关系说明", 10000), userExplanation: d.detail } : {}), ...(typeof d.evidenceStrength === "string" && ["unknown", "weak", "medium", "strong"].includes(d.evidenceStrength) ? { evidenceStrength: d.evidenceStrength } : {}) } }) };
}
export async function deletePersonalRelation(id: string) { await prisma.knowledgeGraphEdge.delete({ where: { id } }); return { deleted: true }; }
export async function suggestPersonalRelations(value: unknown) { const d = teachingObject(value); if (!Array.isArray(d.knowledgePointIds) || d.knowledgePointIds.length < 2 || d.knowledgePointIds.length > 12)
    throw new NodeTeachingError("请选择2至12条记录。"); const points = await prisma.knowledgePoint.findMany({ where: { id: { in: d.knowledgePointIds.map(String) } }, include: { currentRevision: true } }); if (points.length !== d.knowledgePointIds.length)
    throw new NodeTeachingError("部分记录不存在。"); const result = await runJsonTask({ taskType: "relation_candidate_generation", inputSummary: "个人记录关系建议", promptVersion: "personal-relations-v2", userPrompt: `只提出有实际理由的普通联系，可跨领域。不必使用 WORMHOLE。不虚构相似性。引用实际 ID，说明关系、适用边界和不确定性；不改变正式网络。type必须严格使用一个协议值：${JSON.stringify(relationKinds)}，不能填写中文标签或自创类型。共享讨论维度可用 related；结构比较可用 analogy；因果与推导需要对应理由。fromKnowledgePointId与toKnowledgePointId必须是下面两个不同的真实记录ID，不得以标题代替。记录：${JSON.stringify(points.map(p => ({ id: p.id, title: p.currentRevision?.title, body: p.currentRevision?.body })))}\n返回 {relations:[{fromKnowledgePointId,toKnowledgePointId,type,detail,applicability,misuseRisk,uncertainty}]}。允许返回空数组。`, validate: v => {
      const invalid=(message:string,code:string,path:string):never=>{throw new AiTaskValidationError(message,[{code,path,message}]);};
      const x = teachingObject(v); if (!Array.isArray(x.relations) || x.relations.length > 20) invalid("关系建议必须为不超过20项的relations数组。","invalid_relations","$.relations");
      return (x.relations as unknown[]).map((raw,index) => { const e = teachingObject(raw);
        if (!points.some(p => p.id === e.fromKnowledgePointId) || !points.some(p => p.id === e.toKnowledgePointId) || e.fromKnowledgePointId === e.toKnowledgePointId) invalid("关系建议必须引用提供列表中的两个不同记录ID，不能替换端点身份。","unknown_relation_endpoint",`$.relations[${index}]`);
        if (!relationKinds.includes(String(e.type) as typeof relationKinds[number])) invalid(`关系类型${String(e.type)}不在支持的协议值中：${relationKinds.join(",")}。只修正类型，保留原端点和理由。`,"unknown_relation_type",`$.relations[${index}].type`);
        return { ...e, detail: teachingText(e.detail, "关系理由", 6000) };
      });
    } }); const candidates = []; for (const e of result.data)
    candidates.push(await createPersonalRelation(e, true, points.map(p=>({id:p.id,revisionId:p.currentRevisionId})))); return { candidates, aiCallLogId: result.log.id }; }
export async function listKnowledgeCollections() { return { collections: await prisma.knowledgeGraphNode.findMany({ where: { nodeType: "topic", knowledgePointId: null }, include: { memberships: { include: { knowledgePoint: { include: { currentRevision: true } } } } }, orderBy: { updatedAt: "desc" } }) }; }
export async function createKnowledgeCollection(value: unknown) { const d = teachingObject(value); return { collection: await prisma.knowledgeGraphNode.create({ data: { title: teachingText(d.title, "主题名称", 300), nodeType: "topic", status: "confirmed", domainId: typeof d.domainId === "string" ? d.domainId : null } }) }; }
export async function updateKnowledgeCollection(id: string, value: unknown) { const d = teachingObject(value); const group = await prisma.knowledgeGraphNode.findFirst({ where: { id, nodeType: "topic", knowledgePointId: null } }); if (!group)
    throw new NodeTeachingError("主题不存在。", 404); if (typeof d.title === "string")
    await prisma.knowledgeGraphNode.update({ where: { id }, data: { title: teachingText(d.title, "主题名称", 300) } }); if (d.knowledgePointId) {
    const knowledgePointId = String(d.knowledgePointId);
    if (!await prisma.knowledgePoint.findUnique({ where: { id: knowledgePointId } }))
        throw new NodeTeachingError("记录不存在。", 404);
    if (d.action === "remove")
        await prisma.knowledgeGraphMembership.deleteMany({ where: { groupNodeId: id, knowledgePointId } });
    else
        await prisma.knowledgeGraphMembership.upsert({ where: { groupNodeId_knowledgePointId: { groupNodeId: id, knowledgePointId } }, create: { groupNodeId: id, knowledgePointId }, update: {} });
} return listKnowledgeCollections(); }
export async function deleteKnowledgeCollection(id: string) { const g = await prisma.knowledgeGraphNode.findFirst({ where: { id, nodeType: "topic", knowledgePointId: null } }); if (!g)
    throw new NodeTeachingError("主题不存在。", 404); await prisma.knowledgeGraphNode.delete({ where: { id } }); return { deleted: true }; }
