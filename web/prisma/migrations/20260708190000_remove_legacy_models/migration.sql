-- Remove legacy v0/v1 tables after PRD v1.2 migration is active.
-- This migration preserves data needed by the new model:
--   GraphCanvas -> Domain.legacyCanvasId/domainId
--   RoadmapItem -> LearningNode / Unit
--   Word/CoreEssence -> KnowledgePoint

-- DropIndex
DROP INDEX IF EXISTS "LearningRoadmap_canvasId_idx";

-- DropIndex
DROP INDEX IF EXISTS "NodeRelation_toNodeId_idx";

-- DropIndex
DROP INDEX IF EXISTS "NodeRelation_fromNodeId_idx";

-- DropIndex
DROP INDEX IF EXISTS "NodeRelation_treeId_idx";

-- DropIndex
DROP INDEX IF EXISTS "RoadmapItem_moduleId_orderIndex_key";

-- DropIndex
DROP INDEX IF EXISTS "RoadmapItem_linkedWordId_idx";

-- DropIndex
DROP INDEX IF EXISTS "RoadmapItem_moduleId_idx";

-- DropIndex
DROP INDEX IF EXISTS "RoadmapModule_stageId_orderIndex_key";

-- DropIndex
DROP INDEX IF EXISTS "RoadmapModule_stageId_idx";

-- DropIndex
DROP INDEX IF EXISTS "RoadmapStage_roadmapId_orderIndex_key";

-- DropIndex
DROP INDEX IF EXISTS "RoadmapStage_roadmapId_idx";

-- DropIndex
DROP INDEX IF EXISTS "StageAssessmentRecord_stageId_createdAt_idx";

-- DropIndex
DROP INDEX IF EXISTS "StageAssessmentRecord_roadmapId_createdAt_idx";

-- DropIndex
DROP INDEX IF EXISTS "Tag_name_key";

-- DropIndex
DROP INDEX IF EXISTS "TreeNode_treeId_idx";

-- DropIndex
DROP INDEX IF EXISTS "Word_canvasId_nextReviewAt_idx";

-- DropIndex
DROP INDEX IF EXISTS "Word_text_language_canvasId_key";

-- DropIndex
DROP INDEX IF EXISTS "WordRelation_toWordId_idx";

-- DropIndex
DROP INDEX IF EXISTS "WordRelation_fromWordId_idx";

-- AlterTable
ALTER TABLE "KnowledgePoint" ADD COLUMN "language" TEXT;
ALTER TABLE "KnowledgePoint" ADD COLUMN "lastReviewedAt" DATETIME;
ALTER TABLE "KnowledgePoint" ADD COLUMN "manualBranchesJson" TEXT;
ALTER TABLE "KnowledgePoint" ADD COLUMN "nextReviewAt" DATETIME;
ALTER TABLE "KnowledgePoint" ADD COLUMN "reviewIntervalDays" INTEGER;
ALTER TABLE "KnowledgePoint" ADD COLUMN "sentenceSample" TEXT;

-- CreateTable
CREATE TABLE "UnitAssessmentRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "unitId" TEXT NOT NULL,
    "readiness" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "adjustmentReason" TEXT NOT NULL,
    "appliedRoadmapStatus" TEXT NOT NULL,
    "flaggedItemsSummary" TEXT,
    "nextActionsSummary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UnitAssessmentRecord_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Redefine tables that changed shape.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

CREATE TABLE "new_AiCallLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "canvasId" TEXT,
    "domainId" TEXT,
    "taskType" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "status" TEXT NOT NULL DEFAULT 'success',
    "inputSummary" TEXT,
    "outputSummary" TEXT,
    "errorMessage" TEXT,
    "latencyMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiCallLog_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_AiCallLog" (
  "canvasId",
  "createdAt",
  "domainId",
  "errorMessage",
  "id",
  "inputSummary",
  "latencyMs",
  "model",
  "outputSummary",
  "provider",
  "status",
  "taskType"
)
SELECT
  "canvasId",
  "createdAt",
  COALESCE(
    "domainId",
    (SELECT "id" FROM "Domain" WHERE "legacyCanvasId" = "AiCallLog"."canvasId" LIMIT 1),
    "canvasId"
  ),
  "errorMessage",
  "id",
  "inputSummary",
  "latencyMs",
  "model",
  "outputSummary",
  "provider",
  "status",
  "taskType"
FROM "AiCallLog";
DROP TABLE IF EXISTS "AiCallLog";
ALTER TABLE "new_AiCallLog" RENAME TO "AiCallLog";
CREATE INDEX "AiCallLog_canvasId_idx" ON "AiCallLog"("canvasId");
CREATE INDEX "AiCallLog_domainId_idx" ON "AiCallLog"("domainId");
CREATE INDEX "AiCallLog_taskType_idx" ON "AiCallLog"("taskType");
CREATE INDEX "AiCallLog_status_idx" ON "AiCallLog"("status");

CREATE TABLE "new_CoreReviewSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "knowledgePointId" TEXT,
    "userRecall" TEXT NOT NULL,
    "oldSampleExplanations" TEXT,
    "transferExplanations" TEXT,
    "aiFeedback" TEXT,
    "result" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CoreReviewSession_knowledgePointId_fkey" FOREIGN KEY ("knowledgePointId") REFERENCES "KnowledgePoint" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CoreReviewSession" (
  "aiFeedback",
  "createdAt",
  "id",
  "knowledgePointId",
  "oldSampleExplanations",
  "result",
  "transferExplanations",
  "userRecall"
)
SELECT
  "aiFeedback",
  "createdAt",
  "id",
  (SELECT "wordId" FROM "CoreEssence" WHERE "CoreEssence"."id" = "CoreReviewSession"."coreId" LIMIT 1),
  "oldSampleExplanations",
  "result",
  "transferExplanations",
  "userRecall"
FROM "CoreReviewSession";
DROP TABLE IF EXISTS "CoreReviewSession";
ALTER TABLE "new_CoreReviewSession" RENAME TO "CoreReviewSession";
CREATE INDEX "CoreReviewSession_knowledgePointId_idx" ON "CoreReviewSession"("knowledgePointId");

CREATE TABLE "new_DiagnosticSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "domainId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "summary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DiagnosticSession_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_DiagnosticSession" (
  "createdAt",
  "domainId",
  "id",
  "status",
  "summary",
  "title",
  "updatedAt"
)
SELECT
  "createdAt",
  COALESCE(
    (SELECT "id" FROM "Domain" WHERE "legacyCanvasId" = "DiagnosticSession"."canvasId" LIMIT 1),
    "DiagnosticSession"."canvasId"
  ),
  "id",
  "status",
  "summary",
  "title",
  "updatedAt"
FROM "DiagnosticSession";
DROP TABLE IF EXISTS "DiagnosticSession";
ALTER TABLE "new_DiagnosticSession" RENAME TO "DiagnosticSession";
CREATE INDEX "DiagnosticSession_domainId_idx" ON "DiagnosticSession"("domainId");

CREATE TABLE "new_DiagnosticQuestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "learningNodeId" TEXT,
    "prompt" TEXT NOT NULL,
    "questionType" TEXT NOT NULL DEFAULT 'concept',
    "expectedAnswer" TEXT,
    "orderIndex" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DiagnosticQuestion_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DiagnosticSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DiagnosticQuestion_learningNodeId_fkey" FOREIGN KEY ("learningNodeId") REFERENCES "LearningNode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_DiagnosticQuestion" (
  "createdAt",
  "expectedAnswer",
  "id",
  "learningNodeId",
  "orderIndex",
  "prompt",
  "questionType",
  "sessionId",
  "updatedAt"
)
SELECT
  "createdAt",
  "expectedAnswer",
  "id",
  COALESCE(
    (SELECT "id" FROM "LearningNode" WHERE "LearningNode"."legacyRoadmapItemId" = "DiagnosticQuestion"."roadmapItemId" LIMIT 1),
    (SELECT "id" FROM "LearningNode" WHERE "LearningNode"."id" = "DiagnosticQuestion"."roadmapItemId" LIMIT 1)
  ),
  "orderIndex",
  "prompt",
  "questionType",
  "sessionId",
  "updatedAt"
FROM "DiagnosticQuestion";
DROP TABLE IF EXISTS "DiagnosticQuestion";
ALTER TABLE "new_DiagnosticQuestion" RENAME TO "DiagnosticQuestion";
CREATE INDEX "DiagnosticQuestion_sessionId_idx" ON "DiagnosticQuestion"("sessionId");
CREATE INDEX "DiagnosticQuestion_learningNodeId_idx" ON "DiagnosticQuestion"("learningNodeId");
CREATE UNIQUE INDEX "DiagnosticQuestion_sessionId_orderIndex_key" ON "DiagnosticQuestion"("sessionId", "orderIndex");

CREATE TABLE "new_Domain" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "legacyCanvasId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "currentLevel" TEXT,
    "goal" TEXT,
    "scope" TEXT,
    "excludedScope" TEXT,
    "depth" TEXT,
    "outputType" TEXT,
    "outputTarget" TEXT,
    "taskBrief" TEXT,
    "courseDesignDraft" TEXT,
    "roadmapTitle" TEXT,
    "roadmapStatus" TEXT NOT NULL DEFAULT 'draft',
    "courseDesignStatus" TEXT NOT NULL DEFAULT 'none',
    "courseDesignRepairCount" INTEGER NOT NULL DEFAULT 0,
    "courseDesignConfirmedAt" DATETIME,
    "courseDesignAiCallLogId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Domain" (
  "courseDesignAiCallLogId",
  "courseDesignConfirmedAt",
  "courseDesignDraft",
  "courseDesignRepairCount",
  "courseDesignStatus",
  "createdAt",
  "currentLevel",
  "depth",
  "description",
  "excludedScope",
  "goal",
  "id",
  "legacyCanvasId",
  "name",
  "outputTarget",
  "outputType",
  "roadmapStatus",
  "roadmapTitle",
  "scope",
  "status",
  "taskBrief",
  "updatedAt"
)
SELECT
  "courseDesignAiCallLogId",
  "courseDesignConfirmedAt",
  "courseDesignDraft",
  "courseDesignRepairCount",
  "courseDesignStatus",
  "createdAt",
  "currentLevel",
  "depth",
  "description",
  "excludedScope",
  "goal",
  "id",
  "legacyCanvasId",
  "name",
  "outputTarget",
  "outputType",
  COALESCE(
    (SELECT "status" FROM "LearningRoadmap" WHERE "LearningRoadmap"."canvasId" = COALESCE("Domain"."legacyCanvasId", "Domain"."id") ORDER BY "updatedAt" DESC LIMIT 1),
    'draft'
  ),
  (SELECT "title" FROM "LearningRoadmap" WHERE "LearningRoadmap"."canvasId" = COALESCE("Domain"."legacyCanvasId", "Domain"."id") ORDER BY "updatedAt" DESC LIMIT 1),
  "scope",
  "status",
  "taskBrief",
  "updatedAt"
FROM "Domain";
DROP TABLE IF EXISTS "Domain";
ALTER TABLE "new_Domain" RENAME TO "Domain";
CREATE UNIQUE INDEX "Domain_legacyCanvasId_key" ON "Domain"("legacyCanvasId");

CREATE TABLE "new_SemanticCoreVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "knowledgePointId" TEXT,
    "version" INTEGER NOT NULL,
    "statement" TEXT NOT NULL,
    "revisionReason" TEXT,
    "sourceReviewId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SemanticCoreVersion_knowledgePointId_fkey" FOREIGN KEY ("knowledgePointId") REFERENCES "KnowledgePoint" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SemanticCoreVersion_sourceReviewId_fkey" FOREIGN KEY ("sourceReviewId") REFERENCES "CoreReviewSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_SemanticCoreVersion" (
  "createdAt",
  "id",
  "knowledgePointId",
  "revisionReason",
  "sourceReviewId",
  "statement",
  "version"
)
SELECT
  "createdAt",
  "id",
  (SELECT "wordId" FROM "CoreEssence" WHERE "CoreEssence"."id" = "SemanticCoreVersion"."coreId" LIMIT 1),
  "revisionReason",
  "sourceReviewId",
  "statement",
  "version"
FROM "SemanticCoreVersion";
DROP TABLE IF EXISTS "SemanticCoreVersion";
ALTER TABLE "new_SemanticCoreVersion" RENAME TO "SemanticCoreVersion";
CREATE INDEX "SemanticCoreVersion_knowledgePointId_version_idx" ON "SemanticCoreVersion"("knowledgePointId", "version");
CREATE INDEX "SemanticCoreVersion_sourceReviewId_idx" ON "SemanticCoreVersion"("sourceReviewId");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- Drop legacy tables after redefinitions finish.
PRAGMA foreign_keys=off;
DROP TABLE IF EXISTS "CoreEssence";
DROP TABLE IF EXISTS "GraphCanvas";
DROP TABLE IF EXISTS "InferenceTree";
DROP TABLE IF EXISTS "LearningRoadmap";
DROP TABLE IF EXISTS "NodeRelation";
DROP TABLE IF EXISTS "NodeTag";
DROP TABLE IF EXISTS "RoadmapItem";
DROP TABLE IF EXISTS "RoadmapModule";
DROP TABLE IF EXISTS "RoadmapStage";
DROP TABLE IF EXISTS "RouteSuggestionCompat";
DROP TABLE IF EXISTS "StageAssessmentRecord";
DROP TABLE IF EXISTS "Tag";
DROP TABLE IF EXISTS "TreeNode";
DROP TABLE IF EXISTS "TreeTag";
DROP TABLE IF EXISTS "Word";
DROP TABLE IF EXISTS "WordRelation";
DROP TABLE IF EXISTS "WordTag";
PRAGMA foreign_keys=on;

-- CreateIndex
CREATE INDEX "UnitAssessmentRecord_unitId_createdAt_idx" ON "UnitAssessmentRecord"("unitId", "createdAt");
