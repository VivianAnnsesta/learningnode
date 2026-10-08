-- CreateTable
CREATE TABLE "WordRelation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fromWordId" TEXT NOT NULL,
    "toWordId" TEXT NOT NULL,
    "relationType" TEXT NOT NULL,
    "detail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WordRelation_fromWordId_fkey" FOREIGN KEY ("fromWordId") REFERENCES "Word" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WordRelation_toWordId_fkey" FOREIGN KEY ("toWordId") REFERENCES "Word" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "WordRelation_fromWordId_idx" ON "WordRelation"("fromWordId");

-- CreateIndex
CREATE INDEX "WordRelation_toWordId_idx" ON "WordRelation"("toWordId");
