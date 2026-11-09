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
    const recordDateColumns = ["recordDate", "recordDateTimeZone"];
    if (recordDateColumns.some(name => {
      const column = aliasesColumns.find(item => item.name === name);
      return !column || String(column.type).toUpperCase() !== "TEXT" || Number(column.notnull) !== 0 || Number(column.pk) !== 0 || column.dflt_value !== null;
    })) throw new Error("Versioned seed must contain both nullable record-date TEXT columns without a default.");
    const immutable = await client.$queryRawUnsafe("SELECT sql FROM sqlite_master WHERE type='trigger' AND name='KnowledgePointRevision_immutable'");
    if (immutable.length !== 1 || !immutable[0].sql.includes("BEFORE UPDATE ON") || !immutable[0].sql.includes("Knowledge revisions are immutable")) throw new Error("The revision immutability trigger must remain enabled for date fields.");
    const expectedConfigurationColumns = { id: "TEXT", title: "TEXT", schemaVersion: "INTEGER", configJson: "TEXT", version: "INTEGER", createdAt: "DATETIME", updatedAt: "DATETIME" };
    for (const table of ["SavedKnowledgeView", "KnowledgeRecordTemplate"]) {
      const columns = await client.$queryRawUnsafe('PRAGMA table_info("' + table + '")');
      if (columns.length !== Object.keys(expectedConfigurationColumns).length || columns.some(column => expectedConfigurationColumns[column.name] !== String(column.type).toUpperCase() || Number(column.notnull) !== 1)) {
        throw new Error(`Versioned seed must contain all seven required configuration fields in ${table}.`);
      }
      const column = name => columns.find(item => item.name === name);
      if (Number(column("id").pk) !== 1 || String(column("schemaVersion").dflt_value) !== "1" || String(column("version").dflt_value) !== "1" || String(column("createdAt").dflt_value).toUpperCase() !== "CURRENT_TIMESTAMP" || column("updatedAt").dflt_value !== null) {
        throw new Error(`Versioned seed has invalid identity, version or timestamp defaults in ${table}.`);
      }
      if (businessCounts[table] !== 0 || (await client.$queryRawUnsafe('PRAGMA foreign_key_list("' + table + '")')).length) {
        throw new Error(`${table} must start empty without content or learning foreign keys.`);
      }
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
    return { businessCounts, migrationCount: ledger.length, checksumsMatch: true, aliasesDefault: "[]", recordDateColumns, recordDateColumnsNullable: true, recordDateDefaultsNull: true, revisionImmutabilityTriggerPresent: true, savedViewSchemaVersionDefault: 1, savedViewVersionDefault: 1, savedViewColumns: Object.keys(expectedConfigurationColumns), recordTemplateSchemaVersionDefault: 1, recordTemplateVersionDefault: 1, recordTemplateColumns: Object.keys(expectedConfigurationColumns), foreignKeyViolations: 0, integrity: "ok" };
  } finally {
    await client.$disconnect();
  }
};

module.exports = { validateEmptySeedDatabase };
