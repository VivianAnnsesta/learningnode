-- Reject cross-Domain ownership that ordinary foreign keys cannot express.
-- Existing contradictory data aborts this migration so the backup-first
-- lifecycle can stop without silently rewriting user knowledge.

CREATE TABLE "_DomainIntegrityGuard" (
  "ok" INTEGER NOT NULL CHECK ("ok" = 1)
);

INSERT INTO "_DomainIntegrityGuard" ("ok")
SELECT CASE WHEN EXISTS (
  SELECT 1
  FROM "LearningNode" AS node
  JOIN "Unit" AS unit ON unit."id" = node."unitId"
  WHERE node."unitId" IS NOT NULL AND unit."domainId" <> node."domainId"
  UNION ALL
  SELECT 1
  FROM "LearningNode" AS node
  JOIN "KnowledgePoint" AS point ON point."id" = node."knowledgePointId"
  WHERE node."knowledgePointId" IS NOT NULL AND point."domainId" <> node."domainId"
  UNION ALL
  SELECT 1
  FROM "KnowledgeGraphNode" AS node
  JOIN "KnowledgePoint" AS point ON point."id" = node."knowledgePointId"
  WHERE node."knowledgePointId" IS NOT NULL AND point."domainId" <> node."domainId"
  UNION ALL
  SELECT 1
  FROM "KnowledgeGraphEdge" AS edge
  JOIN "KnowledgeGraphNode" AS source ON source."id" = edge."fromNodeId"
  JOIN "KnowledgeGraphNode" AS target ON target."id" = edge."toNodeId"
  WHERE source."domainId" <> edge."domainId" OR target."domainId" <> edge."domainId"
  UNION ALL
  SELECT 1
  FROM "LearningNodeDependency" AS dependency
  JOIN "LearningNode" AS node ON node."id" = dependency."nodeId"
  JOIN "LearningNode" AS prerequisite ON prerequisite."id" = dependency."prerequisiteId"
  WHERE dependency."nodeId" = dependency."prerequisiteId"
     OR node."domainId" <> prerequisite."domainId"
) THEN 0 ELSE 1 END;

DROP TABLE "_DomainIntegrityGuard";

CREATE TRIGGER "LearningNode_unit_domain_insert_guard"
BEFORE INSERT ON "LearningNode"
WHEN NEW."unitId" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "Unit"
  WHERE "id" = NEW."unitId" AND "domainId" = NEW."domainId"
)
BEGIN
  SELECT RAISE(ABORT, 'LearningNode unit must belong to the same Domain');
END;

CREATE TRIGGER "LearningNode_unit_domain_update_guard"
BEFORE UPDATE OF "domainId", "unitId" ON "LearningNode"
WHEN NEW."unitId" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "Unit"
  WHERE "id" = NEW."unitId" AND "domainId" = NEW."domainId"
)
BEGIN
  SELECT RAISE(ABORT, 'LearningNode unit must belong to the same Domain');
END;

CREATE TRIGGER "LearningNode_knowledge_domain_insert_guard"
BEFORE INSERT ON "LearningNode"
WHEN NEW."knowledgePointId" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "KnowledgePoint"
  WHERE "id" = NEW."knowledgePointId" AND "domainId" = NEW."domainId"
)
BEGIN
  SELECT RAISE(ABORT, 'LearningNode knowledge point must belong to the same Domain');
END;

CREATE TRIGGER "LearningNode_knowledge_domain_update_guard"
BEFORE UPDATE OF "domainId", "knowledgePointId" ON "LearningNode"
WHEN NEW."knowledgePointId" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "KnowledgePoint"
  WHERE "id" = NEW."knowledgePointId" AND "domainId" = NEW."domainId"
)
BEGIN
  SELECT RAISE(ABORT, 'LearningNode knowledge point must belong to the same Domain');
END;

CREATE TRIGGER "KnowledgeGraphNode_knowledge_domain_insert_guard"
BEFORE INSERT ON "KnowledgeGraphNode"
WHEN NEW."knowledgePointId" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "KnowledgePoint"
  WHERE "id" = NEW."knowledgePointId" AND "domainId" = NEW."domainId"
)
BEGIN
  SELECT RAISE(ABORT, 'KnowledgeGraphNode knowledge point must belong to the same Domain');
END;

CREATE TRIGGER "KnowledgeGraphNode_knowledge_domain_update_guard"
BEFORE UPDATE OF "domainId", "knowledgePointId" ON "KnowledgeGraphNode"
WHEN NEW."knowledgePointId" IS NOT NULL AND NOT EXISTS (
  SELECT 1 FROM "KnowledgePoint"
  WHERE "id" = NEW."knowledgePointId" AND "domainId" = NEW."domainId"
)
BEGIN
  SELECT RAISE(ABORT, 'KnowledgeGraphNode knowledge point must belong to the same Domain');
END;

CREATE TRIGGER "KnowledgeGraphEdge_domain_insert_guard"
BEFORE INSERT ON "KnowledgeGraphEdge"
WHEN NOT EXISTS (
  SELECT 1
  FROM "KnowledgeGraphNode" AS source, "KnowledgeGraphNode" AS target
  WHERE source."id" = NEW."fromNodeId"
    AND target."id" = NEW."toNodeId"
    AND source."domainId" = NEW."domainId"
    AND target."domainId" = NEW."domainId"
)
BEGIN
  SELECT RAISE(ABORT, 'KnowledgeGraphEdge endpoints must belong to the same Domain');
END;

CREATE TRIGGER "KnowledgeGraphEdge_domain_update_guard"
BEFORE UPDATE OF "domainId", "fromNodeId", "toNodeId" ON "KnowledgeGraphEdge"
WHEN NOT EXISTS (
  SELECT 1
  FROM "KnowledgeGraphNode" AS source, "KnowledgeGraphNode" AS target
  WHERE source."id" = NEW."fromNodeId"
    AND target."id" = NEW."toNodeId"
    AND source."domainId" = NEW."domainId"
    AND target."domainId" = NEW."domainId"
)
BEGIN
  SELECT RAISE(ABORT, 'KnowledgeGraphEdge endpoints must belong to the same Domain');
END;

CREATE TRIGGER "LearningNodeDependency_domain_insert_guard"
BEFORE INSERT ON "LearningNodeDependency"
WHEN NEW."nodeId" = NEW."prerequisiteId" OR NOT EXISTS (
  SELECT 1
  FROM "LearningNode" AS node, "LearningNode" AS prerequisite
  WHERE node."id" = NEW."nodeId"
    AND prerequisite."id" = NEW."prerequisiteId"
    AND node."domainId" = prerequisite."domainId"
)
BEGIN
  SELECT RAISE(ABORT, 'LearningNode dependency must be non-self and within one Domain');
END;

CREATE TRIGGER "LearningNodeDependency_domain_update_guard"
BEFORE UPDATE OF "nodeId", "prerequisiteId" ON "LearningNodeDependency"
WHEN NEW."nodeId" = NEW."prerequisiteId" OR NOT EXISTS (
  SELECT 1
  FROM "LearningNode" AS node, "LearningNode" AS prerequisite
  WHERE node."id" = NEW."nodeId"
    AND prerequisite."id" = NEW."prerequisiteId"
    AND node."domainId" = prerequisite."domainId"
)
BEGIN
  SELECT RAISE(ABORT, 'LearningNode dependency must be non-self and within one Domain');
END;

CREATE TRIGGER "Unit_domain_parent_update_guard"
BEFORE UPDATE OF "domainId" ON "Unit"
WHEN EXISTS (
  SELECT 1 FROM "LearningNode"
  WHERE "unitId" = OLD."id" AND "domainId" <> NEW."domainId"
)
BEGIN
  SELECT RAISE(ABORT, 'Unit Domain cannot contradict existing Learning Nodes');
END;

CREATE TRIGGER "KnowledgePoint_domain_parent_update_guard"
BEFORE UPDATE OF "domainId" ON "KnowledgePoint"
WHEN EXISTS (
  SELECT 1 FROM "LearningNode"
  WHERE "knowledgePointId" = OLD."id" AND "domainId" <> NEW."domainId"
  UNION ALL
  SELECT 1 FROM "KnowledgeGraphNode"
  WHERE "knowledgePointId" = OLD."id" AND "domainId" <> NEW."domainId"
)
BEGIN
  SELECT RAISE(ABORT, 'KnowledgePoint Domain cannot contradict existing owners');
END;

CREATE TRIGGER "KnowledgeGraphNode_domain_parent_update_guard"
BEFORE UPDATE OF "domainId" ON "KnowledgeGraphNode"
WHEN EXISTS (
  SELECT 1 FROM "KnowledgeGraphEdge"
  WHERE ("fromNodeId" = OLD."id" OR "toNodeId" = OLD."id")
    AND "domainId" <> NEW."domainId"
)
BEGIN
  SELECT RAISE(ABORT, 'KnowledgeGraphNode Domain cannot contradict existing edges');
END;

CREATE TRIGGER "LearningNode_domain_parent_update_guard"
BEFORE UPDATE OF "domainId" ON "LearningNode"
WHEN EXISTS (
  SELECT 1
  FROM "LearningNodeDependency" AS dependency
  JOIN "LearningNode" AS other
    ON other."id" = CASE
      WHEN dependency."nodeId" = OLD."id" THEN dependency."prerequisiteId"
      ELSE dependency."nodeId"
    END
  WHERE (dependency."nodeId" = OLD."id" OR dependency."prerequisiteId" = OLD."id")
    AND other."domainId" <> NEW."domainId"
)
BEGIN
  SELECT RAISE(ABORT, 'LearningNode Domain cannot contradict existing dependencies');
END;
