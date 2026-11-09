const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const validateEmptySeedDatabase = async ({ databasePath, migrationsDirectory, PrismaClient }) => {
  const client = new PrismaClient({
    datasources: { db: { url: `file:${databasePath.replace(/\\/g, "/")}` } }
  });
  try {
    await client.$queryRawUnsafe('SELECT "roadmapDraftJson", "mapRevision" FROM "Domain" LIMIT 1');
    const tables = await client.$queryRawUnsafe(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> '_prisma_migrations' ORDER BY name"
    );
    const businessCounts = {};
    for (const { name } of tables) {
      const [row] = await client.$queryRawUnsafe(`SELECT COUNT(*) AS count FROM "${name.replace(/"/g, '""')}"`);
      businessCounts[name] = Number(row.count);
    }
    if (Object.values(businessCounts).some(count => count !== 0)) {
      throw new Error("Versioned seed contains business records.");
    }
    const aliasesColumns = await client.$queryRawUnsafe('PRAGMA table_info("KnowledgePointRevision")');
    const aliases = aliasesColumns.find(column => column.name === "aliasesJson");
    if (!aliases || Number(aliases.notnull) !== 1 || String(aliases.dflt_value).trim() !== "'[]'") {
      throw new Error("Versioned seed must contain a non-null aliasesJson column defaulting to [].");
    }
    const expectedMigrations = fs.readdirSync(migrationsDirectory, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
      .map(entry => ({ name: entry.name, sqlPath: path.join(migrationsDirectory, entry.name, "migration.sql") }))
      .filter(entry => fs.existsSync(entry.sqlPath))
      .sort((left, right) => left.name.localeCompare(right.name));
    const ledger = await client.$queryRawUnsafe(
      'SELECT "migration_name", "checksum", "finished_at", "rolled_back_at" FROM "_prisma_migrations" ORDER BY "migration_name"'
    );
    if (ledger.length !== expectedMigrations.length) throw new Error("Seed migration ledger does not match the migration files.");
    for (let index = 0; index < expectedMigrations.length; index += 1) {
      const migration = expectedMigrations[index];
      const applied = ledger[index];
      const checksum = crypto.createHash("sha256").update(fs.readFileSync(migration.sqlPath)).digest("hex");
      if (applied.migration_name !== migration.name || applied.checksum !== checksum || !applied.finished_at || applied.rolled_back_at) {
        throw new Error(`Seed migration ledger is invalid for ${migration.name}.`);
      }
    }
    const violations = await client.$queryRawUnsafe("PRAGMA foreign_key_check");
    if (violations.length > 0) throw new Error(`Seed database foreign-key check failed with ${violations.length} violation(s).`);
    const integrity = await client.$queryRawUnsafe("PRAGMA integrity_check");
    if (integrity.length !== 1 || Object.values(integrity[0])[0] !== "ok") throw new Error("Seed integrity check failed.");
    return { businessCounts, migrationCount: ledger.length, checksumsMatch: true, aliasesDefault: "[]", foreignKeyViolations: 0, integrity: "ok" };
  } finally {
    await client.$disconnect();
  }
};

module.exports = { validateEmptySeedDatabase };
