ALTER TABLE "GraphCanvas" ADD COLUMN "courseDesignDraft" TEXT;
ALTER TABLE "GraphCanvas" ADD COLUMN "courseDesignStatus" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "GraphCanvas" ADD COLUMN "courseDesignRepairCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "GraphCanvas" ADD COLUMN "courseDesignConfirmedAt" DATETIME;
ALTER TABLE "GraphCanvas" ADD COLUMN "courseDesignAiCallLogId" TEXT;
