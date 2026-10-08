-- Preserve existing summary logs. Historical records have no recoverable raw output.
ALTER TABLE "AiCallLog" ADD COLUMN "runId" TEXT;
ALTER TABLE "AiCallLog" ADD COLUMN "attempt" INTEGER;
ALTER TABLE "AiCallLog" ADD COLUMN "retryOfLogId" TEXT;
ALTER TABLE "AiCallLog" ADD COLUMN "retryReason" TEXT;
ALTER TABLE "AiCallLog" ADD COLUMN "failureStage" TEXT;
ALTER TABLE "AiCallLog" ADD COLUMN "requestMessagesJson" TEXT;
ALTER TABLE "AiCallLog" ADD COLUMN "rawOutput" TEXT;
ALTER TABLE "AiCallLog" ADD COLUMN "providerResponseJson" TEXT;
ALTER TABLE "AiCallLog" ADD COLUMN "parsedOutputJson" TEXT;
ALTER TABLE "AiCallLog" ADD COLUMN "validatedOutputJson" TEXT;
ALTER TABLE "AiCallLog" ADD COLUMN "validationIssuesJson" TEXT;
ALTER TABLE "AiCallLog" ADD COLUMN "finishedAt" DATETIME;
CREATE INDEX "AiCallLog_runId_attempt_idx" ON "AiCallLog"("runId", "attempt");
