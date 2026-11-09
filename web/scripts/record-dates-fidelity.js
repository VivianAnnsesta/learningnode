const fs = require("fs");
const os = require("os");
const path = require("path");
const { databaseUrl, runUserDatabaseLifecycle } = require("./database-lifecycle");
const { recordDatesMigration, fingerprint, snapshot, ledgerSnapshot, same, comparableRows,
  removeRecordDatesFromFixture, populateHistoricalKnowledge, populateHistoricalSavedViews, populateHistoricalRecordTemplates
} = require("./personal-knowledge-migration-fixture");

const immutableTrigger = async client => {
  const rows = await client.$queryRawUnsafe("SELECT name,tbl_name,sql FROM sqlite_master WHERE type='trigger' AND name='KnowledgePointRevision_immutable'");
  if (rows.length !== 1 || !rows[0].sql.includes("BEFORE UPDATE ON") || !rows[0].sql.includes("Knowledge revisions are immutable")) throw new Error("The existing all-row revision immutability trigger is required.");
  return rows;
};
const oldRevisionRows = client => client.$queryRawUnsafe('SELECT * FROM "KnowledgePointRevision" WHERE "id" IN (?,?,?,?) ORDER BY "id"', "aliases-source-v1", "aliases-source-v2", "aliases-reader-v1", "aliases-reader-v2");
const withoutRecordTables = state => Object.fromEntries(Object.entries(state).filter(([name]) => !["KnowledgePoint", "KnowledgePointRevision"].includes(name)));
const withoutPointCursor = rows => comparableRows(rows.map(({ currentRevisionId: _cursor, updatedAt: _updatedAt, ...fields }) => fields));

const verifyRecordDatesUpgrade = async ({ webRoot, PrismaClient }) => {
  const tempBase = path.resolve(os.tmpdir());
  const temporaryRoot = fs.mkdtempSync(path.join(tempBase, "englishnode-record-dates-upgrade-"));
  const databasePath = path.join(temporaryRoot, "previous-records-and-configurations.db");
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
    let before, beforeLedger, beforeTrigger;
    try {
      await removeRecordDatesFromFixture(preparation);
      await populateHistoricalKnowledge(preparation, { aliases: true });
      await populateHistoricalSavedViews(preparation);
      await populateHistoricalRecordTemplates(preparation);
      before = await snapshot(preparation);
      beforeLedger = await ledgerSnapshot(preparation);
      beforeTrigger = await immutableTrigger(preparation);
      if (beforeLedger.length !== 30 || beforeLedger.some(row => row.migration_name === recordDatesMigration)) throw new Error("Date upgrade must start at exactly the 30-migration boundary.");
      if (Object.keys(before).length !== 27 || before.KnowledgePointRevision.length !== 4 || before.KnowledgePointRevision.some(row => JSON.parse(row.aliasesJson).length !== 3)) throw new Error("Populated old revisions and raw aliases are required.");
      if (before.SavedKnowledgeView.length !== 2 || before.KnowledgeRecordTemplate.length !== 2 || [...before.SavedKnowledgeView, ...before.KnowledgeRecordTemplate].some(row => !row.configJson || row.version <= 1)) throw new Error("Both old configuration kinds with nonempty raw configuration and versions are required.");
    } finally { await preparation.$disconnect(); }
    const beforeHash = fingerprint(databasePath);
    const first = await lifecycle("2026-11-09T18:00:00.000Z");
    if (!first.backupPath || !fs.existsSync(first.backupPath) || fingerprint(first.backupPath) !== beforeHash) throw new Error("Date upgrade must retain an exact pre-migration backup.");
    const upgraded = createClient();
    let afterLedger, finalSnapshot;
    try {
      same(await snapshot(upgraded, { omitRecordDates: true }), before, "Date migration changed old fields, raw sources, aliases, pointers or configurations.");
      same(await immutableTrigger(upgraded), beforeTrigger, "Date migration changed the immutable revision trigger.");
      const oldRows = comparableRows(await oldRevisionRows(upgraded));
      if (oldRows.length !== 4 || oldRows.some(row => row.recordDate !== null || row.recordDateTimeZone !== null)) throw new Error("All historical revisions must remain undated without backfill.");
      afterLedger = await ledgerSnapshot(upgraded);
      same(afterLedger.filter(row => row.migration_name !== recordDatesMigration), beforeLedger, "Date migration rewrote historical ledger rows.");
      if (afterLedger.length !== 31 || afterLedger.length !== beforeLedger.length + 1) throw new Error("Date migration must be applied exactly once.");
      let updateRejected = false;
      try { await upgraded.$executeRawUnsafe('UPDATE "KnowledgePointRevision" SET "recordDate"=?,"recordDateTimeZone"=? WHERE "id"=?', "2026-10-31", "Asia/Shanghai", "aliases-reader-v2"); }
      catch { updateRejected = true; }
      if (!updateRejected) throw new Error("The existing trigger must reject direct date UPDATE of a historical revision.");
      same(comparableRows(await oldRevisionRows(upgraded)), oldRows, "A rejected date overwrite changed historical raw revision data.");

      const parent = await upgraded.knowledgePointRevision.findUniqueOrThrow({ where: { id: "aliases-reader-v2" } });
      const tuples = [["2026-10-31", "Asia/Shanghai"], ["2026-11-01", "US/Eastern"], [null, null]];
      let currentId = parent.id;
      const appended = [];
      for (const [index, tuple] of tuples.entries()) {
        const revision = await upgraded.$transaction(async tx => {
          const created = await tx.knowledgePointRevision.create({ data: {
            id: `dated-reader-v${index + 3}`, knowledgePointId: parent.knowledgePointId, sequence: index + 3,
            title: parent.title, body: parent.body, sourceType: parent.sourceType, sourcesJson: parent.sourcesJson, aliasesJson: parent.aliasesJson,
            recordDate: tuple[0], recordDateTimeZone: tuple[1], createdAt: new Date(`2026-11-09T18:00:0${index + 1}.000Z`)
          } });
          const updated = await tx.knowledgePoint.updateMany({ where: { id: parent.knowledgePointId, currentRevisionId: currentId }, data: { currentRevisionId: created.id } });
          if (updated.count !== 1) throw new Error("The appended date revision did not match the current pointer.");
          return created;
        });
        currentId = revision.id;
        appended.push(revision);
      }
      same(appended.map(row => [row.recordDate, row.recordDateTimeZone]), tuples, "Date additions, changes or clearing were converted or lost.");
      if (appended.some(row => row.body !== parent.body || row.aliasesJson !== parent.aliasesJson || row.sourcesJson !== parent.sourcesJson)) throw new Error("Appending date metadata changed inherited raw record content.");
      const point = await upgraded.knowledgePoint.findUniqueOrThrow({ where: { id: parent.knowledgePointId }, include: { currentRevision: true } });
      if (point.currentRevisionId !== currentId || point.currentRevision.recordDate !== null || point.currentRevision.recordDateTimeZone !== null) throw new Error("Explicit date clearing must point to the new undated revision.");
      same(comparableRows(await oldRevisionRows(upgraded)), oldRows, "Appending dates rewrote historical revision bytes.");
      same(await immutableTrigger(upgraded), beforeTrigger, "Date operations changed the immutability trigger.");
      same(await ledgerSnapshot(upgraded), afterLedger, "Appending revisions changed migration history.");
      finalSnapshot = await snapshot(upgraded);
      if (finalSnapshot.KnowledgePointRevision.length !== 7) throw new Error("Date changes must append exactly three revisions.");
      same(withoutRecordTables(finalSnapshot), withoutRecordTables(before), "Date metadata operations changed configuration, graph, learning or AI facts.");
      same(withoutPointCursor(finalSnapshot.KnowledgePoint), withoutPointCursor(before.KnowledgePoint), "Date metadata changed record fields beyond the explicit current pointer.");
      if ((await upgraded.$queryRawUnsafe("PRAGMA foreign_key_check")).length) throw new Error("Date upgrade or revision append left foreign-key violations.");
      same((await upgraded.$queryRawUnsafe("PRAGMA integrity_check")).map(row => Object.values(row)[0]), ["ok"], "Date upgrade failed integrity checking.");
    } finally { await upgraded.$disconnect(); }
    const reopened = createClient();
    try { same(await snapshot(reopened), finalSnapshot, "Reopening lost date history, current pointer or configuration fields."); }
    finally { await reopened.$disconnect(); }
    const repeatHash = fingerprint(databasePath);
    const second = await lifecycle("2026-11-09T18:02:00.000Z");
    if (!second.backupPath || fingerprint(second.backupPath) !== repeatHash) throw new Error("Repeated date lifecycle must preserve an exact backup.");
    const repeated = createClient();
    try {
      same(await snapshot(repeated), finalSnapshot, "Repeated lifecycle changed date history or other data.");
      same(await ledgerSnapshot(repeated), afterLedger, "Repeated lifecycle duplicated or rewrote migrations.");
      same(await immutableTrigger(repeated), beforeTrigger, "Repeated lifecycle changed the immutability trigger.");
      if ((await repeated.$queryRawUnsafe("PRAGMA foreign_key_check")).length) throw new Error("Repeated date lifecycle left foreign-key violations.");
      same((await repeated.$queryRawUnsafe("PRAGMA integrity_check")).map(row => Object.values(row)[0]), ["ok"], "Repeated date lifecycle failed integrity checking.");
    } finally { await repeated.$disconnect(); }
    return { beforeMigrationCount: 30, afterMigrationCount: 31, existingRevisions: 4, existingSavedViews: 2, existingTemplates: 2,
      backupCreatedBeforeMigration: true, originalFieldsPreserved: true, rawAliasesSourcesPreserved: true,
      migrationPointersPreserved: true, configurationsPreserved: true, historicalLedgerPreserved: true,
      oldDatesAllNull: true, immutableTriggerPreserved: true, immutableDateUpdateRejected: true,
      appendedDateRevisions: 3, explicitDateClearPreserved: true, oldRawRevisionsUnchanged: true,
      foreignKeyViolations: 0, integrity: "ok", reopenedUnchanged: true, repeatedLifecycleUnchanged: true };
  } finally {
    if (process.env.KEEP_MIGRATION_FIDELITY_FIXTURE === "1") console.error("Kept isolated record-date migration fixture: " + temporaryRoot);
    else {
      if (path.dirname(path.resolve(temporaryRoot)) !== tempBase || !path.basename(temporaryRoot).startsWith("englishnode-record-dates-upgrade-")) throw new Error("Refusing to remove an unexpected record-date fixture directory.");
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
  }
};

module.exports = { recordDatesMigration, verifyRecordDatesUpgrade };
