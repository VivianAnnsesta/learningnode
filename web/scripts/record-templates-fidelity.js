const fs = require("fs");
const os = require("os");
const path = require("path");
const { databaseUrl, runUserDatabaseLifecycle } = require("./database-lifecycle");
const { recordTemplatesMigration, fingerprint, snapshot, ledgerSnapshot, same, comparableRows,
  removeRecordTemplatesFromFixture, populateHistoricalKnowledge, populateHistoricalSavedViews
} = require("./personal-knowledge-migration-fixture");

const verifyRecordTemplatesUpgrade = async ({ webRoot, PrismaClient }) => {
  const tempBase = path.resolve(os.tmpdir());
  const temporaryRoot = fs.mkdtempSync(path.join(tempBase, "englishnode-record-templates-upgrade-"));
  const databasePath = path.join(temporaryRoot, "previous-records-and-views.db");
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
      await removeRecordTemplatesFromFixture(preparation);
      await populateHistoricalKnowledge(preparation, { aliases: true });
      await populateHistoricalSavedViews(preparation);
      before = await snapshot(preparation);
      beforeLedger = await ledgerSnapshot(preparation);
      if (beforeLedger.length !== 29 || beforeLedger.some(row => row.migration_name === recordTemplatesMigration)) throw new Error("Template upgrade must start at the exact 29-migration boundary.");
      if (Object.keys(before).length !== 26 || before.KnowledgeRecordTemplate) throw new Error("Previous template fixture must have exactly the old 26 tables.");
      if (before.KnowledgePointRevision.length !== 4 || before.KnowledgePointRevision.some(row => JSON.parse(row.aliasesJson).length !== 3)) throw new Error("Nonempty raw aliases and old revision snapshots are required.");
      if (before.SavedKnowledgeView.length !== 2 || before.SavedKnowledgeView.some(row => !row.configJson || row.version <= 1)) throw new Error("Nonempty saved-view configurations with existing versions are required.");
    } finally { await preparation.$disconnect(); }
    const beforeHash = fingerprint(databasePath);
    const first = await lifecycle("2026-11-09T15:00:00.000Z");
    if (!first.backupPath || !fs.existsSync(first.backupPath) || fingerprint(first.backupPath) !== beforeHash) throw new Error("Template upgrade must retain the exact pre-migration database backup.");
    const upgraded = createClient();
    let afterLedger, firstSnapshot, expectedTemplate;
    try {
      same(await snapshot(upgraded, { omitTables: ["KnowledgeRecordTemplate"] }), before, "Template migration changed old knowledge, raw aliases, sources, pointers, saved views or learning facts.");
      const [count] = await upgraded.$queryRawUnsafe('SELECT COUNT(*) AS count FROM "KnowledgeRecordTemplate"');
      if (Number(count.count) !== 0) throw new Error("Template migration must not create template or record content.");
      afterLedger = await ledgerSnapshot(upgraded);
      same(afterLedger.filter(row => row.migration_name !== recordTemplatesMigration), beforeLedger, "Template migration rewrote historical ledger rows.");
      if (afterLedger.length !== 30 || afterLedger.length !== beforeLedger.length + 1) throw new Error("Template migration must be applied exactly once.");
      if ((await upgraded.$queryRawUnsafe('PRAGMA foreign_key_list("KnowledgeRecordTemplate")')).length) throw new Error("Templates must have no record or learning foreign keys.");
      if ((await upgraded.$queryRawUnsafe("PRAGMA foreign_key_check")).length) throw new Error("Template upgrade left foreign-key violations.");
      same((await upgraded.$queryRawUnsafe("PRAGMA integrity_check")).map(row => Object.values(row)[0]), ["ok"], "Template upgrade failed integrity checking.");

      const body = "  自定义 {{title}} 😀\r\n\t日期 {{date}}\r单独换行 {{time}}\n保留正文";
      const configJson = JSON.stringify({ body, timeZone: "Asia/Shanghai" }, null, 2);
      const created = await upgraded.knowledgeRecordTemplate.create({ data: { id: "synthetic-custom-template", title: "我的自定义模板", configJson } });
      if (created.schemaVersion !== 1 || created.version !== 1 || !created.createdAt || !created.updatedAt) throw new Error("Template defaults were not persisted.");
      const updatedConfig = JSON.stringify({ body: body + "\r\n新增自己的内容。", timeZone: "America/New_York" }, null, 2);
      const saved = await upgraded.knowledgeRecordTemplate.updateMany({ where: { id: created.id, version: 1 }, data: { title: "更新后的自定义模板", configJson: updatedConfig, version: { increment: 1 } } });
      if (saved.count !== 1) throw new Error("Synthetic template update did not match its version.");
      const stored = await upgraded.knowledgeRecordTemplate.findUniqueOrThrow({ where: { id: created.id } });
      if (stored.version !== 2 || stored.configJson !== updatedConfig || JSON.parse(stored.configJson).body !== body + "\r\n新增自己的内容。" || stored.createdAt.getTime() !== created.createdAt.getTime()) throw new Error("Template body/configuration bytes, version or creation timestamp changed unexpectedly.");
      expectedTemplate = comparableRows([stored]);
      same(await snapshot(upgraded, { omitTables: ["KnowledgeRecordTemplate"] }), before, "Template configuration writes changed old knowledge, saved views or learning facts.");
      same(await ledgerSnapshot(upgraded), afterLedger, "Template writes changed migration history.");
      firstSnapshot = await snapshot(upgraded);
    } finally { await upgraded.$disconnect(); }
    const reopened = createClient();
    try {
      same(comparableRows(await reopened.knowledgeRecordTemplate.findMany()), expectedTemplate, "Disconnect/reopen lost custom template fields, raw body or version.");
      same(await snapshot(reopened), firstSnapshot, "Reopening the template changed database content.");
    } finally { await reopened.$disconnect(); }
    const repeatHash = fingerprint(databasePath);
    const second = await lifecycle("2026-11-09T15:02:00.000Z");
    if (!second.backupPath || fingerprint(second.backupPath) !== repeatHash) throw new Error("Repeated template lifecycle must preserve its exact backup.");
    const repeated = createClient();
    try {
      same(await snapshot(repeated), firstSnapshot, "Repeated lifecycle changed templates, saved views or knowledge data.");
      same(await ledgerSnapshot(repeated), afterLedger, "Repeated lifecycle duplicated or rewrote migrations.");
      same(comparableRows(await repeated.knowledgeRecordTemplate.findMany()), expectedTemplate, "Repeated lifecycle lost template configuration or its version.");
      if ((await repeated.$queryRawUnsafe("PRAGMA foreign_key_check")).length) throw new Error("Repeated template lifecycle left foreign-key violations.");
      same((await repeated.$queryRawUnsafe("PRAGMA integrity_check")).map(row => Object.values(row)[0]), ["ok"], "Repeated template lifecycle failed integrity checking.");
    } finally { await repeated.$disconnect(); }
    return { beforeMigrationCount: 29, afterMigrationCount: 30, existingRevisions: 4, existingSavedViews: 2,
      backupCreatedBeforeMigration: true, originalFieldsPreserved: true, rawAliasesPreserved: true,
      currentPointersPreserved: true, multiParagraphSourcesPreserved: true, oldSavedViewsPreserved: true,
      historicalLedgerPreserved: true, newTemplateTableInitiallyEmpty: true, customTemplateReopenedUnchanged: true,
      templateRawBodyPreserved: true, templateVersion: 2, templateWritesLeaveOldDataUnchanged: true,
      foreignKeyViolations: 0, integrity: "ok", repeatedLifecycleUnchanged: true };
  } finally {
    if (process.env.KEEP_MIGRATION_FIDELITY_FIXTURE === "1") {
      console.error("Kept isolated record-template migration fixture: " + temporaryRoot);
    } else {
      if (path.dirname(path.resolve(temporaryRoot)) !== tempBase || !path.basename(temporaryRoot).startsWith("englishnode-record-templates-upgrade-")) throw new Error("Refusing to remove an unexpected template fixture directory.");
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
  }
};

module.exports = { recordTemplatesMigration, verifyRecordTemplatesUpgrade };
