-- CreateTable
CREATE TABLE "CoreReviewSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "coreId" TEXT NOT NULL,
    "userRecall" TEXT NOT NULL,
    "oldSampleExplanations" TEXT,
    "transferExplanations" TEXT,
    "aiFeedback" TEXT,
    "result" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CoreReviewSession_coreId_fkey" FOREIGN KEY ("coreId") REFERENCES "CoreEssence" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SemanticCoreVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "coreId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "statement" TEXT NOT NULL,
    "revisionReason" TEXT,
    "sourceReviewId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SemanticCoreVersion_coreId_fkey" FOREIGN KEY ("coreId") REFERENCES "CoreEssence" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SemanticCoreVersion_sourceReviewId_fkey" FOREIGN KEY ("sourceReviewId") REFERENCES "CoreReviewSession" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TransferChallenge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "reviewSessionId" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "userExplanation" TEXT NOT NULL,
    "aiAssessment" TEXT,
    "passed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TransferChallenge_reviewSessionId_fkey" FOREIGN KEY ("reviewSessionId") REFERENCES "CoreReviewSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CoreReviewSession_coreId_idx" ON "CoreReviewSession"("coreId");

-- CreateIndex
CREATE INDEX "SemanticCoreVersion_coreId_idx" ON "SemanticCoreVersion"("coreId");

-- CreateIndex
CREATE INDEX "SemanticCoreVersion_sourceReviewId_idx" ON "SemanticCoreVersion"("sourceReviewId");

-- CreateIndex
CREATE UNIQUE INDEX "SemanticCoreVersion_coreId_version_key" ON "SemanticCoreVersion"("coreId", "version");

-- CreateIndex
CREATE INDEX "TransferChallenge_reviewSessionId_idx" ON "TransferChallenge"("reviewSessionId");
