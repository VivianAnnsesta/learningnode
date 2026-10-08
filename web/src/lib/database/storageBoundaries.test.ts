import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("database Domain ownership guards", () => {
  let root: string;
  let client: PrismaClient;

  beforeEach(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "englishnode-storage-boundary-"));
    const databasePath = path.join(root, "isolated-seed.db");
    fs.copyFileSync(path.resolve("prisma", "seed.db"), databasePath);
    client = new PrismaClient({
      datasources: { db: { url: `file:${databasePath.replace(/\\/g, "/")}` } }
    });

    await client.$executeRawUnsafe(`
      INSERT INTO "Domain" ("id", "name", "updatedAt") VALUES
        ('domain-a', 'Domain A', '2026-07-17T00:00:00.000Z'),
        ('domain-b', 'Domain B', '2026-07-17T00:00:00.000Z')
    `);
    await client.$executeRawUnsafe(`
      INSERT INTO "Unit" ("id", "domainId", "title", "orderIndex", "status", "createdAt", "updatedAt") VALUES
        ('unit-a', 'domain-a', 'Unit A', 0, 'expanded', '2026-07-17T00:00:00.000Z', '2026-07-17T00:00:00.000Z'),
        ('unit-b', 'domain-b', 'Unit B', 0, 'expanded', '2026-07-17T00:00:00.000Z', '2026-07-17T00:00:00.000Z')
    `);
    await client.$executeRawUnsafe(`
      INSERT INTO "KnowledgePoint" (
        "id", "domainId", "title", "masteryStatus", "isIsland", "createdAt", "updatedAt"
      ) VALUES
        ('point-a', 'domain-a', 'Point A', 'seen', 0, '2026-07-17T00:00:00.000Z', '2026-07-17T00:00:00.000Z'),
        ('point-b', 'domain-b', 'Point B', 'seen', 0, '2026-07-17T00:00:00.000Z', '2026-07-17T00:00:00.000Z')
    `);
    await client.$executeRawUnsafe(`
      INSERT INTO "LearningNode" (
        "id", "domainId", "unitId", "knowledgePointId", "title", "status", "orderIndex", "createdAt", "updatedAt"
      ) VALUES
        ('node-a', 'domain-a', 'unit-a', 'point-a', 'Node A', 'available', 0, '2026-07-17T00:00:00.000Z', '2026-07-17T00:00:00.000Z'),
        ('node-b', 'domain-b', 'unit-b', 'point-b', 'Node B', 'available', 0, '2026-07-17T00:00:00.000Z', '2026-07-17T00:00:00.000Z')
    `);
    await client.$executeRawUnsafe(`
      INSERT INTO "KnowledgeGraphNode" (
        "id", "domainId", "knowledgePointId", "title", "status", "createdAt", "updatedAt"
      ) VALUES
        ('graph-a', 'domain-a', 'point-a', 'Point A', 'candidate', '2026-07-17T00:00:00.000Z', '2026-07-17T00:00:00.000Z'),
        ('graph-b', 'domain-b', 'point-b', 'Point B', 'candidate', '2026-07-17T00:00:00.000Z', '2026-07-17T00:00:00.000Z')
    `);
  });

  afterEach(async () => {
    await client.$disconnect();
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("rejects a Learning Node linked to a Unit from another Domain", async () => {
    await expect(
      client.$executeRawUnsafe(`
        UPDATE "LearningNode" SET "unitId" = 'unit-b' WHERE "id" = 'node-a'
      `)
    ).rejects.toThrow("LearningNode unit must belong to the same Domain");
  });

  it("rejects cross-Domain and self dependencies", async () => {
    await expect(
      client.$executeRawUnsafe(`
        INSERT INTO "LearningNodeDependency" ("id", "nodeId", "prerequisiteId")
        VALUES ('dependency-cross', 'node-a', 'node-b')
      `)
    ).rejects.toThrow("LearningNode dependency must be non-self and within one Domain");

    await expect(
      client.$executeRawUnsafe(`
        INSERT INTO "LearningNodeDependency" ("id", "nodeId", "prerequisiteId")
        VALUES ('dependency-self', 'node-a', 'node-a')
      `)
    ).rejects.toThrow("LearningNode dependency must be non-self and within one Domain");
  });

  it("rejects graph nodes and edges that cross Domain ownership", async () => {
    await expect(
      client.$executeRawUnsafe(`
        UPDATE "KnowledgeGraphNode" SET "knowledgePointId" = 'point-b' WHERE "id" = 'graph-a'
      `)
    ).rejects.toThrow("KnowledgeGraphNode knowledge point must belong to the same Domain");

    await expect(
      client.$executeRawUnsafe(`
        INSERT INTO "KnowledgeGraphEdge" (
          "id", "domainId", "fromNodeId", "toNodeId", "relationType", "status", "evidenceStrength", "createdAt"
        ) VALUES (
          'edge-cross', 'domain-a', 'graph-a', 'graph-b', 'related', 'candidate', 'unknown', '2026-07-17T00:00:00.000Z'
        )
      `)
    ).rejects.toThrow("KnowledgeGraphEdge endpoints must belong to the same Domain");
  });

  it("rejects parent Domain changes that would invalidate existing ownership", async () => {
    await expect(
      client.$executeRawUnsafe(`UPDATE "Unit" SET "domainId" = 'domain-b' WHERE "id" = 'unit-a'`)
    ).rejects.toThrow("Unit Domain cannot contradict existing Learning Nodes");

    await expect(
      client.$executeRawUnsafe(`
        UPDATE "KnowledgePoint" SET "domainId" = 'domain-b' WHERE "id" = 'point-a'
      `)
    ).rejects.toThrow("KnowledgePoint Domain cannot contradict existing owners");

    await client.$executeRawUnsafe(`
      INSERT INTO "LearningNode" (
        "id", "domainId", "title", "status", "orderIndex", "createdAt", "updatedAt"
      ) VALUES (
        'node-a2', 'domain-a', 'Node A2', 'available', 1,
        '2026-07-17T00:00:00.000Z', '2026-07-17T00:00:00.000Z'
      )
    `);
    await client.$executeRawUnsafe(`
      INSERT INTO "LearningNodeDependency" ("id", "nodeId", "prerequisiteId")
      VALUES ('dependency-a', 'node-a2', 'node-a')
    `);
    await expect(
      client.$executeRawUnsafe(`
        UPDATE "LearningNode" SET "domainId" = 'domain-b' WHERE "id" = 'node-a2'
      `)
    ).rejects.toThrow("LearningNode Domain cannot contradict existing dependencies");

    await client.$executeRawUnsafe(`
      INSERT INTO "KnowledgeGraphNode" (
        "id", "domainId", "title", "status", "createdAt", "updatedAt"
      ) VALUES (
        'graph-a2', 'domain-a', 'Point A2', 'candidate',
        '2026-07-17T00:00:00.000Z', '2026-07-17T00:00:00.000Z'
      )
    `);
    await client.$executeRawUnsafe(`
      INSERT INTO "KnowledgeGraphEdge" (
        "id", "domainId", "fromNodeId", "toNodeId", "relationType", "status", "evidenceStrength", "createdAt"
      ) VALUES (
        'edge-a', 'domain-a', 'graph-a', 'graph-a2', 'related', 'candidate', 'unknown',
        '2026-07-17T00:00:00.000Z'
      )
    `);
    await expect(
      client.$executeRawUnsafe(`
        UPDATE "KnowledgeGraphNode" SET "domainId" = 'domain-b' WHERE "id" = 'graph-a2'
      `)
    ).rejects.toThrow("KnowledgeGraphNode Domain cannot contradict existing edges");
  });
});
