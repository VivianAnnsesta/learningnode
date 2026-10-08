const fs = require("fs");
const os = require("os");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const { runUserDatabaseLifecycle, databaseUrl } = require("./database-lifecycle");

const webRoot = path.resolve(__dirname, "..");
const sourceDatabasePath = path.resolve(
  process.argv[2] || path.join(webRoot, "prisma", "fixtures", "legacy-pre-removal.db")
);

const collectCoreCounts = async (client) => {
  const counts = {};
  for (const table of [
    "Domain",
    "Unit",
    "LearningNode",
    "KnowledgePoint",
    "KnowledgeGraphNode",
    "AiCallLog"
  ]) {
    const [row] = await client.$queryRawUnsafe(`SELECT COUNT(*) AS count FROM "${table}"`);
    counts[table] = Number(row.count);
  }
  const wordTable = await client.$queryRawUnsafe(
    `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'Word'`
  );
  if (wordTable.length > 0) {
    const [pendingPoints] = await client.$queryRawUnsafe(`
      SELECT COUNT(*) AS count FROM "Word"
      WHERE NOT EXISTS (
        SELECT 1 FROM "KnowledgePoint" WHERE "KnowledgePoint"."legacyWordId" = "Word"."id"
      )
    `);
    const [pendingNodes] = await client.$queryRawUnsafe(`
      SELECT COUNT(*) AS count FROM "Word"
      WHERE NOT EXISTS (
        SELECT 1 FROM "KnowledgeGraphNode"
        WHERE "KnowledgeGraphNode"."knowledgePointId" = "Word"."id"
      )
    `);
    counts.UnmaterializedLegacyKnowledgePoints = Number(pendingPoints.count);
    counts.UnmaterializedLegacyGraphNodes = Number(pendingNodes.count);
  } else {
    counts.UnmaterializedLegacyKnowledgePoints = 0;
    counts.UnmaterializedLegacyGraphNodes = 0;
  }
  const formalEdges = await client.$queryRawUnsafe(
    'SELECT * FROM "KnowledgeGraphEdge"'
  );
  const wordRelationTable = await client.$queryRawUnsafe(
    `SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'WordRelation'`
  );
  const legacyEdges = wordRelationTable.length > 0
    ? await client.$queryRawUnsafe(`
        SELECT "WordRelation"."id", "FromWord"."canvasId" AS "domainId",
               "WordRelation"."fromWordId" AS "fromNodeId",
               "WordRelation"."toWordId" AS "toNodeId", "WordRelation"."relationType",
               "WordRelation"."detail", "WordRelation"."status",
               "WordRelation"."evidenceStrength", "WordRelation"."userExplanation",
               "WordRelation"."aiAssessment", "WordRelation"."applicability",
               "WordRelation"."misuseRisk", "WordRelation"."createdAt"
        FROM "WordRelation"
        JOIN "Word" AS "FromWord" ON "FromWord"."id" = "WordRelation"."fromWordId"
        JOIN "Word" AS "ToWord" ON "ToWord"."id" = "WordRelation"."toWordId"
      `)
    : [];
  const effectiveEdges = new Map(formalEdges.map((edge) => [edge.id, edge]));
  for (const edge of legacyEdges) {
    if (!effectiveEdges.has(edge.id)) effectiveEdges.set(edge.id, edge);
  }
  const businessKeys = new Set(
    [...effectiveEdges.values()].map((edge) =>
      JSON.stringify([edge.domainId, edge.fromNodeId, edge.toNodeId, edge.relationType])
    )
  );
  const edgeColumns = await client.$queryRawUnsafe('PRAGMA table_info("KnowledgeGraphEdge")');
  const hasVariants = edgeColumns.some((column) => column.name === "legacyVariantsJson");
  let semanticVariantCount = formalEdges.length + legacyEdges.length;
  if (hasVariants) {
    const rows = await client.$queryRawUnsafe(
      'SELECT "legacyVariantsJson" FROM "KnowledgeGraphEdge"'
    );
    semanticVariantCount = rows.reduce((total, row) => {
      if (!row.legacyVariantsJson) return total + 1;
      const variants = JSON.parse(row.legacyVariantsJson);
      if (!Array.isArray(variants) || variants.length === 0) {
        throw new Error("KnowledgeGraphEdge legacyVariantsJson is not a non-empty array.");
      }
      return total + variants.length;
    }, 0);
  }
  counts.KnowledgeGraphEdgeRows = effectiveEdges.size;
  counts.KnowledgeGraphEdgeBusinessRelations = businessKeys.size;
  counts.KnowledgeGraphEdgeSemanticVariants = semanticVariantCount;
  return counts;
};

const main = async () => {
  if (!fs.existsSync(sourceDatabasePath)) {
    throw new Error(`Source database does not exist: ${sourceDatabasePath}`);
  }

  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "englishnode-migration-fidelity-"));
  const isolatedDatabasePath = path.join(temporaryRoot, "englishnode.db");
  const confirmationUpgradeDatabasePath = path.join(
    temporaryRoot,
    "confirmed-map-upgrade.db"
  );
  fs.copyFileSync(sourceDatabasePath, isolatedDatabasePath, fs.constants.COPYFILE_EXCL);
  fs.copyFileSync(
    path.join(webRoot, "prisma", "seed.db"),
    confirmationUpgradeDatabasePath,
    fs.constants.COPYFILE_EXCL
  );

  try {
    const beforeClient = new PrismaClient({
      datasources: { db: { url: databaseUrl(isolatedDatabasePath) } }
    });
    let beforeCounts;
    try {
      beforeCounts = await collectCoreCounts(beforeClient);
    } finally {
      await beforeClient.$disconnect();
    }

    const lifecycleResult = await runUserDatabaseLifecycle({
      userDatabasePath: isolatedDatabasePath,
      seedDatabasePath: path.join(webRoot, "prisma", "seed.db"),
      schemaPath: path.join(webRoot, "prisma", "schema.prisma"),
      prismaCliPath: path.join(webRoot, "node_modules", "prisma", "build", "index.js"),
      PrismaClient,
      now: () => new Date("2026-07-17T00:00:00.000Z")
    });

    const preparationClient = new PrismaClient({
      datasources: { db: { url: databaseUrl(confirmationUpgradeDatabasePath) } }
    });
    try {
      await preparationClient.$executeRawUnsafe(
        'DELETE FROM "_prisma_migrations" WHERE "migration_name" = ?',
        "20260719123000_add_task_brief_confirmation"
      );
      await preparationClient.$executeRawUnsafe(
        'ALTER TABLE "Domain" DROP COLUMN "taskBriefConfirmedAt"'
      );
      await preparationClient.$executeRawUnsafe(
        'ALTER TABLE "Domain" DROP COLUMN "roadmapDraftCourseDesignAiCallLogId"'
      );
      await preparationClient.$executeRawUnsafe(`
        INSERT INTO "Domain" (
          "id", "name", "taskBrief", "courseDesignStatus",
          "courseDesignConfirmedAt", "roadmapStatus", "mapRevision",
          "status", "createdAt", "updatedAt"
        ) VALUES
          (
            'confirmed-course-design-before-task-brief-column',
            'Historical confirmed course design',
            'Course-design-confirmed historical task brief',
            'confirmed',
            '2026-07-16T08:30:00.000Z',
            'draft',
            0,
            'active',
            '2026-07-16T08:00:00.000Z',
            '2026-07-16T08:45:00.000Z'
          ),
          (
            'confirmed-map-before-task-brief-column',
            'Historical confirmed map',
            'Formal-map-confirmed historical task brief',
            'confirmed',
            NULL,
            'confirmed',
            2,
            'active',
            '2026-07-16T08:00:00.000Z',
            '2026-07-16T09:00:00.000Z'
          ),
          (
            'text-only-before-task-brief-column',
            'Historical unconfirmed text',
            'Non-empty text without explicit confirmation evidence',
            'none',
            NULL,
            'draft',
            0,
            'active',
            '2026-07-16T08:00:00.000Z',
            '2026-07-16T09:15:00.000Z'
          )
      `);
    } finally {
      await preparationClient.$disconnect();
    }

    await runUserDatabaseLifecycle({
      userDatabasePath: confirmationUpgradeDatabasePath,
      seedDatabasePath: path.join(webRoot, "prisma", "seed.db"),
      schemaPath: path.join(webRoot, "prisma", "schema.prisma"),
      prismaCliPath: path.join(webRoot, "node_modules", "prisma", "build", "index.js"),
      PrismaClient,
      now: () => new Date("2026-07-19T00:00:00.000Z")
    });

    const confirmationUpgradeClient = new PrismaClient({
      datasources: { db: { url: databaseUrl(confirmationUpgradeDatabasePath) } }
    });
    let taskBriefConfirmationBackfill;
    try {
      const upgradedDomains = await confirmationUpgradeClient.$queryRawUnsafe(`
        SELECT "id", "taskBriefConfirmedAt", "courseDesignConfirmedAt", "updatedAt"
        FROM "Domain"
        WHERE "id" IN (
          'confirmed-course-design-before-task-brief-column',
          'confirmed-map-before-task-brief-column',
          'text-only-before-task-brief-column'
        )
      `);
      const byId = new Map(upgradedDomains.map((domain) => [domain.id, domain]));
      const courseDesignDomain = byId.get(
        "confirmed-course-design-before-task-brief-column"
      );
      const confirmedMapDomain = byId.get(
        "confirmed-map-before-task-brief-column"
      );
      const textOnlyDomain = byId.get("text-only-before-task-brief-column");
      taskBriefConfirmationBackfill = {
        courseDesignEvidence: Boolean(
          courseDesignDomain?.taskBriefConfirmedAt &&
            new Date(courseDesignDomain.taskBriefConfirmedAt).getTime() ===
              new Date(courseDesignDomain.courseDesignConfirmedAt).getTime()
        ),
        formalMapEvidence: Boolean(
          confirmedMapDomain?.taskBriefConfirmedAt &&
            new Date(confirmedMapDomain.taskBriefConfirmedAt).getTime() ===
              new Date(confirmedMapDomain.updatedAt).getTime()
        ),
        textOnlyRejected: textOnlyDomain?.taskBriefConfirmedAt == null
      };
      if (Object.values(taskBriefConfirmationBackfill).some((passed) => !passed)) {
        throw new Error(
          "Historical Task Brief confirmation evidence was not backfilled safely."
        );
      }
    } finally {
      await confirmationUpgradeClient.$disconnect();
    }

    const client = new PrismaClient({
      datasources: { db: { url: databaseUrl(isolatedDatabasePath) } }
    });
    try {
      const foreignKeyViolations = await client.$queryRawUnsafe("PRAGMA foreign_key_check");
      if (foreignKeyViolations.length > 0) {
        throw new Error(
          `Isolated migration left ${foreignKeyViolations.length} foreign-key violation(s).`
        );
      }

      const afterCounts = await collectCoreCounts(client);
      for (const [table, beforeCount] of Object.entries(beforeCounts)) {
        if (
          table === "KnowledgeGraphEdgeRows" ||
          table === "UnmaterializedLegacyKnowledgePoints" ||
          table === "UnmaterializedLegacyGraphNodes"
        ) continue;
        const expectedCount = table === "KnowledgePoint"
          ? beforeCount + beforeCounts.UnmaterializedLegacyKnowledgePoints
          : table === "KnowledgeGraphNode"
            ? beforeCount + beforeCounts.UnmaterializedLegacyGraphNodes
            : beforeCount;
        if (afterCounts[table] !== expectedCount) {
          throw new Error(
            `Migration count fidelity failed for ${table}: expected ${expectedCount}, got ${afterCounts[table]}`
          );
        }
      }
      if (
        afterCounts.UnmaterializedLegacyKnowledgePoints !== 0 ||
        afterCounts.UnmaterializedLegacyGraphNodes !== 0
      ) {
        throw new Error("Migration left legacy Words without formal KnowledgePoint/graph-node rows.");
      }

      const backupExists = Boolean(
        lifecycleResult.backupPath && fs.existsSync(lifecycleResult.backupPath)
      );
      if (!backupExists) {
        throw new Error("Isolated migration did not create the required pre-migration backup.");
      }

      console.log(
        JSON.stringify(
          {
            sourceDatabasePath,
            isolatedDatabasePath,
            backupCreated: backupExists,
            foreignKeyViolations: 0,
            taskBriefConfirmationBackfill,
            beforeCounts,
            afterCounts
          },
          null,
          2
        )
      );
    } finally {
      await client.$disconnect();
    }
  } finally {
    if (process.env.KEEP_MIGRATION_FIDELITY_FIXTURE === "1") {
      console.error(`Kept isolated migration fixture: ${temporaryRoot}`);
    } else {
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
