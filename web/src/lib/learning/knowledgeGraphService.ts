import { prisma } from "../prisma";
import {
  createKnowledgeRelation,
  deleteKnowledgeRelation,
  listKnowledgeRelations,
  updateKnowledgeRelation,
  type KnowledgeRelationUpdateInput
} from "./knowledgeService";
import { listPersonalKnowledge, listPersonalRelations } from "./personalKnowledgeService";

export type KnowledgeGraphRelationInput = {
  fromKnowledgePointId?: string;
  toKnowledgePointId?: string;
  relationType?: string;
  detail?: string | null;
  status?: string | null;
  evidenceStrength?: string | null;
  userExplanation?: string | null;
  aiAssessment?: string | null;
  applicability?: string | null;
  misuseRisk?: string | null;
};

export type KnowledgeGraphRelationUpdateInput = KnowledgeRelationUpdateInput;

const normalizeOptional = (value?: string | null) => {
  const next = value?.trim();
  return next ? next : null;
};

type CompatBranch = { title?: string; detail?: string };

const parseBranches = (value?: string | null): CompatBranch[] => {
  if (!value?.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    const branches: unknown[] = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray(parsed.branches)
        ? parsed.branches
        : [];
    return branches.filter(
      (branch): branch is CompatBranch => Boolean(branch) && typeof branch === "object"
    );
  } catch {
    return [];
  }
};

const toCompatWord = (
  point: {
    id: string;
    domainId: string | null;
    title: string;
    language: string | null;
    sentenceSample: string | null;
    coreEssence: string | null;
    manualBranchesJson: string | null;
    userUnderstanding: string | null;
    masteryStatus: string;
    isIsland: boolean;
    islandReason: string | null;
    lastReviewedAt: Date | null;
    nextReviewAt: Date | null;
    reviewIntervalDays: number | null;
    createdAt: Date;
    updatedAt: Date;
  },
  graphNode?: {
    nodeType: string;
    positionX: number | null;
    positionY: number | null;
  } | null
) => ({
  id: point.id,
  text: point.title,
  language: point.language || "und",
  sentenceSample: point.sentenceSample,
  nodeType: graphNode?.nodeType || "knowledge",
  masteryStatus: point.masteryStatus,
  isIsland: point.isIsland,
  islandReason: point.islandReason,
  userUnderstanding: point.userUnderstanding,
  lastReviewedAt: point.lastReviewedAt,
  nextReviewAt: point.nextReviewAt,
  reviewIntervalDays: point.reviewIntervalDays,
  positionX: graphNode?.positionX ?? null,
  positionY: graphNode?.positionY ?? null,
  canvasId: point.domainId,
  createdAt: point.createdAt,
  updatedAt: point.updatedAt,
  coreEssences: point.coreEssence
    ? [
        {
          id: point.id,
          wordId: point.id,
          summary: point.coreEssence,
          rationale: null
        }
      ]
    : [],
  wordTags: [],
  trees: parseBranches(point.manualBranchesJson).length
    ? [
        {
          id: `${point.id}:tree`,
          wordId: point.id,
          name: "手动推演",
          description: null,
          nodes: parseBranches(point.manualBranchesJson).map((branch, index) => ({
            id: `${point.id}:branch:${index}`,
            treeId: `${point.id}:tree`,
            label:
              typeof branch?.title === "string" && branch.title.trim()
                ? branch.title.trim()
                : `路径 ${index + 1}`,
            nodeType: "branch",
            content:
              typeof branch?.detail === "string" && branch.detail.trim()
                ? branch.detail.trim()
                : null
          })),
          relations: []
        }
      ]
    : []
});

export async function getKnowledgeGraph(domainId:string){
 const [domain,local,relations,groups]=await Promise.all([prisma.domain.findUnique({where:{id:domainId},select:{id:true,name:true}}),listPersonalKnowledge("",domainId),listPersonalRelations(domainId),prisma.knowledgeGraphNode.findMany({where:{domainId,nodeType:"topic",knowledgePointId:null},include:{memberships:true}})]);
 if(!domain)throw new Error("Domain not found.");
 const ids=[...new Set(relations.relations.flatMap(e=>[e.fromKnowledgePointId,e.toKnowledgePointId]).filter((x):x is string=>!!x))];
 const endpoints=await prisma.knowledgePoint.findMany({where:{id:{in:ids.filter(id=>!local.knowledgePoints.some(p=>p.id===id))}},include:{currentRevision:true}});
 const records=[...local.knowledgePoints.map(p=>({id:p.id,title:p.title,body:p.body,domainId:p.domainId})),...endpoints.map(p=>({id:p.id,title:p.currentRevision?.title||p.title,body:p.currentRevision?.body||"",domainId:p.domainId}))];
 return{domain,nodes:[...records.map(p=>({id:p.id,domainId:p.domainId,title:p.title,type:"knowledge",status:"record",isIsland:!relations.relations.some(e=>e.status==="confirmed"&&(e.fromKnowledgePointId===p.id||e.toKnowledgePointId===p.id)),coreEssence:p.body})),...groups.map(g=>({id:g.id,domainId:g.domainId,title:g.title,type:"topic",status:"confirmed",isIsland:false,coreEssence:null,members:g.memberships.map(m=>m.knowledgePointId)}))],relations:relations.relations.map(e=>({...e,fromKnowledgePointId:e.fromKnowledgePointId!,toKnowledgePointId:e.toKnowledgePointId!,relationType:e.type,fromNode:{id:e.fromKnowledgePointId,text:e.fromTitle},toNode:{id:e.toKnowledgePointId,text:e.toTitle}}))};
}

export async function getLegacyCanvasGraphPayload(canvasId: string) {
  const [points, graphNodes, relations] = await Promise.all([
    prisma.knowledgePoint.findMany({
      where: { domainId: canvasId },
      orderBy: { updatedAt: "desc" }
    }),
    prisma.knowledgeGraphNode.findMany({
      where: { domainId: canvasId }
    }),
    listKnowledgeRelations(canvasId)
  ]);

  const graphNodeByPointId = new Map(
    graphNodes
      .filter((node) => node.knowledgePointId)
      .map((node) => [node.knowledgePointId as string, node])
  );
  const words = points.map((point) =>
    toCompatWord(point, graphNodeByPointId.get(point.id) || null)
  );

  const portalTargets = relations
    .filter(
      (relation) =>
        relation.relationType === "WORMHOLE" &&
        relation.toWord.canvasId !== canvasId
    )
    .map((relation) => ({
      id: relation.toWord.id,
      text: relation.toWord.text,
      language: "und",
      canvasId: relation.toWord.canvasId,
      canvas: {
        name: relation.toWord.canvas.name
      }
    }));

  return { words, relations, portalTargets };
}

export async function createKnowledgeGraphRelation(
  domainId: string,
  input: KnowledgeGraphRelationInput
) {
  if (!input.fromKnowledgePointId?.trim() || !input.toKnowledgePointId?.trim()) {
    throw new Error("fromKnowledgePointId and toKnowledgePointId are required.");
  }

  const relationType = input.relationType?.trim() || "related";

  return createKnowledgeRelation(
    domainId,
    {
      fromWordId: input.fromKnowledgePointId,
      toWordId: input.toKnowledgePointId,
      relationType,
      detail: normalizeOptional(input.detail),
      status: input.status?.trim() || "confirmed",
      evidenceStrength: input.evidenceStrength?.trim() || "unknown",
      userExplanation: normalizeOptional(input.userExplanation),
      aiAssessment: normalizeOptional(input.aiAssessment),
      applicability: normalizeOptional(input.applicability),
      misuseRisk: normalizeOptional(input.misuseRisk)
    },
    {
      defaultStatus: "candidate",
      defaultWormholeStatus: "wormhole_candidate"
    }
  );
}

export async function updateKnowledgeGraphRelation(
  domainId: string,
  relationId: string,
  input: KnowledgeGraphRelationUpdateInput
) {
  return updateKnowledgeRelation(relationId, domainId, input);
}

export async function deleteKnowledgeGraphRelation(
  domainId: string,
  relationId: string
) {
  return deleteKnowledgeRelation(relationId, domainId);
}
