const fs = require("fs");
const path = require("path");
const {
  checkForeignKeysWithPrisma,
  markHistoricalMigrationsApplied,
  runPrismaDbExecute,
  runPrismaMigrateDeploy
} = require("./database-lifecycle");
const { PrismaClient } = require("@prisma/client");

const webRoot = path.resolve(__dirname, "..");
const seedDatabasePath = path.join(webRoot, "prisma", "seed.db");
const schemaPath = path.join(webRoot, "prisma", "schema.prisma");
const baselineSqlPath = path.join(
  webRoot,
  "prisma",
  "baseline",
  "20260713_prd_v1_2_schema.sql"
);
const migrationsDirectory = path.join(webRoot, "prisma", "migrations");
const baselineThroughMigration = "20260708190000_remove_legacy_models";
const prismaCliPath = require.resolve("prisma/build/index.js");
const seedSidecarPaths = ["-journal", "-wal", "-shm"].map(
  (suffix) => `${seedDatabasePath}${suffix}`
);

const removeSeedSidecars = () => {
  for (const sidecarPath of seedSidecarPaths) fs.rmSync(sidecarPath, { force: true });
};

const main = async () => {
  removeSeedSidecars();
  fs.rmSync(seedDatabasePath, { force: true });
  runPrismaDbExecute({
    userDatabasePath: seedDatabasePath,
    schemaPath,
    prismaCliPath,
    sqlFilePath: baselineSqlPath
  });
  await markHistoricalMigrationsApplied({
    userDatabasePath: seedDatabasePath,
    migrationsDirectory,
    PrismaClient,
    throughMigration: baselineThroughMigration
  });
  runPrismaMigrateDeploy({
    userDatabasePath: seedDatabasePath,
    schemaPath,
    prismaCliPath
  });
  const violations = await checkForeignKeysWithPrisma({
    userDatabasePath: seedDatabasePath,
    PrismaClient
  });
  if (violations.length > 0) {
    throw new Error(`Seed database foreign-key check failed with ${violations.length} violation(s).`);
  }

  const client = new PrismaClient({
    datasources: { db: { url: `file:${seedDatabasePath.replace(/\\/g, "/")}` } }
  });
  try {
    await client.domain.findMany({
      take: 1,
      select: { roadmapDraftJson: true, mapRevision: true }
    });
    const counts = await Promise.all([
      client.domain.count(),
      client.unit.count(),
      client.learningNode.count(),
      client.knowledgePoint.count(),
      client.knowledgeGraphEdge.count()
    ]);
    if (counts.some((count) => count !== 0)) {
      throw new Error(`Seed database contains user data: ${counts.join(", ")}`);
    }
  } finally {
    await client.$disconnect();
  }
  removeSeedSidecars();
  console.log(`Created empty versioned seed database: ${seedDatabasePath}`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
