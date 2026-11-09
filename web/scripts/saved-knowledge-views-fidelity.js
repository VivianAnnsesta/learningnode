const fs = require("fs");
const os = require("os");
const path = require("path");
const { databaseUrl, runUserDatabaseLifecycle } = require("./database-lifecycle");
const { savedViewsMigration, fingerprint, snapshot, ledgerSnapshot, same, comparableRows,
  removeSavedViewsFromFixture, populateHistoricalKnowledge, createSavedViewsMigrationBoundary
} = require("./personal-knowledge-migration-fixture");

const verifySavedKnowledgeViewsUpgrade = async ({ webRoot, PrismaClient }) => {
  const tempBase = path.resolve(os.tmpdir());
  const temporaryRoot = fs.mkdtempSync(path.join(tempBase, "englishnode-saved-views-upgrade-"));
  const databasePath = path.join(temporaryRoot, "previous-revisions.db");
  const seedDatabasePath = path.join(webRoot, "prisma", "seed.db");
  fs.copyFileSync(seedDatabasePath, databasePath, fs.constants.COPYFILE_EXCL);
  const createClient = () => new PrismaClient({ datasources: { db: { url: databaseUrl(databasePath) } } });
  const schemaPath = createSavedViewsMigrationBoundary({ webRoot, temporaryRoot });
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
      await removeSavedViewsFromFixture(preparation);
      await populateHistoricalKnowledge(preparation, { aliases: true });
      before = await snapshot(preparation);
      beforeLedger = await ledgerSnapshot(preparation);
      if (beforeLedger.length !== 28 || beforeLedger.some(row => row.migration_name === savedViewsMigration)) throw new Error("Saved-view upgrade must start with exactly the historical 28-migration ledger.");
      if (Object.keys(before).length !== 25 || before.SavedKnowledgeView) throw new Error("Previous-schema fixture must have 25 business tables without saved views.");
      if (before.KnowledgePointRevision.length !== 4 || before.KnowledgePointRevision.some(row => JSON.parse(row.aliasesJson).length !== 3)) throw new Error("Nonempty raw aliases on all old revisions are required.");
    } finally { await preparation.$disconnect(); }
    const beforeHash = fingerprint(databasePath);
    const first = await lifecycle("2026-11-09T12:00:00.000Z");
    if (!first.backupPath || !fs.existsSync(first.backupPath) || fingerprint(first.backupPath) !== beforeHash) throw new Error("Saved-view upgrade must preserve the exact database backup before migration.");
    const upgraded = createClient();
    let afterLedger, firstSnapshot, expectedView;
    try {
      same(await snapshot(upgraded, { omitTables: ["SavedKnowledgeView"] }), before, "Saved-view migration changed old knowledge, aliases, snapshots, pointers or learning data.");
      const [count] = await upgraded.$queryRawUnsafe('SELECT COUNT(*) AS count FROM "SavedKnowledgeView"');
      if (Number(count.count) !== 0) throw new Error("A configuration migration must not materialize any saved views.");
      afterLedger = await ledgerSnapshot(upgraded);
      same(afterLedger.filter(row => row.migration_name !== savedViewsMigration), beforeLedger, "Saved-view migration rewrote the historical ledger.");
      if (afterLedger.length !== 29 || afterLedger.length !== beforeLedger.length + 1) throw new Error("Saved-view migration must be applied exactly once.");
      if ((await upgraded.$queryRawUnsafe('PRAGMA foreign_key_list("SavedKnowledgeView")')).length) throw new Error("View configurations must have no content or learning foreign keys.");
      if ((await upgraded.$queryRawUnsafe("PRAGMA foreign_key_check")).length) throw new Error("Saved-view upgrade left foreign-key violations.");
      same((await upgraded.$queryRawUnsafe("PRAGMA integrity_check")).map(row => Object.values(row)[0]), ["ok"], "Saved-view upgrade failed integrity checking.");

      const config = JSON.stringify({ filters: { q: "条件概率 😀", domainId: "aliases-domain", collectionId: "aliases-collection", kind: "excerpt", sourceType: "excerpt", sort: "updated_desc", date: { mode: "all", field: "updated", timeZone: "Asia/Shanghai" } }, displayFields: ["summary", "aliases", "createdAt"] }, null, 2);
      const created = await upgraded.savedKnowledgeView.create({ data: { id: "synthetic-saved-view", title: "合成检索配置", configJson: config } });
      if (created.schemaVersion !== 1 || created.version !== 1 || !created.createdAt || !created.updatedAt) throw new Error("Saved-view defaults were not persisted.");
      const saved = await upgraded.savedKnowledgeView.updateMany({ where: { id: created.id, version: 1 }, data: { title: "更新后的检索配置", configJson: config, version: { increment: 1 } } });
      if (saved.count !== 1) throw new Error("Synthetic configuration update did not match its version.");
      const stored = await upgraded.savedKnowledgeView.findUniqueOrThrow({ where: { id: created.id } });
      if (stored.version !== 2 || stored.configJson !== config || stored.createdAt.getTime() !== created.createdAt.getTime()) throw new Error("Configuration bytes, version or creation timestamp changed unexpectedly.");
      expectedView = comparableRows([stored]);
      same(await snapshot(upgraded, { omitTables: ["SavedKnowledgeView"] }), before, "Saving configuration created or modified knowledge/learning facts.");
      same(await ledgerSnapshot(upgraded), afterLedger, "Saving configuration changed migration history.");
      firstSnapshot = await snapshot(upgraded);
    } finally { await upgraded.$disconnect(); }

    const reopened = createClient();
    try {
      same(comparableRows(await reopened.savedKnowledgeView.findMany()), expectedView, "Disconnect/reopen failed to retain all seven saved-view fields.");
      same(await snapshot(reopened), firstSnapshot, "Reopening a configuration changed database content.");
    } finally { await reopened.$disconnect(); }
    const beforeRepeatHash = fingerprint(databasePath);
    const second = await lifecycle("2026-11-09T12:02:00.000Z");
    if (!second.backupPath || fingerprint(second.backupPath) !== beforeRepeatHash) throw new Error("Repeated view lifecycle must retain an exact backup.");
    const repeated = createClient();
    try {
      same(await snapshot(repeated), firstSnapshot, "Repeated lifecycle changed configuration or knowledge data.");
      same(await ledgerSnapshot(repeated), afterLedger, "Repeated lifecycle duplicated or rewrote migrations.");
      same(comparableRows(await repeated.savedKnowledgeView.findMany()), expectedView, "Repeated lifecycle lost configuration fields or its saved version.");
      if ((await repeated.$queryRawUnsafe("PRAGMA foreign_key_check")).length) throw new Error("Repeated lifecycle left foreign-key violations.");
      same((await repeated.$queryRawUnsafe("PRAGMA integrity_check")).map(row => Object.values(row)[0]), ["ok"], "Repeated lifecycle failed integrity checking.");
    } finally { await repeated.$disconnect(); }
    return { beforeMigrationCount: 28, afterMigrationCount: 29, existingRevisions: 4,
      backupCreatedBeforeMigration: true, originalFieldsPreserved: true, rawAliasesPreserved: true,
      currentPointersPreserved: true, multiParagraphSourcesPreserved: true, historicalLedgerPreserved: true,
      newConfigurationTableInitiallyEmpty: true, configurationReopenedUnchanged: true,
      configurationVersion: 2, configurationWritesLeaveKnowledgeUnchanged: true,
      foreignKeyViolations: 0, integrity: "ok", repeatedLifecycleUnchanged: true };
  } finally {
    if (process.env.KEEP_MIGRATION_FIDELITY_FIXTURE === "1") {
      console.error("Kept isolated saved-view migration fixture: " + temporaryRoot);
    } else {
      if (path.dirname(path.resolve(temporaryRoot)) !== tempBase || !path.basename(temporaryRoot).startsWith("englishnode-saved-views-upgrade-")) throw new Error("Refusing to remove an unexpected saved-view fixture directory.");
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
  }
};

module.exports = { savedViewsMigration, verifySavedKnowledgeViewsUpgrade };
