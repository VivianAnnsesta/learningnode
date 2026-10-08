CREATE TABLE "NodeTeachingSession" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "domainId" TEXT NOT NULL,
  "nodeId" TEXT NOT NULL,
  "contextHash" TEXT NOT NULL,
  "mapRevision" INTEGER NOT NULL,
  "contextJson" TEXT NOT NULL,
  "lessonJson" TEXT NOT NULL,
  "aiCallLogId" TEXT NOT NULL,
  "revision" INTEGER NOT NULL DEFAULT 0 CHECK ("revision" >= 0),
  "progressJson" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "NodeTeachingSession_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "Domain" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "NodeTeachingSession_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "LearningNode" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "NodeTeachingSession_nodeId_contextHash_key" ON "NodeTeachingSession"("nodeId", "contextHash");
CREATE INDEX "NodeTeachingSession_domainId_nodeId_createdAt_idx" ON "NodeTeachingSession"("domainId", "nodeId", "createdAt");

CREATE TABLE "TeachingInteraction" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sessionId" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "kind" TEXT NOT NULL CHECK ("kind" IN ('answer', 'question')),
  "exerciseKey" TEXT NOT NULL,
  "input" TEXT NOT NULL,
  "assistance" INTEGER NOT NULL CHECK ("assistance" >= 0),
  "status" TEXT NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'complete', 'failed')),
  "responseJson" TEXT,
  "errorMessage" TEXT,
  "aiCallLogId" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL,
  CONSTRAINT "TeachingInteraction_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "NodeTeachingSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TeachingInteraction_sessionId_requestId_key" ON "TeachingInteraction"("sessionId", "requestId");
CREATE INDEX "TeachingInteraction_sessionId_createdAt_idx" ON "TeachingInteraction"("sessionId", "createdAt");

CREATE TRIGGER "NodeTeachingSession_domain_insert_guard"
BEFORE INSERT ON "NodeTeachingSession"
WHEN NOT EXISTS (SELECT 1 FROM "LearningNode" WHERE "id" = NEW."nodeId" AND "domainId" = NEW."domainId")
BEGIN SELECT RAISE(ABORT, 'Teaching session node must belong to the same Domain'); END;
CREATE TRIGGER "NodeTeachingSession_domain_update_guard"
BEFORE UPDATE OF "nodeId", "domainId" ON "NodeTeachingSession"
WHEN NOT EXISTS (SELECT 1 FROM "LearningNode" WHERE "id" = NEW."nodeId" AND "domainId" = NEW."domainId")
BEGIN SELECT RAISE(ABORT, 'Teaching session node must belong to the same Domain'); END;
CREATE TRIGGER "LearningNode_teaching_domain_update_guard"
BEFORE UPDATE OF "domainId" ON "LearningNode"
WHEN EXISTS (SELECT 1 FROM "NodeTeachingSession" WHERE "nodeId" = OLD."id" AND "domainId" <> NEW."domainId")
BEGIN SELECT RAISE(ABORT, 'Learning node move would orphan teaching sessions'); END;
