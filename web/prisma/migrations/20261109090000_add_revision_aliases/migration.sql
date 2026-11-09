-- Revision-owned aliases default to an empty array without rewriting existing content.
ALTER TABLE "KnowledgePointRevision" ADD COLUMN "aliasesJson" TEXT NOT NULL DEFAULT '[]';
