import { prisma } from "../prisma";
import { buildReviewSchedule } from "./reviewSchedule";

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

const normalizeOptional = (value?: string | null) => {
  const next = value?.trim();
  return next ? next : null;
};

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

export async function saveLegacyCoreReview(
  wordId: string,
  canvasId: string,
  payload: SaveLegacyCoreReviewInput
) {
  const userRecall = payload.userRecall?.trim();
  if (!userRecall) {
    throw new LegacyCoreReviewError("用户回忆不能为空。");
  }

  const transferPrompt = normalizeOptional(payload.transferPrompt);
  const transferExplanation = normalizeOptional(payload.transferExplanation);
  if ((transferPrompt && !transferExplanation) || (!transferPrompt && transferExplanation)) {
    throw new LegacyCoreReviewError("迁移题目和迁移解释需要同时填写。");
  }

  const point = await loadKnowledgePoint(wordId, canvasId);

  if (!point || !point.coreEssence?.trim()) {
    throw new LegacyCoreReviewError("请先保存核心本质，再进行复盘。");
  }

  const schedule = buildReviewSchedule({
    masteryStatus: point.masteryStatus,
    isIsland: point.isIsland,
    previousIntervalDays: point.reviewIntervalDays
  });

  return prisma.$transaction(async (tx) => {
    const latestVersion = await tx.semanticCoreVersion.findFirst({
      where: { knowledgePointId: point.id },
      orderBy: { version: "desc" }
    });

    let nextVersion = latestVersion?.version ?? 0;
    let latestStatement = latestVersion?.statement ?? point.coreEssence ?? "";
    let initialVersion = null;

    if (!latestVersion) {
      nextVersion = 1;
      initialVersion = await tx.semanticCoreVersion.create({
        data: {
          knowledgePointId: point.id,
          version: nextVersion,
          statement: point.coreEssence!,
          revisionReason: "初始化版本"
        }
      });
    }

    const review = await tx.coreReviewSession.create({
      data: {
        knowledgePointId: point.id,
        userRecall,
        oldSampleExplanations: normalizeOptional(payload.oldSampleExplanations),
        transferExplanations: transferExplanation,
        aiFeedback: normalizeOptional(payload.aiFeedback),
        result: normalizeOptional(payload.result)
      }
    });

    let challenge = null;
    if (transferPrompt && transferExplanation) {
      challenge = await tx.transferChallenge.create({
        data: {
          reviewSessionId: review.id,
          prompt: transferPrompt,
          userExplanation: transferExplanation,
          aiAssessment: normalizeOptional(payload.aiFeedback),
          passed: Boolean(payload.passed)
        }
      });
    }

    let createdVersion = null;
    const revisedStatement = normalizeOptional(payload.revisedStatement);
    if (revisedStatement && revisedStatement !== latestStatement) {
      nextVersion += 1;
      createdVersion = await tx.semanticCoreVersion.create({
        data: {
          knowledgePointId: point.id,
          version: nextVersion,
          statement: revisedStatement,
          revisionReason: normalizeOptional(payload.revisionReason),
          sourceReviewId: review.id
        }
      });
      latestStatement = revisedStatement;
      await tx.knowledgePoint.update({
        where: { id: point.id },
        data: { coreEssence: revisedStatement }
      });
    }

    await tx.knowledgePoint.update({
      where: { id: point.id },
      data: {
        lastReviewedAt: schedule.lastReviewedAt,
        nextReviewAt: schedule.nextReviewAt,
        reviewIntervalDays: schedule.reviewIntervalDays
      }
    });

    return {
      review,
      challenge,
      initialVersion,
      createdVersion,
      schedule,
      core: {
        id: point.id,
        wordId: point.id,
        summary: latestStatement,
        rationale: null
      }
    };
  });
}
