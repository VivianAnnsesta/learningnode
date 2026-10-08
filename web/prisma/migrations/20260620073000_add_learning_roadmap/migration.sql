-- CreateTable
CREATE TABLE "LearningRoadmap" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "canvasId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "LearningRoadmap_canvasId_fkey" FOREIGN KEY ("canvasId") REFERENCES "GraphCanvas" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RoadmapStage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roadmapId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "goal" TEXT,
    "orderIndex" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RoadmapStage_roadmapId_fkey" FOREIGN KEY ("roadmapId") REFERENCES "LearningRoadmap" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RoadmapModule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "stageId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "goal" TEXT,
    "orderIndex" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RoadmapModule_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "RoadmapStage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RoadmapItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "moduleId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "keyQuestion" TEXT,
    "objective" TEXT,
    "prerequisite" TEXT,
    "commonMistake" TEXT,
    "transferPrompt" TEXT,
    "status" TEXT NOT NULL DEFAULT 'not_started',
    "orderIndex" INTEGER NOT NULL,
    "linkedWordId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RoadmapItem_moduleId_fkey" FOREIGN KEY ("moduleId") REFERENCES "RoadmapModule" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RoadmapItem_linkedWordId_fkey" FOREIGN KEY ("linkedWordId") REFERENCES "Word" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "LearningRoadmap_canvasId_idx" ON "LearningRoadmap"("canvasId");

-- CreateIndex
CREATE INDEX "RoadmapStage_roadmapId_idx" ON "RoadmapStage"("roadmapId");

-- CreateIndex
CREATE UNIQUE INDEX "RoadmapStage_roadmapId_orderIndex_key" ON "RoadmapStage"("roadmapId", "orderIndex");

-- CreateIndex
CREATE INDEX "RoadmapModule_stageId_idx" ON "RoadmapModule"("stageId");

-- CreateIndex
CREATE UNIQUE INDEX "RoadmapModule_stageId_orderIndex_key" ON "RoadmapModule"("stageId", "orderIndex");

-- CreateIndex
CREATE INDEX "RoadmapItem_moduleId_idx" ON "RoadmapItem"("moduleId");

-- CreateIndex
CREATE INDEX "RoadmapItem_linkedWordId_idx" ON "RoadmapItem"("linkedWordId");

-- CreateIndex
CREATE UNIQUE INDEX "RoadmapItem_moduleId_orderIndex_key" ON "RoadmapItem"("moduleId", "orderIndex");
