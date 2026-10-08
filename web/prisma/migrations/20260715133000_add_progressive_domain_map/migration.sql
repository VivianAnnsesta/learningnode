-- Persist a complete Stage skeleton while allowing detailed Learning Nodes to
-- be expanded and reconciled one Stage at a time.
ALTER TABLE "Domain" ADD COLUMN "roadmapDraftJson" TEXT;
ALTER TABLE "Domain" ADD COLUMN "mapRevision" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Unit" ADD COLUMN "mapKey" TEXT;
ALTER TABLE "Unit" ADD COLUMN "rationale" TEXT;
ALTER TABLE "Unit" ADD COLUMN "moduleDirectionsJson" TEXT;
ALTER TABLE "Unit" ADD COLUMN "prerequisiteStageKeysJson" TEXT;

UPDATE "Unit" SET "mapKey" = "id" WHERE "mapKey" IS NULL OR TRIM("mapKey") = '';

ALTER TABLE "LearningNode" ADD COLUMN "mapKey" TEXT;
UPDATE "LearningNode" SET "mapKey" = "id" WHERE "mapKey" IS NULL OR TRIM("mapKey") = '';

CREATE UNIQUE INDEX "Unit_domainId_mapKey_key" ON "Unit"("domainId", "mapKey");
CREATE UNIQUE INDEX "LearningNode_domainId_mapKey_key" ON "LearningNode"("domainId", "mapKey");
