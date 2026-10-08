-- CreateTable
CREATE TABLE "DiagnosticSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "domainId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "summary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DiagnosticSession_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DiagnosticQuestion" (
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

-- CreateTable
CREATE TABLE "DiagnosticAnswer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "questionId" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "assessment" TEXT,
    "result" TEXT NOT NULL DEFAULT 'unreviewed',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DiagnosticAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "DiagnosticQuestion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AiCallLog" (
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

-- CreateTable
CREATE TABLE "SemanticCoreVersion" (
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

-- CreateTable
CREATE TABLE "CoreReviewSession" (
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

-- CreateTable
CREATE TABLE "TransferChallenge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reviewSessionId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "userExplanation" TEXT NOT NULL,
    "aiAssessment" TEXT,
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TransferChallenge_reviewSessionId_fkey" FOREIGN KEY ("reviewSessionId") REFERENCES "CoreReviewSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Domain" (
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

-- CreateTable
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

-- CreateTable
CREATE TABLE "LearningNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "domainId" TEXT NOT NULL,
    "unitId" TEXT,
    "moduleTitle" TEXT,
    "moduleOrderIndex" INTEGER,
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

-- CreateTable
CREATE TABLE "LearningNodeDependency" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "nodeId" TEXT NOT NULL,
    "prerequisiteId" TEXT NOT NULL,
    CONSTRAINT "LearningNodeDependency_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "LearningNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LearningNodeDependency_prerequisiteId_fkey" FOREIGN KEY ("prerequisiteId") REFERENCES "LearningNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

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

-- CreateTable
CREATE TABLE "KnowledgePoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "domainId" TEXT NOT NULL,
    "legacyWordId" TEXT,
    "title" TEXT NOT NULL,
    "language" TEXT,
    "sentenceSample" TEXT,
    "coreEssence" TEXT,
    "manualBranchesJson" TEXT,
    "userUnderstanding" TEXT,
    "masteryStatus" TEXT NOT NULL DEFAULT 'available',
    "isIsland" BOOLEAN NOT NULL DEFAULT false,
    "islandReason" TEXT,
    "lastReviewedAt" DATETIME,
    "nextReviewAt" DATETIME,
    "reviewIntervalDays" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "KnowledgePoint_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateTable
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

-- CreateIndex
CREATE INDEX "DiagnosticSession_domainId_idx" ON "DiagnosticSession"("domainId");

-- CreateIndex
CREATE INDEX "DiagnosticQuestion_sessionId_idx" ON "DiagnosticQuestion"("sessionId");

-- CreateIndex
CREATE INDEX "DiagnosticQuestion_learningNodeId_idx" ON "DiagnosticQuestion"("learningNodeId");

-- CreateIndex
CREATE UNIQUE INDEX "DiagnosticQuestion_sessionId_orderIndex_key" ON "DiagnosticQuestion"("sessionId", "orderIndex");

-- CreateIndex
CREATE INDEX "DiagnosticAnswer_questionId_idx" ON "DiagnosticAnswer"("questionId");

-- CreateIndex
CREATE INDEX "AiCallLog_canvasId_idx" ON "AiCallLog"("canvasId");

-- CreateIndex
CREATE INDEX "AiCallLog_domainId_idx" ON "AiCallLog"("domainId");

-- CreateIndex
CREATE INDEX "AiCallLog_taskType_idx" ON "AiCallLog"("taskType");

-- CreateIndex
CREATE INDEX "AiCallLog_status_idx" ON "AiCallLog"("status");

-- CreateIndex
CREATE INDEX "SemanticCoreVersion_knowledgePointId_version_idx" ON "SemanticCoreVersion"("knowledgePointId", "version");

-- CreateIndex
CREATE INDEX "SemanticCoreVersion_sourceReviewId_idx" ON "SemanticCoreVersion"("sourceReviewId");

-- CreateIndex
CREATE INDEX "CoreReviewSession_knowledgePointId_idx" ON "CoreReviewSession"("knowledgePointId");

-- CreateIndex
CREATE INDEX "TransferChallenge_reviewSessionId_idx" ON "TransferChallenge"("reviewSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Domain_legacyCanvasId_key" ON "Domain"("legacyCanvasId");

-- CreateIndex
CREATE INDEX "Unit_domainId_idx" ON "Unit"("domainId");

-- CreateIndex
CREATE UNIQUE INDEX "Unit_domainId_orderIndex_key" ON "Unit"("domainId", "orderIndex");

-- CreateIndex
CREATE UNIQUE INDEX "LearningNode_legacyRoadmapItemId_key" ON "LearningNode"("legacyRoadmapItemId");

-- CreateIndex
CREATE INDEX "LearningNode_domainId_orderIndex_idx" ON "LearningNode"("domainId", "orderIndex");

-- CreateIndex
CREATE INDEX "LearningNode_unitId_idx" ON "LearningNode"("unitId");

-- CreateIndex
CREATE INDEX "LearningNode_knowledgePointId_idx" ON "LearningNode"("knowledgePointId");

-- CreateIndex
CREATE INDEX "LearningNodeDependency_prerequisiteId_idx" ON "LearningNodeDependency"("prerequisiteId");

-- CreateIndex
CREATE UNIQUE INDEX "LearningNodeDependency_nodeId_prerequisiteId_key" ON "LearningNodeDependency"("nodeId", "prerequisiteId");

-- CreateIndex
CREATE INDEX "UnitAssessmentRecord_unitId_createdAt_idx" ON "UnitAssessmentRecord"("unitId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgePoint_legacyWordId_key" ON "KnowledgePoint"("legacyWordId");

-- CreateIndex
CREATE INDEX "KnowledgePoint_domainId_idx" ON "KnowledgePoint"("domainId");

-- CreateIndex
CREATE INDEX "KnowledgeGraphNode_domainId_idx" ON "KnowledgeGraphNode"("domainId");

-- CreateIndex
CREATE INDEX "KnowledgeGraphNode_knowledgePointId_idx" ON "KnowledgeGraphNode"("knowledgePointId");

-- CreateIndex
CREATE INDEX "KnowledgeGraphEdge_domainId_idx" ON "KnowledgeGraphEdge"("domainId");

-- CreateIndex
CREATE INDEX "KnowledgeGraphEdge_fromNodeId_idx" ON "KnowledgeGraphEdge"("fromNodeId");

-- CreateIndex
CREATE INDEX "KnowledgeGraphEdge_toNodeId_idx" ON "KnowledgeGraphEdge"("toNodeId");

-- CreateIndex
CREATE INDEX "LearningProgress_domainId_createdAt_idx" ON "LearningProgress"("domainId", "createdAt");

-- CreateIndex
CREATE INDEX "LearningProgress_nodeId_idx" ON "LearningProgress"("nodeId");

-- CreateIndex
CREATE INDEX "RouteSuggestion_domainId_status_idx" ON "RouteSuggestion"("domainId", "status");

-- CreateIndex
CREATE INDEX "RouteSuggestion_sourceNodeId_idx" ON "RouteSuggestion"("sourceNodeId");
