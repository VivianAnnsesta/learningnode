-- PRD v1.2 semantic model scaffolding.
-- Existing GraphCanvas/Roadmap/Word data remains the compatibility source during migration.

CREATE TABLE "Domain" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "legacyCanvasId" TEXT,
  "name" TEXT NOT NULL,
  "description" TEXT,
  "goal" TEXT,
  "scope" TEXT,
  "excludedScope" TEXT,
  "depth" TEXT,
  "outputTarget" TEXT,
  "taskBrief" TEXT,
  "status" TEXT NOT NULL DEFAULT 'active',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL
);

CREATE UNIQUE INDEX "Domain_legacyCanvasId_key" ON "Domain"("legacyCanvasId");

CREATE TABLE "Unit" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "domainId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "goal" TEXT,
  "orderIndex" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'available',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "Unit_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "Unit_domainId_orderIndex_key" ON "Unit"("domainId", "orderIndex");
CREATE INDEX "Unit_domainId_idx" ON "Unit"("domainId");

CREATE TABLE "KnowledgePoint" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "domainId" TEXT NOT NULL,
  "legacyWordId" TEXT,
  "title" TEXT NOT NULL,
  "coreEssence" TEXT,
  "userUnderstanding" TEXT,
  "masteryStatus" TEXT NOT NULL DEFAULT 'available',
  "isIsland" BOOLEAN NOT NULL DEFAULT false,
  "islandReason" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "KnowledgePoint_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "KnowledgePoint_legacyWordId_key" ON "KnowledgePoint"("legacyWordId");
CREATE INDEX "KnowledgePoint_domainId_idx" ON "KnowledgePoint"("domainId");

CREATE TABLE "LearningNode" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "domainId" TEXT NOT NULL,
  "unitId" TEXT,
  "title" TEXT NOT NULL,
  "nodeType" TEXT NOT NULL DEFAULT 'knowledge',
  "status" TEXT NOT NULL DEFAULT 'locked',
  "objective" TEXT,
  "keyQuestion" TEXT,
  "prerequisite" TEXT,
  "commonMistake" TEXT,
  "transferPrompt" TEXT,
  "orderIndex" INTEGER NOT NULL,
  "legacyRoadmapItemId" TEXT,
  "knowledgePointId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "LearningNode_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LearningNode_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "LearningNode_knowledgePointId_fkey" FOREIGN KEY ("knowledgePointId") REFERENCES "KnowledgePoint" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "LearningNode_legacyRoadmapItemId_key" ON "LearningNode"("legacyRoadmapItemId");
CREATE INDEX "LearningNode_domainId_orderIndex_idx" ON "LearningNode"("domainId", "orderIndex");
CREATE INDEX "LearningNode_unitId_idx" ON "LearningNode"("unitId");
CREATE INDEX "LearningNode_knowledgePointId_idx" ON "LearningNode"("knowledgePointId");

CREATE TABLE "LearningNodeDependency" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "nodeId" TEXT NOT NULL,
  "prerequisiteId" TEXT NOT NULL,
  CONSTRAINT "LearningNodeDependency_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "LearningNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LearningNodeDependency_prerequisiteId_fkey" FOREIGN KEY ("prerequisiteId") REFERENCES "LearningNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "LearningNodeDependency_nodeId_prerequisiteId_key" ON "LearningNodeDependency"("nodeId", "prerequisiteId");
CREATE INDEX "LearningNodeDependency_prerequisiteId_idx" ON "LearningNodeDependency"("prerequisiteId");

CREATE TABLE "KnowledgeGraphNode" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "domainId" TEXT NOT NULL,
  "knowledgePointId" TEXT,
  "title" TEXT NOT NULL,
  "nodeType" TEXT NOT NULL DEFAULT 'knowledge',
  "status" TEXT NOT NULL DEFAULT 'candidate',
  "positionX" REAL,
  "positionY" REAL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "KnowledgeGraphNode_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "KnowledgeGraphNode_knowledgePointId_fkey" FOREIGN KEY ("knowledgePointId") REFERENCES "KnowledgePoint" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "KnowledgeGraphNode_domainId_idx" ON "KnowledgeGraphNode"("domainId");
CREATE INDEX "KnowledgeGraphNode_knowledgePointId_idx" ON "KnowledgeGraphNode"("knowledgePointId");

CREATE TABLE "KnowledgeGraphEdge" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "domainId" TEXT NOT NULL,
  "fromNodeId" TEXT NOT NULL,
  "toNodeId" TEXT NOT NULL,
  "relationType" TEXT NOT NULL,
  "detail" TEXT,
  "status" TEXT NOT NULL DEFAULT 'candidate',
  "evidenceStrength" TEXT NOT NULL DEFAULT 'unknown',
  "userExplanation" TEXT,
  "aiAssessment" TEXT,
  "applicability" TEXT,
  "misuseRisk" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "KnowledgeGraphEdge_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "KnowledgeGraphEdge_fromNodeId_fkey" FOREIGN KEY ("fromNodeId") REFERENCES "KnowledgeGraphNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "KnowledgeGraphEdge_toNodeId_fkey" FOREIGN KEY ("toNodeId") REFERENCES "KnowledgeGraphNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "KnowledgeGraphEdge_domainId_idx" ON "KnowledgeGraphEdge"("domainId");
CREATE INDEX "KnowledgeGraphEdge_fromNodeId_idx" ON "KnowledgeGraphEdge"("fromNodeId");
CREATE INDEX "KnowledgeGraphEdge_toNodeId_idx" ON "KnowledgeGraphEdge"("toNodeId");

CREATE TABLE "LearningProgress" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "domainId" TEXT NOT NULL,
  "nodeId" TEXT,
  "status" TEXT NOT NULL,
  "reason" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LearningProgress_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "LearningProgress_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "LearningNode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "LearningProgress_domainId_createdAt_idx" ON "LearningProgress"("domainId", "createdAt");
CREATE INDEX "LearningProgress_nodeId_idx" ON "LearningProgress"("nodeId");

CREATE TABLE "RouteSuggestion" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "domainId" TEXT NOT NULL,
  "sourceNodeId" TEXT,
  "level" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "rationale" TEXT NOT NULL,
  "changesMap" BOOLEAN NOT NULL DEFAULT false,
  "status" TEXT NOT NULL DEFAULT 'candidate',
  "payload" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acceptedAt" DATETIME,
  CONSTRAINT "RouteSuggestion_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "RouteSuggestion_sourceNodeId_fkey" FOREIGN KEY ("sourceNodeId") REFERENCES "LearningNode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "RouteSuggestion_domainId_status_idx" ON "RouteSuggestion"("domainId", "status");
CREATE INDEX "RouteSuggestion_sourceNodeId_idx" ON "RouteSuggestion"("sourceNodeId");
