-- Backfill PRD v1.2 semantic models from the legacy learning graph.
-- Legacy tables stay temporarily for canvas/review compatibility; services should use PRD tables.

ALTER TABLE "AiCallLog" ADD COLUMN "domainId" TEXT;
ALTER TABLE "Domain" ADD COLUMN "courseDesignDraft" TEXT;
ALTER TABLE "Domain" ADD COLUMN "courseDesignStatus" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "Domain" ADD COLUMN "courseDesignRepairCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Domain" ADD COLUMN "courseDesignConfirmedAt" DATETIME;
ALTER TABLE "Domain" ADD COLUMN "courseDesignAiCallLogId" TEXT;
ALTER TABLE "LearningNode" ADD COLUMN "moduleTitle" TEXT;
ALTER TABLE "LearningNode" ADD COLUMN "moduleOrderIndex" INTEGER;

CREATE INDEX "AiCallLog_domainId_idx" ON "AiCallLog"("domainId");

INSERT OR IGNORE INTO "Domain" (
  "id",
  "legacyCanvasId",
  "name",
  "description",
  "currentLevel",
  "goal",
  "scope",
  "excludedScope",
  "depth",
  "outputType",
  "outputTarget",
  "taskBrief",
  "courseDesignDraft",
  "courseDesignStatus",
  "courseDesignRepairCount",
  "courseDesignConfirmedAt",
  "courseDesignAiCallLogId",
  "status",
  "createdAt",
  "updatedAt"
)
SELECT
  "id",
  "id",
  "name",
  "description",
  "currentLevel",
  "goal",
  "scope",
  "excludedScope",
  "depth",
  "outputType",
  "outputTarget",
  "taskBrief",
  "courseDesignDraft",
  "courseDesignStatus",
  "courseDesignRepairCount",
  "courseDesignConfirmedAt",
  "courseDesignAiCallLogId",
  "status",
  "createdAt",
  "updatedAt"
FROM "GraphCanvas";

UPDATE "Domain"
SET
  "name" = (SELECT "name" FROM "GraphCanvas" WHERE "GraphCanvas"."id" = COALESCE("Domain"."legacyCanvasId", "Domain"."id")),
  "description" = (SELECT "description" FROM "GraphCanvas" WHERE "GraphCanvas"."id" = COALESCE("Domain"."legacyCanvasId", "Domain"."id")),
  "currentLevel" = (SELECT "currentLevel" FROM "GraphCanvas" WHERE "GraphCanvas"."id" = COALESCE("Domain"."legacyCanvasId", "Domain"."id")),
  "goal" = (SELECT "goal" FROM "GraphCanvas" WHERE "GraphCanvas"."id" = COALESCE("Domain"."legacyCanvasId", "Domain"."id")),
  "scope" = (SELECT "scope" FROM "GraphCanvas" WHERE "GraphCanvas"."id" = COALESCE("Domain"."legacyCanvasId", "Domain"."id")),
  "excludedScope" = (SELECT "excludedScope" FROM "GraphCanvas" WHERE "GraphCanvas"."id" = COALESCE("Domain"."legacyCanvasId", "Domain"."id")),
  "depth" = (SELECT "depth" FROM "GraphCanvas" WHERE "GraphCanvas"."id" = COALESCE("Domain"."legacyCanvasId", "Domain"."id")),
  "outputType" = (SELECT "outputType" FROM "GraphCanvas" WHERE "GraphCanvas"."id" = COALESCE("Domain"."legacyCanvasId", "Domain"."id")),
  "outputTarget" = (SELECT "outputTarget" FROM "GraphCanvas" WHERE "GraphCanvas"."id" = COALESCE("Domain"."legacyCanvasId", "Domain"."id")),
  "taskBrief" = (SELECT "taskBrief" FROM "GraphCanvas" WHERE "GraphCanvas"."id" = COALESCE("Domain"."legacyCanvasId", "Domain"."id")),
  "courseDesignDraft" = (SELECT "courseDesignDraft" FROM "GraphCanvas" WHERE "GraphCanvas"."id" = COALESCE("Domain"."legacyCanvasId", "Domain"."id")),
  "courseDesignStatus" = (SELECT "courseDesignStatus" FROM "GraphCanvas" WHERE "GraphCanvas"."id" = COALESCE("Domain"."legacyCanvasId", "Domain"."id")),
  "courseDesignRepairCount" = (SELECT "courseDesignRepairCount" FROM "GraphCanvas" WHERE "GraphCanvas"."id" = COALESCE("Domain"."legacyCanvasId", "Domain"."id")),
  "courseDesignConfirmedAt" = (SELECT "courseDesignConfirmedAt" FROM "GraphCanvas" WHERE "GraphCanvas"."id" = COALESCE("Domain"."legacyCanvasId", "Domain"."id")),
  "courseDesignAiCallLogId" = (SELECT "courseDesignAiCallLogId" FROM "GraphCanvas" WHERE "GraphCanvas"."id" = COALESCE("Domain"."legacyCanvasId", "Domain"."id")),
  "status" = (SELECT "status" FROM "GraphCanvas" WHERE "GraphCanvas"."id" = COALESCE("Domain"."legacyCanvasId", "Domain"."id")),
  "updatedAt" = (SELECT "updatedAt" FROM "GraphCanvas" WHERE "GraphCanvas"."id" = COALESCE("Domain"."legacyCanvasId", "Domain"."id"))
WHERE EXISTS (
  SELECT 1 FROM "GraphCanvas" WHERE "GraphCanvas"."id" = COALESCE("Domain"."legacyCanvasId", "Domain"."id")
);

INSERT OR IGNORE INTO "Unit" (
  "id",
  "domainId",
  "title",
  "goal",
  "orderIndex",
  "status",
  "createdAt",
  "updatedAt"
)
SELECT
  "RoadmapStage"."id",
  "LearningRoadmap"."canvasId",
  "RoadmapStage"."title",
  "RoadmapStage"."goal",
  "RoadmapStage"."orderIndex",
  'available',
  "RoadmapStage"."createdAt",
  "RoadmapStage"."updatedAt"
FROM "RoadmapStage"
JOIN "LearningRoadmap" ON "LearningRoadmap"."id" = "RoadmapStage"."roadmapId";

INSERT OR IGNORE INTO "KnowledgePoint" (
  "id",
  "domainId",
  "legacyWordId",
  "title",
  "coreEssence",
  "userUnderstanding",
  "masteryStatus",
  "isIsland",
  "islandReason",
  "createdAt",
  "updatedAt"
)
SELECT
  "Word"."id",
  "Word"."canvasId",
  "Word"."id",
  "Word"."text",
  (SELECT "summary" FROM "CoreEssence" WHERE "CoreEssence"."wordId" = "Word"."id" ORDER BY "createdAt" DESC LIMIT 1),
  "Word"."userUnderstanding",
  "Word"."masteryStatus",
  "Word"."isIsland",
  "Word"."islandReason",
  "Word"."createdAt",
  "Word"."updatedAt"
FROM "Word";

INSERT OR IGNORE INTO "LearningNode" (
  "id",
  "domainId",
  "unitId",
  "moduleTitle",
  "moduleOrderIndex",
  "title",
  "nodeType",
  "status",
  "objective",
  "keyQuestion",
  "prerequisite",
  "commonMistake",
  "transferPrompt",
  "orderIndex",
  "legacyRoadmapItemId",
  "knowledgePointId",
  "createdAt",
  "updatedAt"
)
SELECT
  "RoadmapItem"."id",
  "LearningRoadmap"."canvasId",
  "RoadmapStage"."id",
  "RoadmapModule"."title",
  "RoadmapModule"."orderIndex",
  "RoadmapItem"."title",
  'knowledge',
  "RoadmapItem"."status",
  "RoadmapItem"."objective",
  "RoadmapItem"."keyQuestion",
  "RoadmapItem"."prerequisite",
  "RoadmapItem"."commonMistake",
  "RoadmapItem"."transferPrompt",
  ("RoadmapStage"."orderIndex" * 1000000) + ("RoadmapModule"."orderIndex" * 10000) + "RoadmapItem"."orderIndex",
  "RoadmapItem"."id",
  "RoadmapItem"."linkedWordId",
  "RoadmapItem"."createdAt",
  "RoadmapItem"."updatedAt"
FROM "RoadmapItem"
JOIN "RoadmapModule" ON "RoadmapModule"."id" = "RoadmapItem"."moduleId"
JOIN "RoadmapStage" ON "RoadmapStage"."id" = "RoadmapModule"."stageId"
JOIN "LearningRoadmap" ON "LearningRoadmap"."id" = "RoadmapStage"."roadmapId";

INSERT OR IGNORE INTO "KnowledgeGraphNode" (
  "id",
  "domainId",
  "knowledgePointId",
  "title",
  "nodeType",
  "status",
  "positionX",
  "positionY",
  "createdAt",
  "updatedAt"
)
SELECT
  "Word"."id",
  "Word"."canvasId",
  "Word"."id",
  "Word"."text",
  "Word"."nodeType",
  CASE WHEN "Word"."masteryStatus" = 'not_started' THEN 'candidate' ELSE "Word"."masteryStatus" END,
  "Word"."positionX",
  "Word"."positionY",
  "Word"."createdAt",
  "Word"."updatedAt"
FROM "Word";

INSERT OR IGNORE INTO "KnowledgeGraphEdge" (
  "id",
  "domainId",
  "fromNodeId",
  "toNodeId",
  "relationType",
  "detail",
  "status",
  "evidenceStrength",
  "userExplanation",
  "aiAssessment",
  "applicability",
  "misuseRisk",
  "createdAt"
)
SELECT
  "WordRelation"."id",
  "FromWord"."canvasId",
  "WordRelation"."fromWordId",
  "WordRelation"."toWordId",
  "WordRelation"."relationType",
  "WordRelation"."detail",
  "WordRelation"."status",
  "WordRelation"."evidenceStrength",
  "WordRelation"."userExplanation",
  "WordRelation"."aiAssessment",
  "WordRelation"."applicability",
  "WordRelation"."misuseRisk",
  "WordRelation"."createdAt"
FROM "WordRelation"
JOIN "Word" AS "FromWord" ON "FromWord"."id" = "WordRelation"."fromWordId";

UPDATE "AiCallLog"
SET "domainId" = "canvasId"
WHERE "domainId" IS NULL AND "canvasId" IS NOT NULL;
