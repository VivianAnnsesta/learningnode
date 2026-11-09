const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { databaseUrl, runUserDatabaseLifecycle } = require("./database-lifecycle");

const aliasesMigration = "20261109090000_add_revision_aliases";
const normalized = value => {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  return value;
};
const comparableRows = rows => rows.map(row => Object.fromEntries(
  Object.entries(row).map(([key, value]) => [key, normalized(value)])
)).sort((left, right) => {
  const a = JSON.stringify(left), b = JSON.stringify(right);
  return a < b ? -1 : a > b ? 1 : 0;
});
const fingerprint = filename => crypto.createHash("sha256").update(fs.readFileSync(filename)).digest("hex");

const snapshot = async client => {
  const tables = await client.$queryRawUnsafe(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> '_prisma_migrations' ORDER BY name"
  );
  const result = {};
  for (const { name } of tables) {
    const rows = await client.$queryRawUnsafe('SELECT * FROM "' + name.replace(/"/g, '""') + '"');
    result[name] = comparableRows(rows.map(row => {
      if (name !== "KnowledgePointRevision") return row;
      const { aliasesJson: _aliases, ...oldFields } = row;
      return oldFields;
    }));
  }
  return result;
};
const ledgerSnapshot = async client => comparableRows(await client.$queryRawUnsafe(
  'SELECT * FROM "_prisma_migrations" ORDER BY "migration_name"'
));
const same = (left, right, message) => {
  if (JSON.stringify(left) !== JSON.stringify(right)) throw new Error(message);
};

const preparePreviousSchemaFixture = async client => {
  const columns = await client.$queryRawUnsafe('PRAGMA table_info("KnowledgePointRevision")');
  if (!columns.some(column => column.name === "aliasesJson")) throw new Error("Current seed is missing aliasesJson.");
  await client.$executeRawUnsafe('ALTER TABLE "KnowledgePointRevision" DROP COLUMN "aliasesJson"');
  const deleted = await client.$executeRawUnsafe(
    'DELETE FROM "_prisma_migrations" WHERE "migration_name" = ?', aliasesMigration
  );
  if (Number(deleted) !== 1) throw new Error("Aliases migration must occur exactly once in the current seed.");
  const now = "2026-11-09T09:00:00.000Z";
  await client.$executeRawUnsafe(
    'INSERT INTO "Domain" ("id","name","updatedAt") VALUES (?,?,?)',
    "aliases-domain", "Synthetic alias upgrade", now
  );
  for (const [id, title] of [["aliases-source", "Old source"], ["aliases-reader", "Old reader"]]) {
    await client.$executeRawUnsafe(
      'INSERT INTO "KnowledgePoint" ("id","domainId","title","updatedAt") VALUES (?,?,?,?)',
      id, "aliases-domain", title, now
    );
  }
  const body = "第一段 😀\r\n段内换行\r\n\r\n第二段\0保留\r\n\r\n重复段\r\n\r\n重复段";
  const whole = { kind: "record", knowledgePointId: "aliases-source", revisionId: "aliases-source-v1",
    title: "Old source v1", body, sourceType: "user" };
  const paragraph = quote => {
    const start = body.indexOf(quote);
    return { ...whole, selector: { type: "paragraph-v1", start, end: start + quote.length,
      quoteHash: crypto.createHash("sha256").update(quote, "utf8").digest("hex"), quote } };
  };
  const sources = JSON.stringify([whole, paragraph("第一段 😀\r\n段内换行"), paragraph("第二段\0保留")]);
  const revisions = [
    ["aliases-source-v1", "aliases-source", 1, "Old source v1", body, "user", "[]", now],
    ["aliases-source-v2", "aliases-source", 2, "Old source v2", "后来修改的来源", "user", "[]", "2026-11-09T09:01:00.000Z"],
    ["aliases-reader-v1", "aliases-reader", 1, "Old reader v1", "旧个人理解", "excerpt", JSON.stringify([whole]), now],
    ["aliases-reader-v2", "aliases-reader", 2, "Old reader v2", "多段引用保持固定", "excerpt", sources, "2026-11-09T09:02:00.000Z"]
  ];
  for (const revision of revisions) {
    await client.$executeRawUnsafe(
      'INSERT INTO "KnowledgePointRevision" ("id","knowledgePointId","sequence","title","body","sourceType","sourcesJson","createdAt") VALUES (?,?,?,?,?,?,?,?)',
      ...revision
    );
  }
  for (const id of ["aliases-source", "aliases-reader"]) {
    await client.$executeRawUnsafe('UPDATE "KnowledgePoint" SET "currentRevisionId"=? WHERE "id"=?', id + "-v2", id);
  }
  await client.$executeRawUnsafe(
    'INSERT INTO "LearningNode" ("id","domainId","title","orderIndex","updatedAt") VALUES (?,?,?,?,?)',
    "aliases-node", "aliases-domain", "Old task", 0, now
  );
  await client.$executeRawUnsafe(
    'INSERT INTO "LearningNodeKnowledgePoint" ("nodeId","knowledgePointId","createdAt") VALUES (?,?,?)',
    "aliases-node", "aliases-reader", now
  );
  await client.$executeRawUnsafe(
    'INSERT INTO "KnowledgeGraphNode" ("id","domainId","title","nodeType","updatedAt") VALUES (?,?,?,?,?)',
    "aliases-collection", "aliases-domain", "Old theme", "topic", now
  );
  await client.$executeRawUnsafe(
    'INSERT INTO "KnowledgeGraphMembership" ("groupNodeId","knowledgePointId","createdAt") VALUES (?,?,?)',
    "aliases-collection", "aliases-reader", now
  );
  await client.$executeRawUnsafe(
    'INSERT INTO "KnowledgeGraphEdge" ("id","fromKnowledgePointId","toKnowledgePointId","relationType","status","detail","createdAt") VALUES (?,?,?,?,?,?,?)',
    "aliases-edge", "aliases-reader", "aliases-source", "related", "confirmed", "Old confirmed relation", now
  );
};

const verifyRevisionAliasesUpgrade = async ({ webRoot, PrismaClient }) => {
  const tempBase = path.resolve(os.tmpdir());
  const temporaryRoot = fs.mkdtempSync(path.join(tempBase, "englishnode-aliases-upgrade-"));
  const databasePath = path.join(temporaryRoot, "previous-revisions.db");
  const seedDatabasePath = path.join(webRoot, "prisma", "seed.db");
  fs.copyFileSync(seedDatabasePath, databasePath, fs.constants.COPYFILE_EXCL);
  const createClient = () => new PrismaClient({ datasources: { db: { url: databaseUrl(databasePath) } } });
  const lifecycle = now => runUserDatabaseLifecycle({
    userDatabasePath: databasePath, seedDatabasePath,
    schemaPath: path.join(webRoot, "prisma", "schema.prisma"),
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
      if (afterLedger.length !== beforeLedger.length + 1) throw new Error("Aliases migration was not applied exactly once.");
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
