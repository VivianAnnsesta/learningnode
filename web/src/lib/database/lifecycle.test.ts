import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  captureLegacyMigrationFidelity,
  markHistoricalMigrationsApplied,
  prepareUserDatabase,
  restoreLegacyMigrationFidelity,
  runPrismaDbExecute,
  runPrismaMigrateDeploy,
  verifyMigrationFidelity
} from "../../../scripts/database-lifecycle";

const temporaryDirectories: string[] = [];

const temporaryDirectory = () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "englishnode-db-"));
  temporaryDirectories.push(directory);
  return directory;
};

describe("prepareUserDatabase", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    for (const directory of temporaryDirectories.splice(0)) {
      fs.rmSync(directory, { recursive: true, force: true });
    }
  });

  it("preserves supported legacy fields, inference structure, relations, and tags", async () => {
    const root = temporaryDirectory();
    const databasePath = path.join(root, "legacy.db");
    const client = new PrismaClient({
      datasources: { db: { url: `file:${databasePath.replace(/\\/g, "/")}` } }
    });
    const executeStatements = async (sql: string) => {
      for (const statement of sql.split(";").map((value) => value.trim()).filter(Boolean)) {
        await client.$executeRawUnsafe(statement);
      }
    };

    try {
      await executeStatements(`
        CREATE TABLE "Word" (
          "id" TEXT PRIMARY KEY,
          "text" TEXT NOT NULL,
          "nodeType" TEXT,
          "masteryStatus" TEXT,
          "isIsland" INTEGER,
          "islandReason" TEXT,
          "userUnderstanding" TEXT,
          "positionX" REAL,
          "positionY" REAL,
          "createdAt" DATETIME,
          "updatedAt" DATETIME,
          "language" TEXT,
          "sentenceSample" TEXT,
          "canvasId" TEXT NOT NULL,
          "lastReviewedAt" DATETIME,
          "nextReviewAt" DATETIME,
          "reviewIntervalDays" INTEGER
        );
        CREATE TABLE "CoreEssence" (
          "id" TEXT PRIMARY KEY,
          "wordId" TEXT NOT NULL,
          "summary" TEXT NOT NULL,
          "rationale" TEXT,
          "createdAt" DATETIME NOT NULL
        );
        CREATE TABLE "InferenceTree" (
          "id" TEXT PRIMARY KEY,
          "wordId" TEXT NOT NULL,
          "name" TEXT,
          "description" TEXT,
          "createdAt" DATETIME NOT NULL,
          "updatedAt" DATETIME NOT NULL
        );
        CREATE TABLE "TreeNode" (
          "id" TEXT PRIMARY KEY,
          "treeId" TEXT NOT NULL,
          "label" TEXT NOT NULL,
          "nodeType" TEXT NOT NULL,
          "content" TEXT,
          "createdAt" DATETIME NOT NULL,
          "updatedAt" DATETIME NOT NULL
        );
        CREATE TABLE "NodeRelation" (
          "id" TEXT PRIMARY KEY,
          "treeId" TEXT NOT NULL,
          "fromNodeId" TEXT NOT NULL,
          "toNodeId" TEXT NOT NULL,
          "relationType" TEXT NOT NULL,
          "detail" TEXT,
          "createdAt" DATETIME NOT NULL
        );
        CREATE TABLE "Tag" ("id" TEXT PRIMARY KEY, "name" TEXT NOT NULL);
        CREATE TABLE "WordTag" ("wordId" TEXT NOT NULL, "tagId" TEXT NOT NULL);
        CREATE TABLE "NodeTag" ("nodeId" TEXT NOT NULL, "tagId" TEXT NOT NULL);
        CREATE TABLE "TreeTag" ("treeId" TEXT NOT NULL, "tagId" TEXT NOT NULL);
        CREATE TABLE "KnowledgePoint" (
          "id" TEXT PRIMARY KEY,
          "legacyWordId" TEXT,
          "domainId" TEXT,
          "title" TEXT,
          "userUnderstanding" TEXT,
          "masteryStatus" TEXT,
          "isIsland" INTEGER,
          "islandReason" TEXT,
          "language" TEXT,
          "sentenceSample" TEXT,
          "coreEssence" TEXT,
          "manualBranchesJson" TEXT,
          "lastReviewedAt" DATETIME,
          "nextReviewAt" DATETIME,
          "reviewIntervalDays" INTEGER,
          "createdAt" DATETIME,
          "updatedAt" DATETIME
        );
        CREATE TABLE "KnowledgeGraphNode" (
          "id" TEXT PRIMARY KEY,
          "domainId" TEXT,
          "knowledgePointId" TEXT,
          "title" TEXT,
          "nodeType" TEXT,
          "status" TEXT,
          "positionX" REAL,
          "positionY" REAL,
          "createdAt" DATETIME,
          "updatedAt" DATETIME
        );
        CREATE TABLE "KnowledgeGraphEdge" (
          "id" TEXT PRIMARY KEY,
          "domainId" TEXT NOT NULL,
          "fromNodeId" TEXT NOT NULL,
          "toNodeId" TEXT NOT NULL,
          "relationType" TEXT NOT NULL,
          "detail" TEXT,
          "status" TEXT NOT NULL,
          "evidenceStrength" TEXT NOT NULL,
          "userExplanation" TEXT,
          "aiAssessment" TEXT,
          "applicability" TEXT,
          "misuseRisk" TEXT,
          "createdAt" DATETIME NOT NULL
        );
      `);
      await executeStatements(`
        INSERT INTO "Word" VALUES (
          'word-1', 'closure', 'knowledge', 'seen', 0, NULL,
          'A function and retained environment.', 12.5, 24.5,
          '2026-06-01T00:00:00.000Z', '2026-06-05T00:00:00.000Z',
          'en', 'A closure retains lexical state.', 'domain-1',
          '2026-06-01T00:00:00.000Z', '2026-06-08T00:00:00.000Z', 7
        );
        INSERT INTO "CoreEssence" VALUES (
          'core-1', 'word-1', 'Function plus retained environment.',
          'Explains why captured variables remain available.', '2026-06-02T00:00:00.000Z'
        );
        INSERT INTO "InferenceTree" VALUES (
          'tree-1', 'word-1', 'Execution model', 'Trace retained state',
          '2026-06-03T00:00:00.000Z', '2026-06-03T00:00:00.000Z'
        );
        INSERT INTO "TreeNode" VALUES
          ('node-1', 'tree-1', 'Create function', 'step', 'Capture scope', '2026-06-03T00:00:00.000Z', '2026-06-03T00:00:00.000Z'),
          ('node-2', 'tree-1', 'Call later', 'step', 'Read captured value', '2026-06-03T00:00:00.000Z', '2026-06-03T00:00:00.000Z');
        INSERT INTO "NodeRelation" VALUES (
          'relation-1', 'tree-1', 'node-1', 'node-2', 'leads_to', 'Later invocation', '2026-06-03T00:00:00.000Z'
        );
        INSERT INTO "Tag" VALUES ('tag-word', 'javascript'), ('tag-node', 'runtime'), ('tag-tree', 'reasoning');
        INSERT INTO "WordTag" VALUES ('word-1', 'tag-word');
        INSERT INTO "NodeTag" VALUES ('node-2', 'tag-node');
        INSERT INTO "TreeTag" VALUES ('tree-1', 'tag-tree');
        INSERT INTO "KnowledgePoint" (
          "id", "legacyWordId", "domainId", "title", "userUnderstanding", "masteryStatus",
          "isIsland", "islandReason", "coreEssence", "createdAt", "updatedAt"
        ) VALUES (
          'word-1', 'word-1', 'domain-1', 'closure', 'A function and retained environment.',
          'seen', 0, NULL, 'Function plus retained environment.',
          '2026-06-01T00:00:00.000Z', '2026-06-05T00:00:00.000Z'
        );
        INSERT INTO "KnowledgeGraphNode" VALUES (
          'word-1', 'domain-1', 'word-1', 'closure', 'knowledge', 'seen', 12.5, 24.5,
          '2026-06-01T00:00:00.000Z', '2026-06-05T00:00:00.000Z'
        );
        INSERT INTO "KnowledgeGraphEdge" VALUES
          ('edge-1', 'domain-1', 'graph-a', 'graph-b', 'related', 'First detail', 'candidate', 'weak', 'First explanation', NULL, NULL, NULL, '2026-06-04T00:00:00.000Z'),
          ('edge-2', 'domain-1', 'graph-a', 'graph-b', 'related', 'Second detail', 'confirmed', 'strong', 'Second explanation', 'Useful', 'Runtime only', 'Overgeneralization', '2026-06-05T00:00:00.000Z');
      `);

      const snapshot = await captureLegacyMigrationFidelity({
        userDatabasePath: databasePath,
        PrismaClient
      });
      expect(snapshot).not.toBeNull();

      await client.$executeRawUnsafe('DELETE FROM "KnowledgeGraphEdge" WHERE "id" = \'edge-2\'');
      await client.$executeRawUnsafe(
        'ALTER TABLE "KnowledgeGraphEdge" ADD COLUMN "legacyVariantsJson" TEXT'
      );

      await restoreLegacyMigrationFidelity({
        userDatabasePath: databasePath,
        PrismaClient,
        snapshot: snapshot!
      });
      const report = await verifyMigrationFidelity({
        userDatabasePath: databasePath,
        PrismaClient,
        snapshot: snapshot!
      });

      const [point] = await client.$queryRawUnsafe<Record<string, unknown>[]>(
        'SELECT * FROM "KnowledgePoint" WHERE "legacyWordId" = ?',
        "word-1"
      );
      expect(point).toMatchObject({
        language: "en",
        sentenceSample: "A closure retains lexical state.",
        reviewIntervalDays: 7
      });
      expect(JSON.parse(String(point.manualBranchesJson))).toMatchObject({
        version: 1,
        branches: [
          { title: "Create function", detail: "Capture scope" },
          { title: "Call later", detail: "Read captured value" }
        ],
        legacy: {
          coreEssences: [
            { rationale: "Explains why captured variables remain available." }
          ],
          inferenceTrees: [
            {
              tags: ["reasoning"],
              nodes: expect.arrayContaining([
                expect.objectContaining({ id: "node-2", tags: ["runtime"] })
              ]),
              relations: [expect.objectContaining({ id: "relation-1" })]
            }
          ],
          wordTags: ["javascript"]
        }
      });
      const [edge] = await client.$queryRawUnsafe<Array<{ legacyVariantsJson: string }>>(
        'SELECT "legacyVariantsJson" FROM "KnowledgeGraphEdge" WHERE "id" = \'edge-1\''
      );
      expect(JSON.parse(edge.legacyVariantsJson)).toEqual([
        expect.objectContaining({ id: "edge-1", detail: "First detail" }),
        expect.objectContaining({ id: "edge-2", detail: "Second detail" })
      ]);
      expect(report).toEqual({
        words: 1,
        coreEssences: 1,
        inferenceTrees: 1,
        treeNodes: 2,
        nodeRelations: 1,
        tagAssignments: 3,
        knowledgeGraphEdgeVariants: 2
      });
    } finally {
      await client.$disconnect();
    }
  });

  it("fails fidelity verification when a preserved field drifts", async () => {
    const snapshot = {
      version: 2 as const,
      capturedAt: "2026-07-17T00:00:00.000Z",
      words: [
        {
          id: "word-1",
          text: "closure",
          canvasId: "domain-1",
          nodeType: "knowledge",
          masteryStatus: "seen",
          isIsland: 0,
          islandReason: null,
          userUnderstanding: null,
          positionX: 0,
          positionY: 0,
          createdAt: null,
          updatedAt: null,
          language: "en",
          sentenceSample: "Expected sample",
          lastReviewedAt: null,
          nextReviewAt: null,
          reviewIntervalDays: 3,
          coreEssences: [],
          inferenceTrees: [],
          wordTags: []
        }
      ],
      knowledgeGraphEdges: []
    };
    const queryRaw = vi.fn(async () => [
      {
        legacyWordId: "word-1",
        domainId: "domain-1",
        title: "closure",
        userUnderstanding: null,
        masteryStatus: "seen",
        isIsland: 0,
        islandReason: null,
        createdAt: null,
        updatedAt: null,
        language: "en",
        sentenceSample: "Changed sample",
        lastReviewedAt: null,
        nextReviewAt: null,
        reviewIntervalDays: 3,
        manualBranchesJson: null
      }
    ]);
    class DriftedPrismaClient {
      $queryRawUnsafe = queryRaw;
      $executeRawUnsafe = vi.fn();
      $disconnect = vi.fn();
    }

    await expect(
      verifyMigrationFidelity({
        userDatabasePath: "C:\\isolated\\legacy.db",
        PrismaClient: DriftedPrismaClient,
        snapshot
      })
    ).rejects.toThrow('Migration fidelity check failed for Word "word-1": sentenceSample');
  });

  it("captures an older Word schema before review scheduling columns existed", async () => {
    const root = temporaryDirectory();
    const databasePath = path.join(root, "early-legacy.db");
    const client = new PrismaClient({
      datasources: { db: { url: `file:${databasePath.replace(/\\/g, "/")}` } }
    });
    try {
      await client.$executeRawUnsafe(`
        CREATE TABLE "Word" (
          "id" TEXT PRIMARY KEY,
          "language" TEXT,
          "sentenceSample" TEXT
        )
      `);
      await client.$executeRawUnsafe(`
        INSERT INTO "Word" ("id", "language", "sentenceSample")
        VALUES ('word-early', 'en', 'Early schema sample')
      `);

      const snapshot = await captureLegacyMigrationFidelity({
        userDatabasePath: databasePath,
        PrismaClient
      });

      expect(snapshot?.words[0]).toMatchObject({
        id: "word-early",
        language: "en",
        sentenceSample: "Early schema sample",
        lastReviewedAt: null,
        nextReviewAt: null,
        reviewIntervalDays: null
      });
    } finally {
      await client.$disconnect();
    }
  });

  it("blocks capture when a legacy Tag assignment is orphaned", async () => {
    const root = temporaryDirectory();
    const databasePath = path.join(root, "orphan-tag.db");
    const client = new PrismaClient({
      datasources: { db: { url: `file:${databasePath.replace(/\\/g, "/")}` } }
    });
    try {
      await client.$executeRawUnsafe('CREATE TABLE "Word" ("id" TEXT PRIMARY KEY)');
      await client.$executeRawUnsafe('CREATE TABLE "Tag" ("id" TEXT PRIMARY KEY, "name" TEXT)');
      await client.$executeRawUnsafe('CREATE TABLE "WordTag" ("wordId" TEXT, "tagId" TEXT)');
      await client.$executeRawUnsafe('INSERT INTO "Word" ("id") VALUES (\'word-1\')');
      await client.$executeRawUnsafe(
        'INSERT INTO "WordTag" ("wordId", "tagId") VALUES (\'word-1\', \'missing-tag\')'
      );

      await expect(
        captureLegacyMigrationFidelity({ userDatabasePath: databasePath, PrismaClient })
      ).rejects.toThrow("Legacy migration fidelity capture found an orphaned Tag assignment");
    } finally {
      await client.$disconnect();
    }
  });

  it("blocks capture when a legacy Tag assignment owner is orphaned", async () => {
    const root = temporaryDirectory();
    const databasePath = path.join(root, "orphan-tag-owner.db");
    const client = new PrismaClient({
      datasources: { db: { url: `file:${databasePath.replace(/\\/g, "/")}` } }
    });
    try {
      await client.$executeRawUnsafe('CREATE TABLE "Word" ("id" TEXT PRIMARY KEY)');
      await client.$executeRawUnsafe('CREATE TABLE "Tag" ("id" TEXT PRIMARY KEY, "name" TEXT)');
      await client.$executeRawUnsafe('CREATE TABLE "WordTag" ("wordId" TEXT, "tagId" TEXT)');
      await client.$executeRawUnsafe('INSERT INTO "Tag" ("id", "name") VALUES (\'tag-1\', \'valid\')');
      await client.$executeRawUnsafe(
        'INSERT INTO "WordTag" ("wordId", "tagId") VALUES (\'missing-word\', \'tag-1\')'
      );

      await expect(
        captureLegacyMigrationFidelity({ userDatabasePath: databasePath, PrismaClient })
      ).rejects.toThrow("Legacy migration fidelity capture found an orphaned Tag assignment");
    } finally {
      await client.$disconnect();
    }
  });

  it("rejects a stale v1 fidelity snapshot before opening the database", async () => {
    class NeverOpenedPrismaClient {
      constructor() {
        throw new Error("database should not be opened");
      }
    }
    await expect(
      restoreLegacyMigrationFidelity({
        userDatabasePath: "C:\\isolated\\legacy.db",
        PrismaClient: NeverOpenedPrismaClient as never,
        snapshot: { version: 1 } as never
      })
    ).rejects.toThrow("Unsupported migration fidelity snapshot");
  });

  it("fails closed when relation deduplication was already applied without variant storage", async () => {
    const root = temporaryDirectory();
    const databasePath = path.join(root, "already-deduped.db");
    const client = new PrismaClient({
      datasources: { db: { url: `file:${databasePath.replace(/\\/g, "/")}` } }
    });
    try {
      await client.$executeRawUnsafe(`CREATE TABLE "KnowledgeGraphEdge" (
        "id" TEXT PRIMARY KEY, "domainId" TEXT, "fromNodeId" TEXT, "toNodeId" TEXT,
        "relationType" TEXT
      )`);
      await client.$executeRawUnsafe(`CREATE TABLE "_prisma_migrations" (
        "migration_name" TEXT, "finished_at" DATETIME, "rolled_back_at" DATETIME
      )`);
      await client.$executeRawUnsafe(`INSERT INTO "_prisma_migrations" VALUES (
        '20260714203000_make_knowledge_graph_edges_idempotent',
        '2026-07-17T00:00:00.000Z', NULL
      )`);

      await expect(
        captureLegacyMigrationFidelity({ userDatabasePath: databasePath, PrismaClient })
      ).rejects.toThrow("Restore a backup from before the relation deduplication migration");
    } finally {
      await client.$disconnect();
    }
  });

  it("preserves both semantics when a WordRelation and formal edge share an id", async () => {
    const root = temporaryDirectory();
    const databasePath = path.join(root, "overlapping-relations.db");
    const client = new PrismaClient({
      datasources: { db: { url: `file:${databasePath.replace(/\\/g, "/")}` } }
    });
    try {
      await client.$executeRawUnsafe(`CREATE TABLE "Word" (
        "id" TEXT PRIMARY KEY, "text" TEXT, "canvasId" TEXT
      )`);
      await client.$executeRawUnsafe(`CREATE TABLE "WordRelation" (
        "id" TEXT PRIMARY KEY, "fromWordId" TEXT, "toWordId" TEXT,
        "relationType" TEXT, "detail" TEXT, "status" TEXT, "evidenceStrength" TEXT,
        "userExplanation" TEXT, "aiAssessment" TEXT, "applicability" TEXT,
        "misuseRisk" TEXT, "createdAt" DATETIME
      )`);
      await client.$executeRawUnsafe(`CREATE TABLE "KnowledgeGraphEdge" (
        "id" TEXT PRIMARY KEY, "domainId" TEXT, "fromNodeId" TEXT, "toNodeId" TEXT,
        "relationType" TEXT, "detail" TEXT, "status" TEXT, "evidenceStrength" TEXT,
        "userExplanation" TEXT, "aiAssessment" TEXT, "applicability" TEXT,
        "misuseRisk" TEXT, "createdAt" DATETIME
      )`);
      await client.$executeRawUnsafe(`INSERT INTO "Word" VALUES
        ('word-a', 'A', 'domain-1'), ('word-b', 'B', 'domain-1')`);
      await client.$executeRawUnsafe(`INSERT INTO "KnowledgeGraphEdge" VALUES (
        'shared-id', 'domain-1', 'word-a', 'word-b', 'related', 'formal detail',
        'candidate', 'weak', NULL, NULL, NULL, NULL, '2026-07-01T00:00:00.000Z'
      )`);
      await client.$executeRawUnsafe(`INSERT INTO "WordRelation" VALUES (
        'shared-id', 'word-a', 'word-b', 'related', 'legacy detail',
        'confirmed', 'strong', 'different semantics', NULL, NULL, NULL,
        '2026-07-02T00:00:00.000Z'
      )`);

      const snapshot = await captureLegacyMigrationFidelity({
        userDatabasePath: databasePath,
        PrismaClient
      });
      expect(snapshot?.knowledgeGraphEdges).toEqual([
        expect.objectContaining({ legacySource: "KnowledgeGraphEdge", detail: "formal detail" }),
        expect.objectContaining({ legacySource: "WordRelation", detail: "legacy detail" })
      ]);
    } finally {
      await client.$disconnect();
    }
  });

  it("marks only migrations represented by the committed baseline", async () => {
    const root = temporaryDirectory();
    const migrationsDirectory = path.join(root, "migrations");
    for (const name of ["001_initial", "002_baseline_end", "003_forward"]) {
      const directory = path.join(migrationsDirectory, name);
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(path.join(directory, "migration.sql"), `-- ${name}`, "utf8");
    }
    const applied: string[] = [];
    class RecordingPrismaClient {
      $queryRawUnsafe = vi.fn(async () => []);
      $executeRawUnsafe = vi.fn(async (query: string, ...values: unknown[]) => {
        if (query.includes('INSERT INTO "_prisma_migrations"')) {
          applied.push(String(values[3]));
        }
      });
      $disconnect = vi.fn();
    }

    await markHistoricalMigrationsApplied({
      userDatabasePath: path.join(root, "seed.db"),
      migrationsDirectory,
      PrismaClient: RecordingPrismaClient,
      throughMigration: "002_baseline_end",
      now: () => new Date("2026-07-17T00:00:00.000Z")
    });

    expect(applied).toEqual(["001_initial", "002_baseline_end"]);
  });

  it("creates a new user database from the versioned empty seed before migration", async () => {
    const root = temporaryDirectory();
    const seedDatabasePath = path.join(root, "seed.db");
    const userDatabasePath = path.join(root, "user-data", "englishnode.db");
    fs.writeFileSync(seedDatabasePath, "empty-seed", "utf8");
    const migrate = vi.fn();
    const foreignKeyCheck = vi.fn(() => []);

    const result = await prepareUserDatabase({
      userDatabasePath,
      seedDatabasePath,
      migrate,
      foreignKeyCheck,
      now: () => new Date("2026-07-13T00:00:00.000Z")
    });

    expect(fs.readFileSync(userDatabasePath, "utf8")).toBe("empty-seed");
    expect(result).toEqual({ userDatabasePath, createdFromSeed: true, backupPath: null });
    expect(migrate).toHaveBeenCalledWith(userDatabasePath);
    expect(foreignKeyCheck).toHaveBeenCalledWith(userDatabasePath);
  });

  it("backs up an existing database and blocks startup when foreign keys fail", async () => {
    const root = temporaryDirectory();
    const seedDatabasePath = path.join(root, "seed.db");
    const userDatabasePath = path.join(root, "user-data", "englishnode.db");
    fs.mkdirSync(path.dirname(userDatabasePath), { recursive: true });
    fs.writeFileSync(seedDatabasePath, "empty-seed", "utf8");
    fs.writeFileSync(userDatabasePath, "user-data", "utf8");

    await expect(
      prepareUserDatabase({
        userDatabasePath,
        seedDatabasePath,
        migrate: vi.fn(),
        foreignKeyCheck: () => [{ table: "AiCallLog", rowid: 1 }],
        now: () => new Date("2026-07-13T00:00:00.000Z")
      })
    ).rejects.toThrow("Foreign-key check failed with 1 violation(s).");

    expect(
      fs.readFileSync(
        path.join(root, "user-data", "englishnode.backup-2026-07-13T00-00-00-000Z.db"),
        "utf8"
      )
    ).toBe("user-data");
  });

  it("fails closed when Prisma migration deploy exits unsuccessfully", () => {
    expect(() =>
      runPrismaMigrateDeploy({
        userDatabasePath: "C:\\user-data\\englishnode.db",
        schemaPath: "C:\\app-server\\prisma\\schema.prisma",
        prismaCliPath: "C:\\app-server\\node_modules\\prisma\\build\\index.js",
        spawnSync: () => ({ status: 1, stderr: Buffer.from("migration failed") })
      })
    ).toThrow("Prisma migrate deploy failed: migration failed");
  });

  it("runs the Prisma CLI in Node mode when invoked by packaged Electron", () => {
    const spawnSync = vi.fn((..._args: unknown[]) => ({ status: 0, stderr: "" }));

    runPrismaMigrateDeploy({
      userDatabasePath: "C:\\user-data\\englishnode.db",
      schemaPath: "C:\\app-server\\prisma\\schema.prisma",
      prismaCliPath: "C:\\app-server\\node_modules\\prisma\\build\\index.js",
      spawnSync
    });

    expect(spawnSync.mock.calls[0]?.[2]).toMatchObject({
      env: expect.objectContaining({ ELECTRON_RUN_AS_NODE: "1" })
    });
  });

  it("fails closed when the committed baseline cannot be executed", () => {
    expect(() =>
      runPrismaDbExecute({
        userDatabasePath: "C:\\user-data\\englishnode.db",
        schemaPath: "C:\\app-server\\prisma\\schema.prisma",
        prismaCliPath: "C:\\app-server\\node_modules\\prisma\\build\\index.js",
        sqlFilePath: "C:\\app-server\\prisma\\baseline\\20260713_prd_v1_2_schema.sql",
        spawnSync: () => ({ status: 1, stderr: Buffer.from("baseline failed") })
      })
    ).toThrow("Prisma db execute failed: baseline failed");
  });
});
