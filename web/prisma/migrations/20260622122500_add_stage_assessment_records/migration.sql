CREATE TABLE "StageAssessmentRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roadmapId" TEXT NOT NULL,
    "stageId" TEXT NOT NULL,
    "stageTitle" TEXT NOT NULL,
    "readiness" TEXT NOT NULL,
    "recommendation" TEXT NOT NULL,
    "adjustmentReason" TEXT NOT NULL,
    "appliedRoadmapStatus" TEXT NOT NULL,
    "flaggedItemsSummary" TEXT,
    "nextActionsSummary" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StageAssessmentRecord_roadmapId_fkey" FOREIGN KEY ("roadmapId") REFERENCES "LearningRoadmap" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "StageAssessmentRecord_stageId_fkey" FOREIGN KEY ("stageId") REFERENCES "RoadmapStage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "StageAssessmentRecord_roadmapId_createdAt_idx" ON "StageAssessmentRecord"("roadmapId", "createdAt");
CREATE INDEX "StageAssessmentRecord_stageId_createdAt_idx" ON "StageAssessmentRecord"("stageId", "createdAt");
