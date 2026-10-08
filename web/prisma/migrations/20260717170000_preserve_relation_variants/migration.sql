-- Preserve every pre-idempotency semantic variant while keeping one formal
-- edge per Domain/source/target/type business identity.
ALTER TABLE "KnowledgeGraphEdge" ADD COLUMN "legacyVariantsJson" TEXT;
