const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const aliasesMigration = "20261109090000_add_revision_aliases";
const savedViewsMigration = "20261109120000_add_saved_knowledge_views";
const recordTemplatesMigration = "20261109150000_add_knowledge_record_templates";
const aliasesSchemaSha256 = "5c45ab6b06b304c85de0f6719e250a23b992be4083f14209c10f22f79d2d50c8";
const savedViewsSchemaSha256 = "097637e12a4cfb613b54ebf80d9d1678eaf7fe43fbef00c3451feb940122b6f9";
const fingerprint = filename => crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");
const normalized = value => value instanceof Date ? value.toISOString() : typeof value === "bigint" ? value.toString() : value;
const comparableRows = rows => rows.map(row => Object.fromEntries(
  Object.entries(row).map(([key, value]) => [key, normalized(value)])
)).sort((left, right) => {
  const a = JSON.stringify(left), b = JSON.stringify(right);
  return a < b ? -1 : a > b ? 1 : 0;
});
const same = (left, right, message) => {
  if (JSON.stringify(left) !== JSON.stringify(right)) throw new Error(message);
};
const snapshot = async (client, { omitAliases = false, omitTables = [] } = {}) => {
  const tables = await client.$queryRawUnsafe(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> '_prisma_migrations' ORDER BY name"
  );
  const result = {};
  for (const { name } of tables) {
    if (omitTables.includes(name)) continue;
    const rows = await client.$queryRawUnsafe('SELECT * FROM "' + name.replace(/"/g, '""') + '"');
    result[name] = comparableRows(rows.map(row => {
      if (!omitAliases || name !== "KnowledgePointRevision") return row;
      const { aliasesJson: _aliases, ...oldFields } = row;
      return oldFields;
    }));
  }
  return result;
};
const ledgerSnapshot = async client => comparableRows(await client.$queryRawUnsafe(
  'SELECT * FROM "_prisma_migrations" ORDER BY "migration_name"'
));

// These operations run only against a new temporary copy of the empty seed.
const removeEmptyConfigurationFromFixture = async (client, { table, migration, after }) => {
  if (!["SavedKnowledgeView", "KnowledgeRecordTemplate"].includes(table)) throw new Error("Unknown configuration fixture table.");
  const tables = await client.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type='table' AND name=?", table);
  const futureLedger = await client.$queryRawUnsafe('SELECT "migration_name" FROM "_prisma_migrations" WHERE "migration_name" > ? ORDER BY "migration_name"', after);
  if (futureLedger.some(row => row.migration_name !== migration)) {
    throw new Error("Historical fixture needs an explicit projection for a newer migration boundary.");
  }
  if (tables.length !== futureLedger.length || tables.length > 1) throw new Error("Configuration fixture table and ledger disagree.");
  if (!tables.length) return;
  const [count] = await client.$queryRawUnsafe('SELECT COUNT(*) AS count FROM "' + table + '"');
  if (Number(count.count) !== 0) throw new Error("Only an empty configuration seed table may be projected away.");
  await client.$executeRawUnsafe('DROP TABLE "' + table + '"');
  const deleted = await client.$executeRawUnsafe('DELETE FROM "_prisma_migrations" WHERE "migration_name" = ?', migration);
  if (Number(deleted) !== 1) throw new Error("Configuration migration must occur once in the isolated fixture.");
};
const removeRecordTemplatesFromFixture = client => removeEmptyConfigurationFromFixture(client, {
  table: "KnowledgeRecordTemplate", migration: recordTemplatesMigration, after: savedViewsMigration
});
const removeSavedViewsFromFixture = async client => {
  await removeRecordTemplatesFromFixture(client);
  await removeEmptyConfigurationFromFixture(client, { table: "SavedKnowledgeView", migration: savedViewsMigration, after: aliasesMigration });
};

const createHistoricalMigrationBoundary = ({ webRoot, temporaryRoot, archiveName, archiveSha256, throughMigration, migrationCount, label }) => {
  const archive = path.join(webRoot, "prisma", "fixtures", archiveName);
  if (fingerprint(archive) !== archiveSha256) throw new Error("Archived schema hash does not match the verified historical source.");
  const projection = path.join(temporaryRoot, label);
  const migrations = path.join(projection, "migrations");
  fs.mkdirSync(migrations, { recursive: true });
  const schemaPath = path.join(projection, "schema.prisma");
  fs.copyFileSync(archive, schemaPath, fs.constants.COPYFILE_EXCL);
  const source = path.join(webRoot, "prisma", "migrations");
  const prefix = fs.readdirSync(source, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name <= throughMigration && fs.existsSync(path.join(source, entry.name, "migration.sql")))
    .map(entry => entry.name).sort();
  if (prefix.length !== migrationCount || prefix[prefix.length - 1] !== throughMigration) throw new Error("Historical regression must use its exact archived migration prefix.");
  for (const name of prefix) {
    const target = path.join(migrations, name);
    fs.mkdirSync(target);
    fs.copyFileSync(path.join(source, name, "migration.sql"), path.join(target, "migration.sql"));
  }
  fs.copyFileSync(path.join(source, "migration_lock.toml"), path.join(migrations, "migration_lock.toml"));
  return schemaPath;
};
const createAliasesMigrationBoundary = options => createHistoricalMigrationBoundary({ ...options,
  archiveName: "revision-aliases-28.schema.prisma", archiveSha256: aliasesSchemaSha256,
  throughMigration: aliasesMigration, migrationCount: 28, label: "aliases-boundary"
});
const createSavedViewsMigrationBoundary = options => createHistoricalMigrationBoundary({ ...options,
  archiveName: "saved-knowledge-views-29.schema.prisma", archiveSha256: savedViewsSchemaSha256,
  throughMigration: savedViewsMigration, migrationCount: 29, label: "saved-views-boundary"
});

const populateHistoricalKnowledge = async (client, { aliases = false } = {}) => {
  const now = "2026-11-09T09:00:00.000Z";
  await client.$executeRawUnsafe('INSERT INTO "Domain" ("id","name","updatedAt") VALUES (?,?,?)', "aliases-domain", "Synthetic migration upgrade", now);
  for (const [id, title] of [["aliases-source", "Old source"], ["aliases-reader", "Old reader"]]) {
    await client.$executeRawUnsafe('INSERT INTO "KnowledgePoint" ("id","domainId","title","updatedAt") VALUES (?,?,?,?)', id, "aliases-domain", title, now);
  }
  const body = "第一段 😀\r\n段内换行\r\n\r\n第二段\0保留\r\n\r\n重复段\r\n\r\n重复段";
  const whole = { kind: "record", knowledgePointId: "aliases-source", revisionId: "aliases-source-v1", title: "Old source v1", body, sourceType: "user" };
  const paragraph = quote => {
    const start = body.indexOf(quote);
    return { ...whole, selector: { type: "paragraph-v1", start, end: start + quote.length, quoteHash: crypto.createHash("sha256").update(quote, "utf8").digest("hex"), quote } };
  };
  const sources = JSON.stringify([whole, paragraph("第一段 😀\r\n段内换行"), paragraph("第二段\0保留")]);
  const revisions = [
    ["aliases-source-v1", "aliases-source", 1, "Old source v1", body, "user", "[]", now],
    ["aliases-source-v2", "aliases-source", 2, "Old source v2", "后来修改的来源", "user", "[]", "2026-11-09T09:01:00.000Z"],
    ["aliases-reader-v1", "aliases-reader", 1, "Old reader v1", "旧个人理解", "excerpt", JSON.stringify([whole]), now],
    ["aliases-reader-v2", "aliases-reader", 2, "Old reader v2", "多段引用保持固定", "excerpt", sources, "2026-11-09T09:02:00.000Z"]
  ];
  for (const [index, revision] of revisions.entries()) {
    const aliasColumn = aliases ? ',"aliasesJson"' : "";
    const placeholder = aliases ? ",?" : "";
    const values = aliases ? [...revision, `[ "旧别名-${index}", "ＡＩ", "中文😀" ]`] : revision;
    await client.$executeRawUnsafe('INSERT INTO "KnowledgePointRevision" ("id","knowledgePointId","sequence","title","body","sourceType","sourcesJson","createdAt"' + aliasColumn + ') VALUES (?,?,?,?,?,?,?,?' + placeholder + ')', ...values);
  }
  for (const id of ["aliases-source", "aliases-reader"]) {
    await client.$executeRawUnsafe('UPDATE "KnowledgePoint" SET "currentRevisionId"=? WHERE "id"=?', id + "-v2", id);
  }
  await client.$executeRawUnsafe('INSERT INTO "LearningNode" ("id","domainId","title","orderIndex","updatedAt") VALUES (?,?,?,?,?)', "aliases-node", "aliases-domain", "Old task", 0, now);
  await client.$executeRawUnsafe('INSERT INTO "LearningNodeKnowledgePoint" ("nodeId","knowledgePointId","createdAt") VALUES (?,?,?)', "aliases-node", "aliases-reader", now);
  await client.$executeRawUnsafe('INSERT INTO "KnowledgeGraphNode" ("id","domainId","title","nodeType","updatedAt") VALUES (?,?,?,?,?)', "aliases-collection", "aliases-domain", "Old theme", "topic", now);
  await client.$executeRawUnsafe('INSERT INTO "KnowledgeGraphMembership" ("groupNodeId","knowledgePointId","createdAt") VALUES (?,?,?)', "aliases-collection", "aliases-reader", now);
  await client.$executeRawUnsafe('INSERT INTO "KnowledgeGraphEdge" ("id","fromKnowledgePointId","toKnowledgePointId","relationType","status","detail","createdAt") VALUES (?,?,?,?,?,?,?)', "aliases-edge", "aliases-reader", "aliases-source", "related", "confirmed", "Old confirmed relation", now);
};

const populateHistoricalSavedViews = async client => {
  const config = { filters: { q: "条件概率 😀", domainId: "aliases-domain", collectionId: "aliases-collection", kind: "excerpt", sourceType: "excerpt", sort: "updated_desc", date: { mode: "all", field: "updated", timeZone: "Asia/Shanghai" } }, displayFields: ["summary", "aliases", "createdAt"] };
  const second = { filters: { q: "", domainId: "", collectionId: "", kind: "note", sourceType: "user", sort: "title_asc", date: { mode: "all", field: "created", timeZone: "UTC" } }, displayFields: [] };
  const rows = [
    ["historical-view-a", "原检索配置 😀", 1, JSON.stringify(config, null, 2), 4, "2026-11-09T11:00:00.000Z", "2026-11-09T11:04:00.000Z"],
    ["historical-view-b", "仅标题视图", 1, JSON.stringify(second, null, 4), 2, "2026-11-09T11:01:00.000Z", "2026-11-09T11:03:00.000Z"]
  ];
  for (const row of rows) {
    await client.$executeRawUnsafe('INSERT INTO "SavedKnowledgeView" ("id","title","schemaVersion","configJson","version","createdAt","updatedAt") VALUES (?,?,?,?,?,?,?)', ...row);
  }
};

module.exports = { aliasesMigration, savedViewsMigration, recordTemplatesMigration, fingerprint, snapshot, ledgerSnapshot, same, comparableRows, createAliasesMigrationBoundary, createSavedViewsMigrationBoundary, removeRecordTemplatesFromFixture, removeSavedViewsFromFixture, populateHistoricalKnowledge, populateHistoricalSavedViews };
