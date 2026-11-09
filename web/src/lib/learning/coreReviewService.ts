import { prisma } from "../prisma";


export type SaveLegacyCoreReviewInput = {
  userRecall?: string;
  oldSampleExplanations?: string | null;
  transferPrompt?: string | null;
  transferExplanation?: string | null;
  aiFeedback?: string | null;
  result?: string | null;
  revisedStatement?: string | null;
  revisionReason?: string | null;
  passed?: boolean;
};

export class LegacyCoreReviewError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "LegacyCoreReviewError";
    this.status = status;
  }
}

const loadKnowledgePoint = async (wordId: string, canvasId: string) =>
  prisma.knowledgePoint.findFirst({
    where: { id: wordId, domainId: canvasId }
  });

export async function getLegacyCoreReview(wordId: string, canvasId: string) {
  const point = await loadKnowledgePoint(wordId, canvasId);

  if (!point?.coreEssence?.trim()) {
    return { core: null, versions: [], reviews: [] };
  }

  const core = {
    id: point.id,
    wordId: point.id,
    summary: point.coreEssence,
    rationale: null
  };

  const [versions, reviews] = await Promise.all([
    prisma.semanticCoreVersion.findMany({
      where: { knowledgePointId: point.id },
      orderBy: { version: "desc" }
    }),
    prisma.coreReviewSession.findMany({
      where: { knowledgePointId: point.id },
      orderBy: { createdAt: "desc" },
      include: {
        transferChallenges: {
          orderBy: { createdAt: "desc" }
        },
        createdVersions: {
          orderBy: { version: "desc" }
        }
      }
    })
  ]);

  return { core, versions, reviews };
}

export async function saveLegacyCoreReview(_wordId: string, _canvasId: string, _payload: SaveLegacyCoreReviewInput): Promise<never> { throw new LegacyCoreReviewError("旧核心复盘仅供回看。请在个人记录中保存新修订。", 410); }
