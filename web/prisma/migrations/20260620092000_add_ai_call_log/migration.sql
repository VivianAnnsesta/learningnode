-- CreateTable
CREATE TABLE "AiCallLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "canvasId" TEXT,
    "taskType" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT,
    "status" TEXT NOT NULL DEFAULT 'success',
    "inputSummary" TEXT,
    "outputSummary" TEXT,
    "errorMessage" TEXT,
    "latencyMs" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiCallLog_canvasId_fkey" FOREIGN KEY ("canvasId") REFERENCES "GraphCanvas" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AiCallLog_canvasId_idx" ON "AiCallLog"("canvasId");

-- CreateIndex
CREATE INDEX "AiCallLog_taskType_idx" ON "AiCallLog"("taskType");

-- CreateIndex
CREATE INDEX "AiCallLog_status_idx" ON "AiCallLog"("status");
