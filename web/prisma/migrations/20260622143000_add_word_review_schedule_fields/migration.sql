ALTER TABLE "Word" ADD COLUMN "lastReviewedAt" DATETIME;
ALTER TABLE "Word" ADD COLUMN "nextReviewAt" DATETIME;
ALTER TABLE "Word" ADD COLUMN "reviewIntervalDays" INTEGER;

CREATE INDEX "Word_canvasId_nextReviewAt_idx" ON "Word"("canvasId", "nextReviewAt");
