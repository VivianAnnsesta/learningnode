-- Keep the earliest legacy edge for each business-identical relation before
-- enforcing idempotent writes at the database boundary.
DELETE FROM "KnowledgeGraphEdge"
WHERE rowid NOT IN (
  SELECT MIN(rowid)
  FROM "KnowledgeGraphEdge"
  GROUP BY "domainId", "fromNodeId", "toNodeId", "relationType"
);

CREATE UNIQUE INDEX "KnowledgeGraphEdge_domainId_fromNodeId_toNodeId_relationType_key"
ON "KnowledgeGraphEdge"("domainId", "fromNodeId", "toNodeId", "relationType");
