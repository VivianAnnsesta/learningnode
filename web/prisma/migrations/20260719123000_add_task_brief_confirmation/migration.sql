ALTER TABLE "Domain" ADD COLUMN "taskBriefConfirmedAt" DATETIME;
ALTER TABLE "Domain" ADD COLUMN "roadmapDraftCourseDesignAiCallLogId" TEXT;

-- Existing Course Design or formal-map confirmation is explicit historical evidence.
-- A non-empty Task Brief alone is intentionally not enough to backfill confirmation.
UPDATE "Domain"
SET "taskBriefConfirmedAt" = COALESCE(
  "courseDesignConfirmedAt",
  "updatedAt",
  CURRENT_TIMESTAMP
)
WHERE "taskBriefConfirmedAt" IS NULL
  AND "taskBrief" IS NOT NULL
  AND TRIM("taskBrief") <> ''
  AND (
    "courseDesignConfirmedAt" IS NOT NULL
    OR (
      "mapRevision" > 0
      AND "roadmapStatus" = 'confirmed'
    )
  );
