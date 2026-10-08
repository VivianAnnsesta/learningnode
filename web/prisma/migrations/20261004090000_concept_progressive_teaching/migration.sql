ALTER TABLE "Domain" ADD COLUMN "entryGuideJson" TEXT;
ALTER TABLE "Domain" ADD COLUMN "learningGoalsJson" TEXT;
ALTER TABLE "Unit" ADD COLUMN "teachingPlanJson" TEXT;
ALTER TABLE "LearningNode" ADD COLUMN "planningQuestionKeysJson" TEXT;
ALTER TABLE "LearningNode" ADD COLUMN "conceptJson" TEXT;
ALTER TABLE "NodeTeachingSession" ADD COLUMN "lessonVersion" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "NodeTeachingSession" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ready';
ALTER TABLE "NodeTeachingSession" ADD COLUMN "errorMessage" TEXT;
ALTER TABLE "NodeTeachingSession" ADD COLUMN "generationToken" TEXT;
ALTER TABLE "NodeTeachingSession" ADD COLUMN "requestId" TEXT;
ALTER TABLE "NodeTeachingSession" ADD COLUMN "sourceRevision" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "NodeTeachingSession" ADD COLUMN "summaryJson" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "NodeTeachingSession" ADD COLUMN "reviewJson" TEXT;
ALTER TABLE "NodeTeachingSession" ADD COLUMN "aiCallLogIdsJson" TEXT NOT NULL DEFAULT '[]';
DROP INDEX "NodeTeachingSession_nodeId_contextHash_key";
CREATE UNIQUE INDEX "NodeTeachingSession_nodeId_contextHash_lessonVersion_key" ON "NodeTeachingSession"("nodeId", "contextHash", "lessonVersion");
CREATE UNIQUE INDEX "NodeTeachingSession_nodeId_requestId_key" ON "NodeTeachingSession"("nodeId", "requestId");

CREATE TABLE "TeachingSegment" (
 "id" TEXT NOT NULL PRIMARY KEY, "sessionId" TEXT NOT NULL, "key" TEXT NOT NULL,
 "version" INTEGER NOT NULL DEFAULT 1, "requestId" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'pending', "sourceRevision" INTEGER NOT NULL DEFAULT 0,
 "materialJson" TEXT, "sourceSnapshotJson" TEXT NOT NULL DEFAULT '[]', "reviewJson" TEXT,
 "aiCallLogIdsJson" TEXT NOT NULL DEFAULT '[]', "errorMessage" TEXT, "generationToken" TEXT,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
 FOREIGN KEY ("sessionId") REFERENCES "NodeTeachingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TeachingSegment_sessionId_key_version_key" ON "TeachingSegment"("sessionId","key","version");
CREATE UNIQUE INDEX "TeachingSegment_sessionId_requestId_key" ON "TeachingSegment"("sessionId","requestId");
CREATE TABLE "TeachingSource" (
 "id" TEXT NOT NULL PRIMARY KEY, "sessionId" TEXT NOT NULL, "url" TEXT NOT NULL, "title" TEXT NOT NULL,
 "contentHash" TEXT NOT NULL, "fragmentsJson" TEXT NOT NULL, "limitation" TEXT,
 "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL,
 FOREIGN KEY ("sessionId") REFERENCES "NodeTeachingSession"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "TeachingSource_sessionId_url_key" ON "TeachingSource"("sessionId","url");
ALTER TABLE "TeachingInteraction" ADD COLUMN "segmentId" TEXT REFERENCES "TeachingSegment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TeachingInteraction" ADD COLUMN "segmentKey" TEXT;
ALTER TABLE "TeachingInteraction" ADD COLUMN "stepKey" TEXT;
ALTER TABLE "TeachingInteraction" ADD COLUMN "materialVersion" INTEGER;
CREATE TRIGGER "TeachingInteraction_segment_insert_guard" BEFORE INSERT ON "TeachingInteraction"
WHEN NEW."segmentId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "TeachingSegment" WHERE "id"=NEW."segmentId" AND "sessionId"=NEW."sessionId" AND "key"=NEW."segmentKey" AND "version"=NEW."materialVersion")
BEGIN SELECT RAISE(ABORT, 'Teaching interaction segment binding mismatch'); END;
CREATE TRIGGER "TeachingInteraction_segment_update_guard" BEFORE UPDATE OF "segmentId", "sessionId", "segmentKey", "materialVersion" ON "TeachingInteraction"
WHEN NEW."segmentId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM "TeachingSegment" WHERE "id"=NEW."segmentId" AND "sessionId"=NEW."sessionId" AND "key"=NEW."segmentKey" AND "version"=NEW."materialVersion")
BEGIN SELECT RAISE(ABORT, 'Teaching interaction segment binding mismatch'); END;
CREATE TRIGGER "TeachingSegment_binding_update_guard" BEFORE UPDATE OF "sessionId", "key", "version" ON "TeachingSegment"
WHEN EXISTS (SELECT 1 FROM "TeachingInteraction" WHERE "segmentId"=OLD."id" AND ("sessionId"<>NEW."sessionId" OR "segmentKey"<>NEW."key" OR "materialVersion"<>NEW."version"))
BEGIN SELECT RAISE(ABORT, 'Teaching segment change would orphan interactions'); END;
