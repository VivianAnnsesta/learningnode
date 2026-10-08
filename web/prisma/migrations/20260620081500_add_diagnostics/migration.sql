-- CreateTable
CREATE TABLE "DiagnosticSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "canvasId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "summary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DiagnosticSession_canvasId_fkey" FOREIGN KEY ("canvasId") REFERENCES "GraphCanvas" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DiagnosticQuestion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "roadmapItemId" TEXT,
    "prompt" TEXT NOT NULL,
    "questionType" TEXT NOT NULL DEFAULT 'concept',
    "expectedAnswer" TEXT,
    "orderIndex" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DiagnosticQuestion_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "DiagnosticSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DiagnosticQuestion_roadmapItemId_fkey" FOREIGN KEY ("roadmapItemId") REFERENCES "RoadmapItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DiagnosticAnswer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "questionId" TEXT NOT NULL,
    "response" TEXT NOT NULL,
    "assessment" TEXT,
    "result" TEXT NOT NULL DEFAULT 'unreviewed',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DiagnosticAnswer_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "DiagnosticQuestion" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "DiagnosticSession_canvasId_idx" ON "DiagnosticSession"("canvasId");

-- CreateIndex
CREATE INDEX "DiagnosticQuestion_sessionId_idx" ON "DiagnosticQuestion"("sessionId");

-- CreateIndex
CREATE INDEX "DiagnosticQuestion_roadmapItemId_idx" ON "DiagnosticQuestion"("roadmapItemId");

-- CreateIndex
CREATE UNIQUE INDEX "DiagnosticQuestion_sessionId_orderIndex_key" ON "DiagnosticQuestion"("sessionId", "orderIndex");

-- CreateIndex
CREATE INDEX "DiagnosticAnswer_questionId_idx" ON "DiagnosticAnswer"("questionId");
