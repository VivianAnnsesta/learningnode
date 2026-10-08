ALTER TABLE "MapDraftQualityReview" ADD COLUMN "availability" TEXT NOT NULL DEFAULT 'available';
ALTER TABLE "MapDraftQualityReview" ADD COLUMN "resolutionJson" TEXT;

ALTER TABLE "AiCallLog" ADD COLUMN "providerRequestId" TEXT;
ALTER TABLE "AiCallLog" ADD COLUMN "researchSourcesJson" TEXT;
ALTER TABLE "AiCallLog" ADD COLUMN "promptVersion" TEXT;
