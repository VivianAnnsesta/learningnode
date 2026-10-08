import { prisma } from "../../../../../lib/prisma";

type ImportedTag = { tag?: { name?: string } };
type ImportedCoreEssence = {
  summary?: string;
  rationale?: string | null;
  versions?: {
    version?: number;
    statement?: string;
    revisionReason?: string | null;
  }[];
  reviewSessions?: {
    userRecall?: string;
    oldSampleExplanations?: string | null;
    transferExplanations?: string | null;
    aiFeedback?: string | null;
    result?: string | null;
    transferChallenges?: {
      prompt?: string;
      userExplanation?: string;
      aiAssessment?: string | null;
      passed?: boolean;
    }[];
  }[];
};
type ImportedWord = {
  id?: string;
  text?: string;
  language?: string | null;
  sentenceSample?: string | null;
  positionX?: number | null;
  positionY?: number | null;
  coreEssences?: ImportedCoreEssence[];
  trees?: {
    id?: string;
    name?: string | null;
    description?: string | null;
    nodes?: {
      id?: string;
      label?: string;
      nodeType?: string;
      content?: string | null;
      tags?: ImportedTag[];
    }[];
    relations?: {
      fromNodeId?: string;
      toNodeId?: string;
      relationType?: string;
      detail?: string | null;
    }[];
    tags?: ImportedTag[];
  }[];
  wordTags?: ImportedTag[];
};

type ImportedRelation = {
  fromWordId?: string;
  toWordId?: string;
  relationType?: string;
  detail?: string | null;
};

const normalizeOptional = (value?: string | null) => {
  const next = value?.trim();
  return next ? next : null;
};

const normalizeBranches = (word: ImportedWord) => {
  const nodes = word.trees?.flatMap((tree) => tree.nodes || []) || [];
  return nodes
    .map((node, index) => ({
      title: node.label?.trim() || `路径 ${index + 1}`,
      detail: normalizeOptional(node.content)
    }))
    .filter((branch) => branch.title || branch.detail);
};

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  let payload: { words?: ImportedWord[]; relations?: ImportedRelation[] };
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "无效的 JSON" }, { status: 400 });
  }

  const words = payload.words || [];
  const relations = payload.relations || [];

  if (!Array.isArray(words) || !Array.isArray(relations)) {
    return Response.json({ error: "数据格式不正确" }, { status: 400 });
  }

  try {
    const domain = await prisma.domain.findUnique({
      where: { id: params.id }
    });

    if (!domain) {
      return Response.json({ error: "画布不存在" }, { status: 404 });
    }

    const wordIdMap = new Map<string, string>();
    let createdWords = 0;
    let skippedWords = 0;
    let createdRelations = 0;
    let skippedRelations = 0;

    await prisma.$transaction(async (tx) => {
      for (const word of words) {
        const title = word.text?.trim();
        if (!title) continue;
        const language = word.language?.trim() || "und";

        const existing = await tx.knowledgePoint.findFirst({
          where: {
            title,
            language,
            domainId: params.id
          },
          select: { id: true }
        });

        if (existing) {
          if (word.id) wordIdMap.set(word.id, existing.id);
          skippedWords += 1;
          continue;
        }

        const primaryCore = (word.coreEssences || [])
          .map((essence) => essence.summary?.trim() || "")
          .find(Boolean);
        const manualBranches = normalizeBranches(word);

        const createdPoint = await tx.knowledgePoint.create({
          data: {
            domainId: params.id,
            title,
            language,
            sentenceSample: normalizeOptional(word.sentenceSample),
            coreEssence: primaryCore || null,
            manualBranchesJson: manualBranches.length
              ? JSON.stringify(manualBranches)
              : null,
            masteryStatus: "available",
            isIsland: false
          }
        });

        await tx.knowledgeGraphNode.create({
          data: {
            id: createdPoint.id,
            domainId: params.id,
            knowledgePointId: createdPoint.id,
            title,
            nodeType: "knowledge",
            status: "candidate",
            positionX: word.positionX ?? null,
            positionY: word.positionY ?? null
          }
        });

        if (word.id) wordIdMap.set(word.id, createdPoint.id);
        createdWords += 1;

        for (const essence of word.coreEssences || []) {
          const summary = essence.summary?.trim();
          if (!summary) continue;

          const seenVersions = new Set<number>();
          for (const version of essence.versions || []) {
            const statement = version.statement?.trim();
            const versionNumber = Number(version.version);
            if (!statement || !Number.isInteger(versionNumber)) continue;
            if (seenVersions.has(versionNumber)) continue;
            seenVersions.add(versionNumber);
            await tx.semanticCoreVersion.create({
              data: {
                knowledgePointId: createdPoint.id,
                version: versionNumber,
                statement,
                revisionReason: normalizeOptional(version.revisionReason)
              }
            });
          }

          for (const review of essence.reviewSessions || []) {
            const userRecall = review.userRecall?.trim();
            if (!userRecall) continue;
            const createdReview = await tx.coreReviewSession.create({
              data: {
                knowledgePointId: createdPoint.id,
                userRecall,
                oldSampleExplanations:
                  normalizeOptional(review.oldSampleExplanations),
                transferExplanations: normalizeOptional(
                  review.transferExplanations
                ),
                aiFeedback: normalizeOptional(review.aiFeedback),
                result: normalizeOptional(review.result)
              }
            });

            for (const challenge of review.transferChallenges || []) {
              const prompt = challenge.prompt?.trim();
              const userExplanation = challenge.userExplanation?.trim();
              if (!prompt || !userExplanation) continue;
              await tx.transferChallenge.create({
                data: {
                  reviewSessionId: createdReview.id,
                  prompt,
                  userExplanation,
                  aiAssessment: normalizeOptional(challenge.aiAssessment),
                  passed: Boolean(challenge.passed)
                }
              });
            }
          }
        }
      }

      for (const relation of relations) {
        const fromId = relation.fromWordId
          ? wordIdMap.get(relation.fromWordId)
          : null;
        const toId = relation.toWordId ? wordIdMap.get(relation.toWordId) : null;
        if (!fromId || !toId) continue;

        const relationType = relation.relationType?.trim() || "related";
        const existingRelation = await tx.knowledgeGraphEdge.findFirst({
          where: {
            domainId: params.id,
            fromNodeId: fromId,
            toNodeId: toId,
            relationType
          },
          select: { id: true }
        });
        if (existingRelation) {
          skippedRelations += 1;
          continue;
        }

        await tx.knowledgeGraphEdge.create({
          data: {
            domainId: params.id,
            fromNodeId: fromId,
            toNodeId: toId,
            relationType,
            detail: normalizeOptional(relation.detail),
            status: "candidate",
            evidenceStrength: "unknown"
          }
        });
        createdRelations += 1;
      }
    });

    return Response.json({
      ok: true,
      createdWords,
      skippedWords,
      importedRelations: createdRelations,
      skippedRelations
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "导入失败";
    return Response.json({ error: message }, { status: 500 });
  }
}
