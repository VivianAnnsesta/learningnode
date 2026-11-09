-- User-assigned dates belong to immutable revisions; historical rows stay null without backfill.
ALTER TABLE "KnowledgePointRevision" ADD COLUMN "recordDate" TEXT;
ALTER TABLE "KnowledgePointRevision" ADD COLUMN "recordDateTimeZone" TEXT;
