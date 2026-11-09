const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const {
  markHistoricalMigrationsApplied,
  runPrismaDbExecute,
  runPrismaMigrateDeploy
} = require("./database-lifecycle");
const { PrismaClient } = require("@prisma/client");
const { validateEmptySeedDatabase } = require("./seed-validation");

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
  const validation = await validateEmptySeedDatabase({ databasePath: seedDatabasePath, migrationsDirectory, PrismaClient });
  const reportPath = path.join(webRoot, "test-results", "empty-seed-validation.json");
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify({
    generator: "scripts/create-seed-database.js",
    sourceCommit: process.env.GITHUB_SHA || null,
    seedSha256: crypto.createHash("sha256").update(fs.readFileSync(seedDatabasePath)).digest("hex"),
    seedBytes: fs.statSync(seedDatabasePath).size,
    ...validation
  }, null, 2), "utf8");
  console.log(JSON.stringify({ emptySeedValidation: validation }));
  removeSeedSidecars();
  console.log(`Created empty versioned seed database: ${seedDatabasePath}`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
