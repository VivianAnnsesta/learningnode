-- The PRD v1.2 cleanup migration could retain a legacy canvas id in
-- AiCallLog.domainId when no matching Domain existed. Preserve the log but
-- remove the invalid optional association before subsequent FK validation.
UPDATE "AiCallLog"
SET "domainId" = NULL
WHERE "domainId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM "Domain"
    WHERE "Domain"."id" = "AiCallLog"."domainId"
  );
