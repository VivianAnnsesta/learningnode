const fs = require("fs");
const os = require("os");
const path = require("path");
const { databaseUrl, runUserDatabaseLifecycle } = require("./database-lifecycle");

const { aliasesMigration, fingerprint, snapshot: fullSnapshot, ledgerSnapshot, same,
  createAliasesMigrationBoundary, removeSavedViewsFromFixture, populateHistoricalKnowledge
} = require("./personal-knowledge-migration-fixture");
const snapshot = client => fullSnapshot(client, { omitAliases: true });
const preparePreviousSchemaFixture = async client => {
  await removeSavedViewsFromFixture(client);
  const columns = await client.$queryRawUnsafe('PRAGMA table_info("KnowledgePointRevision")');
  if (!columns.some(column => column.name === "aliasesJson")) throw new Error("Current seed is missing aliasesJson.");
  await client.$executeRawUnsafe('ALTER TABLE "KnowledgePointRevision" DROP COLUMN "aliasesJson"');
  const deleted = await client.$executeRawUnsafe('DELETE FROM "_prisma_migrations" WHERE "migration_name" = ?', aliasesMigration);
  if (Number(deleted) !== 1) throw new Error("Aliases migration must occur exactly once in the current seed.");
  await populateHistoricalKnowledge(client);
};

const verifyRevisionAliasesUpgrade = async ({ webRoot, PrismaClient }) => {
  const tempBase = path.resolve(os.tmpdir());
  const temporaryRoot = fs.mkdtempSync(path.join(tempBase, "englishnode-aliases-upgrade-"));
  const databasePath = path.join(temporaryRoot, "previous-revisions.db");
  const seedDatabasePath = path.join(webRoot, "prisma", "seed.db");
  fs.copyFileSync(seedDatabasePath, databasePath, fs.constants.COPYFILE_EXCL);
  const createClient = () => new PrismaClient({ datasources: { db: { url: databaseUrl(databasePath) } } });
  const schemaPath = createAliasesMigrationBoundary({ webRoot, temporaryRoot });
  const lifecycle = now => runUserDatabaseLifecycle({
    userDatabasePath: databasePath, seedDatabasePath,
    schemaPath,
    prismaCliPath: path.join(webRoot, "node_modules", "prisma", "build", "index.js"),
    PrismaClient, now: () => new Date(now)
  });
  try {
    const preparation = createClient();
    let before, beforeLedger;
    try {
      await preparePreviousSchemaFixture(preparation);
      before = await snapshot(preparation);
      beforeLedger = await ledgerSnapshot(preparation);
      if (beforeLedger.length !== 27) throw new Error("Aliases regression must start at the 27-migration boundary.");
      if (before.KnowledgePointRevision.length !== 4) throw new Error("Populated historical revisions are required.");
    } finally { await preparation.$disconnect(); }
    const beforeHash = fingerprint(databasePath);
    const first = await lifecycle("2026-11-09T10:00:00.000Z");
    if (!first.backupPath || !fs.existsSync(first.backupPath) || fingerprint(first.backupPath) !== beforeHash) {
      throw new Error("Aliases upgrade did not preserve the exact pre-migration database backup.");
    }
    const upgraded = createClient();
    let afterLedger, firstSnapshot;
    try {
      same(await snapshot(upgraded), before, "Aliases migration changed existing revision fields, pointers or related data.");
      const rows = await upgraded.$queryRawUnsafe('SELECT "id","aliasesJson" FROM "KnowledgePointRevision" ORDER BY "id"');
      if (rows.length !== 4 || rows.some(row => row.aliasesJson !== "[]" || JSON.parse(row.aliasesJson).length !== 0)) {
        throw new Error("Every existing revision must receive empty aliases.");
      }
      afterLedger = await ledgerSnapshot(upgraded);
      same(afterLedger.filter(row => row.migration_name !== aliasesMigration), beforeLedger,
        "Aliases migration rewrote the historical migration ledger.");
      if (afterLedger.length !== 28 || afterLedger.length !== beforeLedger.length + 1) throw new Error("Aliases migration was not applied exactly once.");
      const violations = await upgraded.$queryRawUnsafe("PRAGMA foreign_key_check");
      if (violations.length) throw new Error("Aliases upgrade left foreign-key violations.");
      await upgraded.$executeRawUnsafe(
        'INSERT INTO "KnowledgePointRevision" ("id","knowledgePointId","sequence","title","body","sourceType","createdAt") VALUES (?,?,?,?,?,?,?)',
        "aliases-default-v3", "aliases-reader", 3, "New omitted aliases", "New local record", "user", "2026-11-09T10:01:00.000Z"
      );
      const [omitted] = await upgraded.$queryRawUnsafe(
        'SELECT "aliasesJson" FROM "KnowledgePointRevision" WHERE "id"=?', "aliases-default-v3"
      );
      if (omitted.aliasesJson !== "[]") throw new Error("An omitted aliases field must use the database default [].");
      firstSnapshot = await snapshot(upgraded);
    } finally { await upgraded.$disconnect(); }
    const second = await lifecycle("2026-11-09T10:02:00.000Z");
    if (!second.backupPath || !fs.existsSync(second.backupPath)) throw new Error("Repeated lifecycle must retain its backup.");
    const repeated = createClient();
    try {
      same(await snapshot(repeated), firstSnapshot, "Repeated lifecycle changed personal records.");
      same(await ledgerSnapshot(repeated), afterLedger, "Repeated lifecycle duplicated or rewrote migrations.");
    } finally { await repeated.$disconnect(); }
    return { beforeMigrationCount: beforeLedger.length, afterMigrationCount: afterLedger.length,
      existingRevisions: 4, backupCreatedBeforeMigration: true, originalFieldsPreserved: true,
      currentPointersPreserved: true, multiParagraphSourcesPreserved: true, aliasesDefault: "[]",
      foreignKeyViolations: 0, repeatedLifecycleUnchanged: true };
  } finally {
    if (process.env.KEEP_MIGRATION_FIDELITY_FIXTURE === "1") {
      console.error("Kept isolated alias migration fixture: " + temporaryRoot);
    } else {
      if (path.dirname(path.resolve(temporaryRoot)) !== tempBase ||
          !path.basename(temporaryRoot).startsWith("englishnode-aliases-upgrade-")) {
        throw new Error("Refusing to remove an unexpected aliases fixture directory.");
      }
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
  }
};

module.exports = { aliasesMigration, verifyRevisionAliasesUpgrade };
