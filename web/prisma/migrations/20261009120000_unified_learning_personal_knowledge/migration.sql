-- Preserve ownership guards while SQLite rebuilds referenced tables.
DROP TRIGGER IF EXISTS "LearningNode_unit_domain_insert_guard";
DROP TRIGGER IF EXISTS "LearningNode_unit_domain_update_guard";
DROP TRIGGER IF EXISTS "LearningNode_knowledge_domain_insert_guard";
DROP TRIGGER IF EXISTS "LearningNode_knowledge_domain_update_guard";
DROP TRIGGER IF EXISTS "KnowledgeGraphNode_knowledge_domain_insert_guard";
DROP TRIGGER IF EXISTS "KnowledgeGraphNode_knowledge_domain_update_guard";
DROP TRIGGER IF EXISTS "KnowledgeGraphEdge_domain_insert_guard";
DROP TRIGGER IF EXISTS "KnowledgeGraphEdge_domain_update_guard";
DROP TRIGGER IF EXISTS "LearningNodeDependency_domain_insert_guard";
DROP TRIGGER IF EXISTS "LearningNodeDependency_domain_update_guard";
DROP TRIGGER IF EXISTS "Unit_domain_parent_update_guard";
DROP TRIGGER IF EXISTS "KnowledgePoint_domain_parent_update_guard";
DROP TRIGGER IF EXISTS "KnowledgeGraphNode_domain_parent_update_guard";
DROP TRIGGER IF EXISTS "LearningNode_domain_parent_update_guard";
DROP TRIGGER IF EXISTS "NodeTeachingSession_domain_insert_guard";
DROP TRIGGER IF EXISTS "NodeTeachingSession_domain_update_guard";
DROP TRIGGER IF EXISTS "LearningNode_teaching_domain_update_guard";
DROP TRIGGER IF EXISTS "TeachingInteraction_segment_insert_guard";
DROP TRIGGER IF EXISTS "TeachingInteraction_segment_update_guard";
DROP TRIGGER IF EXISTS "TeachingSegment_binding_update_guard";
-- CreateTable
CREATE TABLE "KnowledgePointRevision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "knowledgePointId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourcesJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KnowledgePointRevision_knowledgePointId_fkey" FOREIGN KEY ("knowledgePointId") REFERENCES "KnowledgePoint" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LearningNodeKnowledgePoint" (
    "nodeId" TEXT NOT NULL,
    "knowledgePointId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("nodeId", "knowledgePointId"),
    CONSTRAINT "LearningNodeKnowledgePoint_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "LearningNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LearningNodeKnowledgePoint_knowledgePointId_fkey" FOREIGN KEY ("knowledgePointId") REFERENCES "KnowledgePoint" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "KnowledgeGraphMembership" (
    "groupNodeId" TEXT NOT NULL,
    "knowledgePointId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("groupNodeId", "knowledgePointId"),
    CONSTRAINT "KnowledgeGraphMembership_groupNodeId_fkey" FOREIGN KEY ("groupNodeId") REFERENCES "KnowledgeGraphNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "KnowledgeGraphMembership_knowledgePointId_fkey" FOREIGN KEY ("knowledgePointId") REFERENCES "KnowledgePoint" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_LearningNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "domainId" TEXT NOT NULL,
    "mapKey" TEXT,
    "unitId" TEXT,
    "moduleTitle" TEXT,
    "moduleOrderIndex" INTEGER,
    "title" TEXT NOT NULL,
    "nodeType" TEXT NOT NULL DEFAULT 'knowledge',
    "status" TEXT NOT NULL DEFAULT 'available',
    "objective" TEXT,
    "keyQuestion" TEXT,
    "prerequisite" TEXT,
    "commonMistake" TEXT,
    "transferPrompt" TEXT,
    "planningQuestionKey" TEXT,
    "planningQuestionKeysJson" TEXT,
    "conceptJson" TEXT,
    "orderIndex" INTEGER NOT NULL,
    "legacyRoadmapItemId" TEXT,
    "knowledgePointId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LearningNode_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LearningNode_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LearningNode_knowledgePointId_fkey" FOREIGN KEY ("knowledgePointId") REFERENCES "KnowledgePoint" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_LearningNode" ("commonMistake", "conceptJson", "createdAt", "domainId", "id", "keyQuestion", "knowledgePointId", "legacyRoadmapItemId", "mapKey", "moduleOrderIndex", "moduleTitle", "nodeType", "objective", "orderIndex", "planningQuestionKey", "planningQuestionKeysJson", "prerequisite", "status", "title", "transferPrompt", "unitId", "updatedAt") SELECT "commonMistake", "conceptJson", "createdAt", "domainId", "id", "keyQuestion", "knowledgePointId", "legacyRoadmapItemId", "mapKey", "moduleOrderIndex", "moduleTitle", "nodeType", "objective", "orderIndex", "planningQuestionKey", "planningQuestionKeysJson", "prerequisite", "status", "title", "transferPrompt", "unitId", "updatedAt" FROM "LearningNode";
DROP TABLE "LearningNode";
ALTER TABLE "new_LearningNode" RENAME TO "LearningNode";
CREATE UNIQUE INDEX "LearningNode_legacyRoadmapItemId_key" ON "LearningNode"("legacyRoadmapItemId");
CREATE INDEX "LearningNode_domainId_orderIndex_idx" ON "LearningNode"("domainId", "orderIndex");
CREATE INDEX "LearningNode_unitId_idx" ON "LearningNode"("unitId");
CREATE INDEX "LearningNode_knowledgePointId_idx" ON "LearningNode"("knowledgePointId");
CREATE INDEX "LearningNode_domainId_planningQuestionKey_idx" ON "LearningNode"("domainId", "planningQuestionKey");
CREATE UNIQUE INDEX "LearningNode_domainId_mapKey_key" ON "LearningNode"("domainId", "mapKey");
CREATE TABLE "new_NodeTeachingSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "domainId" TEXT,
    "nodeId" TEXT,
    "scopeKey" TEXT NOT NULL,
    "contextHash" TEXT NOT NULL,
    "lessonVersion" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'ready',
    "errorMessage" TEXT,
    "generationToken" TEXT,
    "requestId" TEXT NOT NULL,
    "sourceRevision" INTEGER NOT NULL DEFAULT 0,
    "mapRevision" INTEGER,
    "contextJson" TEXT NOT NULL,
    "lessonJson" TEXT NOT NULL,
    "aiCallLogId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 0,
    "progressJson" TEXT NOT NULL,
    "summaryJson" TEXT NOT NULL DEFAULT '{}',
    "reviewJson" TEXT,
    "aiCallLogIdsJson" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NodeTeachingSession_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "NodeTeachingSession_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "LearningNode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_NodeTeachingSession" ("scopeKey", "aiCallLogId", "aiCallLogIdsJson", "contextHash", "contextJson", "createdAt", "domainId", "errorMessage", "generationToken", "id", "lessonJson", "lessonVersion", "mapRevision", "nodeId", "progressJson", "requestId", "reviewJson", "revision", "sourceRevision", "status", "summaryJson", "updatedAt") SELECT 'legacy:' || "id", "aiCallLogId", "aiCallLogIdsJson", "contextHash", "contextJson", "createdAt", "domainId", "errorMessage", "generationToken", "id", "lessonJson", "lessonVersion", "mapRevision", "nodeId", "progressJson", COALESCE("requestId", 'legacy:' || "id"), "reviewJson", "revision", "sourceRevision", "status", "summaryJson", "updatedAt" FROM "NodeTeachingSession";
DROP TABLE "NodeTeachingSession";
ALTER TABLE "new_NodeTeachingSession" RENAME TO "NodeTeachingSession";
CREATE INDEX "NodeTeachingSession_domainId_nodeId_createdAt_idx" ON "NodeTeachingSession"("domainId", "nodeId", "createdAt");
CREATE UNIQUE INDEX "NodeTeachingSession_scopeKey_key" ON "NodeTeachingSession"("scopeKey");
CREATE UNIQUE INDEX "NodeTeachingSession_scopeKey_requestId_key" ON "NodeTeachingSession"("scopeKey", "requestId");
CREATE TABLE "new_TeachingInteraction" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "exerciseKey" TEXT,
    "segmentId" TEXT,
    "segmentKey" TEXT,
    "stepKey" TEXT,
    "materialVersion" INTEGER,
    "input" TEXT NOT NULL,
    "assistance" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "responseJson" TEXT,
    "generationToken" TEXT,
    "errorMessage" TEXT,
    "aiCallLogId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TeachingInteraction_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "NodeTeachingSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TeachingInteraction_segmentId_fkey" FOREIGN KEY ("segmentId") REFERENCES "TeachingSegment" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_TeachingInteraction" ("aiCallLogId", "assistance", "createdAt", "errorMessage", "exerciseKey", "id", "input", "kind", "materialVersion", "requestId", "responseJson", "segmentId", "segmentKey", "sessionId", "status", "stepKey", "updatedAt") SELECT "aiCallLogId", "assistance", "createdAt", "errorMessage", "exerciseKey", "id", "input", "kind", "materialVersion", "requestId", "responseJson", "segmentId", "segmentKey", "sessionId", "status", "stepKey", "updatedAt" FROM "TeachingInteraction";
DROP TABLE "TeachingInteraction";
ALTER TABLE "new_TeachingInteraction" RENAME TO "TeachingInteraction";
CREATE INDEX "TeachingInteraction_sessionId_createdAt_idx" ON "TeachingInteraction"("sessionId", "createdAt");
CREATE UNIQUE INDEX "TeachingInteraction_sessionId_requestId_key" ON "TeachingInteraction"("sessionId", "requestId");
CREATE TABLE "new_KnowledgePoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "domainId" TEXT,
    "legacyWordId" TEXT,
    "title" TEXT NOT NULL DEFAULT '',
    "recordKind" TEXT NOT NULL DEFAULT 'understanding',
    "currentRevisionId" TEXT,
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
    CONSTRAINT "KnowledgePoint_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "KnowledgePoint_currentRevisionId_fkey" FOREIGN KEY ("currentRevisionId") REFERENCES "KnowledgePointRevision" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_KnowledgePoint" ("coreEssence", "createdAt", "domainId", "id", "isIsland", "islandReason", "language", "lastReviewedAt", "legacyWordId", "manualBranchesJson", "masteryStatus", "nextReviewAt", "reviewIntervalDays", "sentenceSample", "title", "updatedAt", "userUnderstanding") SELECT "coreEssence", "createdAt", "domainId", "id", "isIsland", "islandReason", "language", "lastReviewedAt", "legacyWordId", "manualBranchesJson", "masteryStatus", "nextReviewAt", "reviewIntervalDays", "sentenceSample", "title", "updatedAt", "userUnderstanding" FROM "KnowledgePoint";
DROP TABLE "KnowledgePoint";
ALTER TABLE "new_KnowledgePoint" RENAME TO "KnowledgePoint";
CREATE UNIQUE INDEX "KnowledgePoint_legacyWordId_key" ON "KnowledgePoint"("legacyWordId");
CREATE UNIQUE INDEX "KnowledgePoint_currentRevisionId_key" ON "KnowledgePoint"("currentRevisionId");
CREATE INDEX "KnowledgePoint_domainId_idx" ON "KnowledgePoint"("domainId");
CREATE TABLE "new_KnowledgeGraphNode" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "domainId" TEXT,
    "knowledgePointId" TEXT,
    "title" TEXT NOT NULL,
    "nodeType" TEXT NOT NULL DEFAULT 'knowledge',
    "status" TEXT NOT NULL DEFAULT 'candidate',
    "positionX" REAL,
    "positionY" REAL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "KnowledgeGraphNode_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "KnowledgeGraphNode_knowledgePointId_fkey" FOREIGN KEY ("knowledgePointId") REFERENCES "KnowledgePoint" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_KnowledgeGraphNode" ("createdAt", "domainId", "id", "knowledgePointId", "nodeType", "positionX", "positionY", "status", "title", "updatedAt") SELECT "createdAt", "domainId", "id", "knowledgePointId", "nodeType", "positionX", "positionY", "status", "title", "updatedAt" FROM "KnowledgeGraphNode";
DROP TABLE "KnowledgeGraphNode";
ALTER TABLE "new_KnowledgeGraphNode" RENAME TO "KnowledgeGraphNode";
CREATE INDEX "KnowledgeGraphNode_domainId_idx" ON "KnowledgeGraphNode"("domainId");
CREATE INDEX "KnowledgeGraphNode_knowledgePointId_idx" ON "KnowledgeGraphNode"("knowledgePointId");
CREATE TABLE "new_KnowledgeGraphEdge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "domainId" TEXT,
    "fromNodeId" TEXT,
    "toNodeId" TEXT,
    "fromKnowledgePointId" TEXT,
    "toKnowledgePointId" TEXT,
    "relationType" TEXT NOT NULL,
    "detail" TEXT,
    "status" TEXT NOT NULL DEFAULT 'candidate',
    "evidenceStrength" TEXT NOT NULL DEFAULT 'unknown',
    "userExplanation" TEXT,
    "aiAssessment" TEXT,
    "applicability" TEXT,
    "misuseRisk" TEXT,
    "legacyVariantsJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KnowledgeGraphEdge_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "KnowledgeGraphEdge_fromNodeId_fkey" FOREIGN KEY ("fromNodeId") REFERENCES "KnowledgeGraphNode" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "KnowledgeGraphEdge_toNodeId_fkey" FOREIGN KEY ("toNodeId") REFERENCES "KnowledgeGraphNode" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "KnowledgeGraphEdge_fromKnowledgePointId_fkey" FOREIGN KEY ("fromKnowledgePointId") REFERENCES "KnowledgePoint" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "KnowledgeGraphEdge_toKnowledgePointId_fkey" FOREIGN KEY ("toKnowledgePointId") REFERENCES "KnowledgePoint" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_KnowledgeGraphEdge" ("aiAssessment", "applicability", "createdAt", "detail", "domainId", "evidenceStrength", "fromNodeId", "id", "legacyVariantsJson", "misuseRisk", "relationType", "status", "toNodeId", "userExplanation") SELECT "aiAssessment", "applicability", "createdAt", "detail", "domainId", "evidenceStrength", "fromNodeId", "id", "legacyVariantsJson", "misuseRisk", "relationType", "status", "toNodeId", "userExplanation" FROM "KnowledgeGraphEdge";
DROP TABLE "KnowledgeGraphEdge";
ALTER TABLE "new_KnowledgeGraphEdge" RENAME TO "KnowledgeGraphEdge";
CREATE INDEX "KnowledgeGraphEdge_domainId_idx" ON "KnowledgeGraphEdge"("domainId");
CREATE INDEX "KnowledgeGraphEdge_fromNodeId_idx" ON "KnowledgeGraphEdge"("fromNodeId");
CREATE INDEX "KnowledgeGraphEdge_toNodeId_idx" ON "KnowledgeGraphEdge"("toNodeId");
CREATE UNIQUE INDEX "KnowledgeGraphEdge_fromKnowledgePointId_toKnowledgePointId_relationType_key" ON "KnowledgeGraphEdge"("fromKnowledgePointId", "toKnowledgePointId", "relationType");
CREATE TABLE "new_LearningProgress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "domainId" TEXT,
    "nodeId" TEXT,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "payloadJson" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LearningProgress_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "LearningProgress_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "LearningNode" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_LearningProgress" ("createdAt", "domainId", "id", "nodeId", "reason", "status") SELECT "createdAt", "domainId", "id", "nodeId", "reason", "status" FROM "LearningProgress";
DROP TABLE "LearningProgress";
ALTER TABLE "new_LearningProgress" RENAME TO "LearningProgress";
CREATE INDEX "LearningProgress_domainId_createdAt_idx" ON "LearningProgress"("domainId", "createdAt");
CREATE INDEX "LearningProgress_nodeId_idx" ON "LearningProgress"("nodeId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgePointRevision_knowledgePointId_sequence_key" ON "KnowledgePointRevision"("knowledgePointId", "sequence");

-- Old content is a source snapshot, never newly certified learner evidence.
INSERT INTO "KnowledgePointRevision" (id, knowledgePointId, sequence, title, body, sourceType, sourcesJson, createdAt)
SELECT 'legacy-revision:' || id, id, 1, title, COALESCE(userUnderstanding, coreEssence, ''),
 CASE WHEN TRIM(COALESCE(userUnderstanding,'')) <> '' THEN 'legacy_user' ELSE 'legacy_ai_or_unknown' END,
 json_array(json_object('kind','legacy_snapshot','knowledgePointId',id,'legacyWordId',legacyWordId,
 'title',title,'userUnderstanding',userUnderstanding,'coreEssence',coreEssence,'language',language,
 'sentenceSample',sentenceSample,'manualBranchesJson',manualBranchesJson,'masteryStatus',masteryStatus,
 'isIsland',isIsland,'islandReason',islandReason,'lastReviewedAt',lastReviewedAt,'nextReviewAt',nextReviewAt,
 'reviewIntervalDays',reviewIntervalDays)), createdAt FROM KnowledgePoint;
UPDATE KnowledgePoint SET currentRevisionId='legacy-revision:' || id;
INSERT INTO LearningNodeKnowledgePoint (nodeId,knowledgePointId)
 SELECT id, knowledgePointId FROM LearningNode WHERE knowledgePointId IS NOT NULL;
-- Keep all old edges. Only a canonical edge acquires new identity endpoints;
-- unresolved or duplicate layout edges remain accessible as read-only history.
UPDATE KnowledgeGraphEdge SET
 fromKnowledgePointId=(SELECT knowledgePointId FROM KnowledgeGraphNode WHERE id=fromNodeId),
 toKnowledgePointId=(SELECT knowledgePointId FROM KnowledgeGraphNode WHERE id=toNodeId)
WHERE rowid=(SELECT MIN(e.rowid) FROM KnowledgeGraphEdge e
 JOIN KnowledgeGraphNode f ON f.id=e.fromNodeId JOIN KnowledgeGraphNode t ON t.id=e.toNodeId
 WHERE f.knowledgePointId=(SELECT knowledgePointId FROM KnowledgeGraphNode WHERE id=KnowledgeGraphEdge.fromNodeId)
 AND t.knowledgePointId=(SELECT knowledgePointId FROM KnowledgeGraphNode WHERE id=KnowledgeGraphEdge.toNodeId)
 AND e.relationType=KnowledgeGraphEdge.relationType);
INSERT INTO LearningProgress (id,domainId,nodeId,status,reason,payloadJson)
 SELECT 'status-import:' || id,domainId,id,'historical_import','保留原学习状态；未认证掌握',
 json_object('legacyStatus',status,'task',json_object('id',id,'title',title,'objective',objective,'keyQuestion',keyQuestion),
 'knowledgePointId',knowledgePointId) FROM LearningNode;
UPDATE LearningNode SET status=CASE WHEN status IN ('in_progress','completed') THEN status ELSE 'available' END;
PRAGMA foreign_key_check;

-- Restore the remaining same-Domain and exact material binding guards.
CREATE TRIGGER "LearningNode_unit_domain_insert_guard"
BEFORE INSERT ON "LearningNode"
WHEN NEW."unitId" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "Unit"
  WHERE "id" = NEW."unitId" AND "domainId" = NEW."domainId"
)
BEGIN
  SELECT RAISE(ABORT, 'LearningNode unit must belong to the same Domain');
END;
CREATE TRIGGER "LearningNode_unit_domain_update_guard"
BEFORE UPDATE OF "domainId", "unitId" ON "LearningNode"
WHEN NEW."unitId" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "Unit"
  WHERE "id" = NEW."unitId" AND "domainId" = NEW."domainId"
)
BEGIN
  SELECT RAISE(ABORT, 'LearningNode unit must belong to the same Domain');
END;
CREATE TRIGGER "LearningNode_knowledge_domain_insert_guard"
BEFORE INSERT ON "LearningNode"
WHEN NEW."knowledgePointId" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "KnowledgePoint"
  WHERE "id" = NEW."knowledgePointId" AND "domainId" = NEW."domainId"
)
BEGIN
  SELECT RAISE(ABORT, 'LearningNode knowledge point must belong to the same Domain');
END;
CREATE TRIGGER "LearningNode_knowledge_domain_update_guard"
BEFORE UPDATE OF "domainId", "knowledgePointId" ON "LearningNode"
WHEN NEW."knowledgePointId" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "KnowledgePoint"
  WHERE "id" = NEW."knowledgePointId" AND "domainId" = NEW."domainId"
)
BEGIN
  SELECT RAISE(ABORT, 'LearningNode knowledge point must belong to the same Domain');
END;
CREATE TRIGGER "LearningNodeDependency_domain_insert_guard"
BEFORE INSERT ON "LearningNodeDependency"
WHEN NEW."nodeId" = NEW."prerequisiteId" OR NOT EXISTS (
  SELECT 1
  FROM "LearningNode" AS node, "LearningNode" AS prerequisite
  WHERE node."id" = NEW."nodeId"
    AND prerequisite."id" = NEW."prerequisiteId"
    AND node."domainId" = prerequisite."domainId"
)
BEGIN
  SELECT RAISE(ABORT, 'LearningNode dependency must be non-self and within one Domain');
END;
CREATE TRIGGER "LearningNodeDependency_domain_update_guard"
BEFORE UPDATE OF "nodeId", "prerequisiteId" ON "LearningNodeDependency"
WHEN NEW."nodeId" = NEW."prerequisiteId" OR NOT EXISTS (
  SELECT 1
  FROM "LearningNode" AS node, "LearningNode" AS prerequisite
  WHERE node."id" = NEW."nodeId"
    AND prerequisite."id" = NEW."prerequisiteId"
    AND node."domainId" = prerequisite."domainId"
)
BEGIN
  SELECT RAISE(ABORT, 'LearningNode dependency must be non-self and within one Domain');
END;
CREATE TRIGGER "Unit_domain_parent_update_guard"
BEFORE UPDATE OF "domainId" ON "Unit"
WHEN EXISTS (
  SELECT 1 FROM "LearningNode"
  WHERE "unitId" = OLD."id" AND "domainId" <> NEW."domainId"
)
BEGIN
  SELECT RAISE(ABORT, 'Unit Domain cannot contradict existing Learning Nodes');
END;
CREATE TRIGGER "KnowledgeGraphNode_domain_parent_update_guard"
BEFORE UPDATE OF "domainId" ON "KnowledgeGraphNode"
WHEN EXISTS (
  SELECT 1 FROM "KnowledgeGraphEdge"
  WHERE ("fromNodeId" = OLD."id" OR "toNodeId" = OLD."id")
    AND "domainId" <> NEW."domainId"
    AND ("fromKnowledgePointId" IS NULL OR "toKnowledgePointId" IS NULL)
)
BEGIN
  SELECT RAISE(ABORT, 'KnowledgeGraphNode Domain cannot contradict existing edges');
END;
CREATE TRIGGER "LearningNode_domain_parent_update_guard"
BEFORE UPDATE OF "domainId" ON "LearningNode"
WHEN EXISTS (
  SELECT 1
  FROM "LearningNodeDependency" AS dependency
  JOIN "LearningNode" AS other
    ON other."id" = CASE
      WHEN dependency."nodeId" = OLD."id" THEN dependency."prerequisiteId"
      ELSE dependency."nodeId"
    END
  WHERE (dependency."nodeId" = OLD."id" OR dependency."prerequisiteId" = OLD."id")
    AND other."domainId" <> NEW."domainId"
)
BEGIN
  SELECT RAISE(ABORT, 'LearningNode Domain cannot contradict existing dependencies');
END;
CREATE TRIGGER "NodeTeachingSession_domain_insert_guard"
BEFORE INSERT ON "NodeTeachingSession"
WHEN NEW."nodeId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "LearningNode" WHERE "id" = NEW."nodeId" AND "domainId" = NEW."domainId")
BEGIN SELECT RAISE(ABORT, 'Teaching session node must belong to the same Domain'); END;
CREATE TRIGGER "NodeTeachingSession_domain_update_guard"
BEFORE UPDATE OF "nodeId", "domainId" ON "NodeTeachingSession"
WHEN NEW."nodeId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "LearningNode" WHERE "id" = NEW."nodeId" AND "domainId" = NEW."domainId")
BEGIN SELECT RAISE(ABORT, 'Teaching session node must belong to the same Domain'); END;
CREATE TRIGGER "LearningNode_teaching_domain_update_guard"
BEFORE UPDATE OF "domainId" ON "LearningNode"
WHEN EXISTS (SELECT 1 FROM "NodeTeachingSession" WHERE "nodeId" = OLD."id" AND "domainId" <> NEW."domainId")
BEGIN SELECT RAISE(ABORT, 'Learning node move would orphan teaching sessions'); END;
CREATE TRIGGER "TeachingInteraction_segment_insert_guard" BEFORE INSERT ON "TeachingInteraction"
WHEN NEW."segmentId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "TeachingSegment" WHERE "id"=NEW."segmentId" AND "sessionId"=NEW."sessionId" AND "key"=NEW."segmentKey" AND "version"=NEW."materialVersion")
BEGIN SELECT RAISE(ABORT, 'Teaching interaction segment binding mismatch'); END;
CREATE TRIGGER "TeachingInteraction_segment_update_guard" BEFORE UPDATE OF "segmentId", "sessionId", "segmentKey", "materialVersion" ON "TeachingInteraction"
WHEN NEW."segmentId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "TeachingSegment" WHERE "id"=NEW."segmentId" AND "sessionId"=NEW."sessionId" AND "key"=NEW."segmentKey" AND "version"=NEW."materialVersion")
BEGIN SELECT RAISE(ABORT, 'Teaching interaction segment binding mismatch'); END;
CREATE TRIGGER "TeachingSegment_binding_update_guard" BEFORE UPDATE OF "sessionId", "key", "version" ON "TeachingSegment"
WHEN EXISTS (SELECT 1 FROM "TeachingInteraction" WHERE "segmentId"=OLD."id" AND ("sessionId"<>NEW."sessionId" OR "segmentKey"<>NEW."key" OR "materialVersion"<>NEW."version"))
BEGIN SELECT RAISE(ABORT, 'Teaching segment change would orphan interactions'); END;
CREATE TRIGGER "KnowledgeGraphNode_knowledge_insert_guard" BEFORE INSERT ON "KnowledgeGraphNode"
WHEN NEW.knowledgePointId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM KnowledgePoint WHERE id=NEW.knowledgePointId)
BEGIN SELECT RAISE(ABORT,'Graph reference must name an existing personal record'); END;
CREATE TRIGGER "KnowledgeGraphEdge_identity_insert_guard" BEFORE INSERT ON "KnowledgeGraphEdge"
WHEN NEW.fromKnowledgePointId IS NULL OR NEW.toKnowledgePointId IS NULL OR NEW.fromKnowledgePointId=NEW.toKnowledgePointId
 OR NOT EXISTS(SELECT 1 FROM KnowledgePoint WHERE id=NEW.fromKnowledgePointId)
 OR NOT EXISTS(SELECT 1 FROM KnowledgePoint WHERE id=NEW.toKnowledgePointId)
BEGIN SELECT RAISE(ABORT,'Knowledge relation must connect two actual personal records'); END;
CREATE TRIGGER "KnowledgePoint_revision_insert_guard" BEFORE INSERT ON "KnowledgePoint"
WHEN NEW.currentRevisionId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM KnowledgePointRevision WHERE id=NEW.currentRevisionId AND knowledgePointId=NEW.id)
BEGIN SELECT RAISE(ABORT,'Current revision must belong to this record'); END;
CREATE TRIGGER "LearningNode_status_insert_guard" BEFORE INSERT ON "LearningNode"
WHEN NEW.status NOT IN ('available','in_progress','completed')
BEGIN SELECT RAISE(ABORT,'Learning activity status must be available, in_progress or completed'); END;
CREATE TRIGGER "KnowledgeGraphNode_knowledge_update_guard" BEFORE UPDATE ON "KnowledgeGraphNode"
WHEN NEW.knowledgePointId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM KnowledgePoint WHERE id=NEW.knowledgePointId)
BEGIN SELECT RAISE(ABORT,'Graph reference must name an existing personal record'); END;
CREATE TRIGGER "KnowledgeGraphEdge_identity_update_guard" BEFORE UPDATE OF "fromKnowledgePointId", "toKnowledgePointId" ON "KnowledgeGraphEdge"
WHEN NEW.fromKnowledgePointId IS NULL OR NEW.toKnowledgePointId IS NULL OR NEW.fromKnowledgePointId=NEW.toKnowledgePointId
 OR NOT EXISTS(SELECT 1 FROM KnowledgePoint WHERE id=NEW.fromKnowledgePointId)
 OR NOT EXISTS(SELECT 1 FROM KnowledgePoint WHERE id=NEW.toKnowledgePointId)
BEGIN SELECT RAISE(ABORT,'Knowledge relation must connect two actual personal records'); END;
CREATE TRIGGER "KnowledgePoint_revision_update_guard" BEFORE UPDATE ON "KnowledgePoint"
WHEN NEW.currentRevisionId IS NOT NULL AND NOT EXISTS(SELECT 1 FROM KnowledgePointRevision WHERE id=NEW.currentRevisionId AND knowledgePointId=NEW.id)
BEGIN SELECT RAISE(ABORT,'Current revision must belong to this record'); END;
CREATE TRIGGER "LearningNode_status_update_guard" BEFORE UPDATE ON "LearningNode"
WHEN NEW.status NOT IN ('available','in_progress','completed')
BEGIN SELECT RAISE(ABORT,'Learning activity status must be available, in_progress or completed'); END;
CREATE TRIGGER "KnowledgePointRevision_immutable" BEFORE UPDATE ON "KnowledgePointRevision"
BEGIN SELECT RAISE(ABORT,'Knowledge revisions are immutable'); END;
CREATE TRIGGER "LearningProgress_immutable_payload" BEFORE UPDATE OF status,reason,payloadJson,createdAt ON "LearningProgress"
BEGIN SELECT RAISE(ABORT,'Learning audit events are append only'); END;
CREATE TRIGGER "KnowledgePoint_domain_parent_update_guard" BEFORE UPDATE OF domainId ON KnowledgePoint
WHEN EXISTS(SELECT 1 FROM LearningNode WHERE knowledgePointId=OLD.id AND domainId<>NEW.domainId)
BEGIN SELECT RAISE(ABORT,'Legacy LearningNode owner cannot be contradicted'); END;
