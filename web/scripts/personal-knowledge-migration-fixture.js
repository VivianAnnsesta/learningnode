const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const aliasesMigration = "20261109090000_add_revision_aliases";
const savedViewsMigration = "20261109120000_add_saved_knowledge_views";
const aliasesSchemaSha256 = "5c45ab6b06b304c85de0f6719e250a23b992be4083f14209c10f22f79d2d50c8";
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
const removeSavedViewsFromFixture = async client => {
  const tables = await client.$queryRawUnsafe("SELECT name FROM sqlite_master WHERE type='table' AND name='SavedKnowledgeView'");
  const futureLedger = await client.$queryRawUnsafe('SELECT "migration_name" FROM "_prisma_migrations" WHERE "migration_name" > ? ORDER BY "migration_name"', aliasesMigration);
  if (futureLedger.some(row => row.migration_name !== savedViewsMigration)) {
    throw new Error("Historical fixture needs an explicit projection for a newer migration boundary.");
  }
  if (tables.length !== futureLedger.length || tables.length > 1) throw new Error("Saved-view fixture table and ledger disagree.");
  if (!tables.length) return;
  const [count] = await client.$queryRawUnsafe('SELECT COUNT(*) AS count FROM "SavedKnowledgeView"');
  if (Number(count.count) !== 0) throw new Error("Only an empty saved-view seed table may be projected away.");
  await client.$executeRawUnsafe('DROP TABLE "SavedKnowledgeView"');
  const deleted = await client.$executeRawUnsafe('DELETE FROM "_prisma_migrations" WHERE "migration_name" = ?', savedViewsMigration);
  if (Number(deleted) !== 1) throw new Error("Saved-view migration must occur once in the isolated fixture.");
};

const createAliasesMigrationBoundary = ({ webRoot, temporaryRoot }) => {
  const archive = path.join(webRoot, "prisma", "fixtures", "revision-aliases-28.schema.prisma");
  if (fingerprint(archive) !== aliasesSchemaSha256) throw new Error("Archived aliases schema hash does not match the verified historical source.");
  const projection = path.join(temporaryRoot, "aliases-boundary");
  const migrations = path.join(projection, "migrations");
  fs.mkdirSync(migrations, { recursive: true });
  const schemaPath = path.join(projection, "schema.prisma");
  fs.copyFileSync(archive, schemaPath, fs.constants.COPYFILE_EXCL);
  const source = path.join(webRoot, "prisma", "migrations");
  const prefix = fs.readdirSync(source, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name <= aliasesMigration && fs.existsSync(path.join(source, entry.name, "migration.sql")))
    .map(entry => entry.name).sort();
  if (prefix.length !== 28 || prefix[prefix.length - 1] !== aliasesMigration) throw new Error("Aliases regression must use exactly the 28-migration historical prefix.");
  for (const name of prefix) {
    const target = path.join(migrations, name);
    fs.mkdirSync(target);
    fs.copyFileSync(path.join(source, name, "migration.sql"), path.join(target, "migration.sql"));
  }
  fs.copyFileSync(path.join(source, "migration_lock.toml"), path.join(migrations, "migration_lock.toml"));
  return schemaPath;
};

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

module.exports = { aliasesMigration, savedViewsMigration, fingerprint, snapshot, ledgerSnapshot, same, comparableRows, createAliasesMigrationBoundary, removeSavedViewsFromFixture, populateHistoricalKnowledge };
