ALTER TABLE "Unit" ADD COLUMN "planningBlueprintJson" TEXT;

ALTER TABLE "LearningNode" ADD COLUMN "planningQuestionKey" TEXT;

CREATE INDEX "LearningNode_domainId_planningQuestionKey_idx"
ON "LearningNode"("domainId", "planningQuestionKey");

CREATE TABLE "MapDraftQualityReview" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "domainId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "stageKey" TEXT,
    "baseRevision" INTEGER NOT NULL,
    "draftHash" TEXT NOT NULL,
    "courseDesignAiCallLogId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "reportJson" TEXT NOT NULL,
    "aiCallLogIdsJson" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MapDraftQualityReview_domainId_fkey"
      FOREIGN KEY ("domainId") REFERENCES "Domain" ("id")
      ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "MapDraftQualityReview_domainId_createdAt_idx"
ON "MapDraftQualityReview"("domainId", "createdAt");

CREATE INDEX "MapDraftQualityReview_domainId_baseRevision_idx"
ON "MapDraftQualityReview"("domainId", "baseRevision");

CREATE INDEX "MapDraftQualityReview_draftHash_idx"
ON "MapDraftQualityReview"("draftHash");
