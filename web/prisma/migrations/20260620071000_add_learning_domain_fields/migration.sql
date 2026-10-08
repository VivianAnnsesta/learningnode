-- AlterTable
ALTER TABLE "GraphCanvas" ADD COLUMN "goal" TEXT;
ALTER TABLE "GraphCanvas" ADD COLUMN "scope" TEXT;
ALTER TABLE "GraphCanvas" ADD COLUMN "excludedScope" TEXT;
ALTER TABLE "GraphCanvas" ADD COLUMN "depth" TEXT;
ALTER TABLE "GraphCanvas" ADD COLUMN "outputTarget" TEXT;
ALTER TABLE "GraphCanvas" ADD COLUMN "taskBrief" TEXT;
ALTER TABLE "GraphCanvas" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'active';

-- AlterTable
ALTER TABLE "Word" ADD COLUMN "nodeType" TEXT NOT NULL DEFAULT 'knowledge';
ALTER TABLE "Word" ADD COLUMN "masteryStatus" TEXT NOT NULL DEFAULT 'not_started';
ALTER TABLE "Word" ADD COLUMN "isIsland" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Word" ADD COLUMN "islandReason" TEXT;
ALTER TABLE "Word" ADD COLUMN "userUnderstanding" TEXT;

-- AlterTable
ALTER TABLE "WordRelation" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'confirmed';
ALTER TABLE "WordRelation" ADD COLUMN "evidenceStrength" TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE "WordRelation" ADD COLUMN "userExplanation" TEXT;
ALTER TABLE "WordRelation" ADD COLUMN "aiAssessment" TEXT;
ALTER TABLE "WordRelation" ADD COLUMN "applicability" TEXT;
ALTER TABLE "WordRelation" ADD COLUMN "misuseRisk" TEXT;
