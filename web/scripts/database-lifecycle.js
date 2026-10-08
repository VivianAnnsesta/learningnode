const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawnSync } = require("child_process");

const databaseUrl = (databasePath) => `file:${databasePath.replace(/\\/g, "/")}`;

const normalizeSqliteValue = (value) => {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "bigint") return value.toString();
  return value;
};

const normalizeSqliteRecord = (record) =>
  Object.fromEntries(
    Object.entries(record).map(([key, value]) => [key, normalizeSqliteValue(value)])
  );

const tableExists = async (client, tableName) => {
  const rows = await client.$queryRawUnsafe(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
    tableName
  );
  return rows.length > 0;
};

const tableColumns = async (client, tableName) => {
  const rows = await client.$queryRawUnsafe(`PRAGMA table_info("${tableName}")`);
  return new Set(rows.map((row) => row.name));
};

const queryIfTableExists = async (client, tableName, query) =>
  (await tableExists(client, tableName)) ? client.$queryRawUnsafe(query) : [];

const FIDELITY_SNAPSHOT_VERSION = 2;

const assertSupportedFidelitySnapshot = (snapshot) => {
  if (
    !snapshot ||
    snapshot.version !== FIDELITY_SNAPSHOT_VERSION ||
    !Array.isArray(snapshot.words) ||
    !Array.isArray(snapshot.knowledgeGraphEdges)
  ) {
    throw new Error(
      "Unsupported migration fidelity snapshot. Restore the pre-migration database backup and retry."
    );
  }
};

const captureLegacyMigrationFidelity = async ({
  userDatabasePath,
  PrismaClient,
  now = () => new Date()
}) => {
  const client = new PrismaClient({
    datasources: { db: { url: databaseUrl(userDatabasePath) } }
  });
  try {
    const hasLegacyWords = await tableExists(client, "Word");
    const hasKnowledgeGraphEdges = await tableExists(client, "KnowledgeGraphEdge");
    const knowledgeGraphEdgeColumns = hasKnowledgeGraphEdges
      ? await tableColumns(client, "KnowledgeGraphEdge")
      : new Set();
    const needsRelationVariantBridge =
      hasKnowledgeGraphEdges && !knowledgeGraphEdgeColumns.has("legacyVariantsJson");
    if (needsRelationVariantBridge && (await tableExists(client, "_prisma_migrations"))) {
      const appliedDedupe = await client.$queryRawUnsafe(
        `SELECT 1 FROM "_prisma_migrations"
         WHERE "migration_name" = '20260714203000_make_knowledge_graph_edges_idempotent'
           AND "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL`
      );
      if (appliedDedupe.length > 0) {
        throw new Error(
          "Relation variants may already have been removed. Restore a backup from before the relation deduplication migration."
        );
      }
    }
    if (!hasLegacyWords && !needsRelationVariantBridge) return null;

    const wordColumns = hasLegacyWords ? await tableColumns(client, "Word") : new Set();
    const optionalWordColumn = (name) =>
      wordColumns.has(name) ? `"${name}"` : `NULL AS "${name}"`;
    const words = hasLegacyWords
      ? await client.$queryRawUnsafe(`
          SELECT "id", ${optionalWordColumn("text")}, ${optionalWordColumn("canvasId")},
                 ${optionalWordColumn("nodeType")}, ${optionalWordColumn("masteryStatus")},
                 ${optionalWordColumn("isIsland")}, ${optionalWordColumn("islandReason")},
                 ${optionalWordColumn("userUnderstanding")}, ${optionalWordColumn("positionX")},
                 ${optionalWordColumn("positionY")}, ${optionalWordColumn("createdAt")},
                 ${optionalWordColumn("updatedAt")}, ${optionalWordColumn("language")},
                 ${optionalWordColumn("sentenceSample")},
                 ${optionalWordColumn("lastReviewedAt")}, ${optionalWordColumn("nextReviewAt")},
                 ${optionalWordColumn("reviewIntervalDays")}
          FROM "Word" ORDER BY "id"
        `)
      : [];
    const coreEssences = await queryIfTableExists(
      client,
      "CoreEssence",
      `SELECT "id", "wordId", "summary", "rationale", "createdAt"
       FROM "CoreEssence" ORDER BY "wordId", "createdAt" DESC, "id"`
    );
    const trees = await queryIfTableExists(
      client,
      "InferenceTree",
      `SELECT "id", "wordId", "name", "description", "createdAt", "updatedAt"
       FROM "InferenceTree" ORDER BY "wordId", "createdAt", "id"`
    );
    const nodes = await queryIfTableExists(
      client,
      "TreeNode",
      `SELECT "id", "treeId", "label", "nodeType", "content", "createdAt", "updatedAt"
       FROM "TreeNode" ORDER BY "treeId", "createdAt", "id"`
    );
    const relations = await queryIfTableExists(
      client,
      "NodeRelation",
      `SELECT "id", "treeId", "fromNodeId", "toNodeId", "relationType", "detail", "createdAt"
       FROM "NodeRelation" ORDER BY "treeId", "createdAt", "id"`
    );
    const wordTags = (await tableExists(client, "WordTag"))
      ? await client.$queryRawUnsafe(`
          SELECT "WordTag"."wordId", "Tag"."name"
          FROM "WordTag"
          JOIN "Tag" ON "Tag"."id" = "WordTag"."tagId"
          JOIN "Word" ON "Word"."id" = "WordTag"."wordId"
          ORDER BY "WordTag"."wordId", "Tag"."name"
        `)
      : [];
    const nodeTags = (await tableExists(client, "NodeTag"))
      ? await client.$queryRawUnsafe(`
          SELECT "NodeTag"."nodeId", "Tag"."name"
          FROM "NodeTag"
          JOIN "Tag" ON "Tag"."id" = "NodeTag"."tagId"
          JOIN "TreeNode" ON "TreeNode"."id" = "NodeTag"."nodeId"
          ORDER BY "NodeTag"."nodeId", "Tag"."name"
        `)
      : [];
    const treeTags = (await tableExists(client, "TreeTag"))
      ? await client.$queryRawUnsafe(`
          SELECT "TreeTag"."treeId", "Tag"."name"
          FROM "TreeTag"
          JOIN "Tag" ON "Tag"."id" = "TreeTag"."tagId"
          JOIN "InferenceTree" ON "InferenceTree"."id" = "TreeTag"."treeId"
          ORDER BY "TreeTag"."treeId", "Tag"."name"
        `)
      : [];

    const countRows = async (tableName) => {
      if (!(await tableExists(client, tableName))) return 0;
      const [row] = await client.$queryRawUnsafe(`SELECT COUNT(*) AS count FROM "${tableName}"`);
      return Number(row.count);
    };
    const assignmentCounts = {
      WordTag: await countRows("WordTag"),
      NodeTag: await countRows("NodeTag"),
      TreeTag: await countRows("TreeTag")
    };
    if (
      assignmentCounts.WordTag !== wordTags.length ||
      assignmentCounts.NodeTag !== nodeTags.length ||
      assignmentCounts.TreeTag !== treeTags.length
    ) {
      throw new Error("Legacy migration fidelity capture found an orphaned Tag assignment.");
    }

    const wordIds = new Set(words.map((word) => word.id));
    const treeIds = new Set(trees.map((tree) => tree.id));
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const invalidStructure =
      coreEssences.some((core) => !wordIds.has(core.wordId)) ||
      trees.some((tree) => !wordIds.has(tree.wordId)) ||
      nodes.some((node) => !treeIds.has(node.treeId)) ||
      relations.some((relation) => {
        const source = nodeById.get(relation.fromNodeId);
        const target = nodeById.get(relation.toNodeId);
        return (
          !treeIds.has(relation.treeId) ||
          !source ||
          !target ||
          source.treeId !== relation.treeId ||
          target.treeId !== relation.treeId
        );
      });
    if (invalidStructure) {
      throw new Error("Legacy migration fidelity capture found an orphaned inference record.");
    }

    const namesFor = (rows, key, value) =>
      rows.filter((row) => row[key] === value).map((row) => row.name);

    const existingKnowledgeGraphEdges = needsRelationVariantBridge
      ? (await client.$queryRawUnsafe(`
          SELECT rowid AS "legacyRowId", *
          FROM "KnowledgeGraphEdge"
          ORDER BY "domainId", "fromNodeId", "toNodeId", "relationType", rowid
        `)).map((edge) => ({ ...edge, legacySource: "KnowledgeGraphEdge" }))
      : [];
    const legacyWordRelations = needsRelationVariantBridge && (await tableExists(client, "WordRelation"))
      ? (await client.$queryRawUnsafe(`
          SELECT "WordRelation".rowid AS "legacyRowId", "WordRelation"."id",
                 "FromWord"."canvasId" AS "domainId",
                 "WordRelation"."fromWordId" AS "fromNodeId",
                 "WordRelation"."toWordId" AS "toNodeId",
                 "WordRelation"."relationType", "WordRelation"."detail",
                 "WordRelation"."status", "WordRelation"."evidenceStrength",
                 "WordRelation"."userExplanation", "WordRelation"."aiAssessment",
                 "WordRelation"."applicability", "WordRelation"."misuseRisk",
                 "WordRelation"."createdAt"
          FROM "WordRelation"
          JOIN "Word" AS "FromWord" ON "FromWord"."id" = "WordRelation"."fromWordId"
          JOIN "Word" AS "ToWord" ON "ToWord"."id" = "WordRelation"."toWordId"
          ORDER BY "FromWord"."canvasId", "WordRelation"."fromWordId",
                   "WordRelation"."toWordId", "WordRelation"."relationType", "WordRelation".rowid
        `)).map((edge) => ({ ...edge, legacySource: "WordRelation" }))
      : [];
    if (await tableExists(client, "WordRelation")) {
      const wordRelationCount = await countRows("WordRelation");
      if (wordRelationCount !== legacyWordRelations.length) {
        throw new Error("Legacy migration fidelity capture found an orphaned WordRelation.");
      }
    }
    const compareRelationVariants = (left, right) => {
      for (const field of ["domainId", "fromNodeId", "toNodeId", "relationType", "createdAt"]) {
        const comparison = String(normalizeSqliteValue(left[field]) ?? "").localeCompare(
          String(normalizeSqliteValue(right[field]) ?? "")
        );
        if (comparison !== 0) return comparison;
      }
      const sourceComparison =
        (left.legacySource === "KnowledgeGraphEdge" ? 0 : 1) -
        (right.legacySource === "KnowledgeGraphEdge" ? 0 : 1);
      if (sourceComparison !== 0) return sourceComparison;
      const leftRowId = BigInt(normalizeSqliteValue(left.legacyRowId) ?? 0);
      const rightRowId = BigInt(normalizeSqliteValue(right.legacyRowId) ?? 0);
      if (leftRowId !== rightRowId) return leftRowId < rightRowId ? -1 : 1;
      return String(left.id).localeCompare(String(right.id));
    };
    const knowledgeGraphEdges = [...existingKnowledgeGraphEdges, ...legacyWordRelations].sort(
      compareRelationVariants
    );

    return {
      version: FIDELITY_SNAPSHOT_VERSION,
      capturedAt: now().toISOString(),
      words: words.map((word) => ({
        id: word.id,
        text: word.text,
        canvasId: word.canvasId,
        nodeType: word.nodeType,
        masteryStatus: word.masteryStatus,
        isIsland: word.isIsland,
        islandReason: word.islandReason,
        userUnderstanding: word.userUnderstanding,
        positionX: word.positionX,
        positionY: word.positionY,
        createdAt: normalizeSqliteValue(word.createdAt),
        updatedAt: normalizeSqliteValue(word.updatedAt),
        language: word.language,
        sentenceSample: word.sentenceSample,
        lastReviewedAt: normalizeSqliteValue(word.lastReviewedAt),
        nextReviewAt: normalizeSqliteValue(word.nextReviewAt),
        reviewIntervalDays: word.reviewIntervalDays,
        coreEssences: coreEssences
          .filter((core) => core.wordId === word.id)
          .map((core) => ({
            id: core.id,
            summary: core.summary,
            rationale: core.rationale,
            createdAt: normalizeSqliteValue(core.createdAt)
          })),
        inferenceTrees: trees
          .filter((tree) => tree.wordId === word.id)
          .map((tree) => ({
            id: tree.id,
            name: tree.name,
            description: tree.description,
            createdAt: normalizeSqliteValue(tree.createdAt),
            updatedAt: normalizeSqliteValue(tree.updatedAt),
            tags: namesFor(treeTags, "treeId", tree.id),
            nodes: nodes
              .filter((node) => node.treeId === tree.id)
              .map((node) => ({
                id: node.id,
                label: node.label,
                nodeType: node.nodeType,
                content: node.content,
                createdAt: normalizeSqliteValue(node.createdAt),
                updatedAt: normalizeSqliteValue(node.updatedAt),
                tags: namesFor(nodeTags, "nodeId", node.id)
              })),
            relations: relations
              .filter((relation) => relation.treeId === tree.id)
              .map((relation) => ({
                id: relation.id,
                fromNodeId: relation.fromNodeId,
                toNodeId: relation.toNodeId,
                relationType: relation.relationType,
                detail: relation.detail,
                createdAt: normalizeSqliteValue(relation.createdAt)
              }))
          })),
        wordTags: namesFor(wordTags, "wordId", word.id)
      })),
      knowledgeGraphEdges: knowledgeGraphEdges.map(normalizeSqliteRecord)
    };
  } finally {
    await client.$disconnect();
  }
};

const fidelityEnvelopeFor = (word) => ({
  version: 1,
  branches: word.inferenceTrees.flatMap((tree) =>
    tree.nodes.map((node) => ({
      title: node.label || "",
      detail: node.content || ""
    }))
  ),
  legacy: {
    coreEssences: word.coreEssences,
    inferenceTrees: word.inferenceTrees,
    wordTags: word.wordTags
  }
});

const relationVariantGroups = (snapshot) => {
  const groups = new Map();
  for (const edge of snapshot.knowledgeGraphEdges || []) {
    const key = JSON.stringify([
      edge.domainId,
      edge.fromNodeId,
      edge.toNodeId,
      edge.relationType
    ]);
    const group = groups.get(key) || [];
    group.push(edge);
    groups.set(key, group);
  }
  return groups;
};

const restoreLegacyMigrationFidelity = async ({
  userDatabasePath,
  PrismaClient,
  snapshot
}) => {
  assertSupportedFidelitySnapshot(snapshot);
  const client = new PrismaClient({
    datasources: { db: { url: databaseUrl(userDatabasePath) } }
  });
  try {
    for (const word of snapshot.words) {
      const updated = await client.$executeRawUnsafe(
        `UPDATE "KnowledgePoint"
         SET "language" = ?, "sentenceSample" = ?, "lastReviewedAt" = ?,
             "nextReviewAt" = ?, "reviewIntervalDays" = ?, "manualBranchesJson" = ?
         WHERE "legacyWordId" = ?`,
        word.language,
        word.sentenceSample,
        word.lastReviewedAt,
        word.nextReviewAt,
        word.reviewIntervalDays,
        JSON.stringify(fidelityEnvelopeFor(word)),
        word.id
      );
      if (Number(updated) < 1) {
        throw new Error(`Migration fidelity restore could not find Word "${word.id}".`);
      }
    }
    for (const variants of relationVariantGroups(snapshot).values()) {
      const edge = variants[0];
      const updated = await client.$executeRawUnsafe(
        `UPDATE "KnowledgeGraphEdge" SET "legacyVariantsJson" = ?
         WHERE "domainId" = ? AND "fromNodeId" = ? AND "toNodeId" = ? AND "relationType" = ?`,
        JSON.stringify(variants),
        edge.domainId,
        edge.fromNodeId,
        edge.toNodeId,
        edge.relationType
      );
      if (Number(updated) !== 1) {
        throw new Error("Migration fidelity restore could not resolve one formal graph relation.");
      }
    }
  } finally {
    await client.$disconnect();
  }
};

const comparableValue = (value) => {
  const normalized = normalizeSqliteValue(value);
  return normalized === null ? null : String(normalized);
};

const verifyMigrationFidelity = async ({
  userDatabasePath,
  PrismaClient,
  snapshot
}) => {
  assertSupportedFidelitySnapshot(snapshot);
  const client = new PrismaClient({
    datasources: { db: { url: databaseUrl(userDatabasePath) } }
  });
  const report = {
    words: snapshot.words.length,
    coreEssences: 0,
    inferenceTrees: 0,
    treeNodes: 0,
    nodeRelations: 0,
    tagAssignments: 0,
    knowledgeGraphEdgeVariants: (snapshot.knowledgeGraphEdges || []).length
  };
  try {
    for (const word of snapshot.words) {
      const rows = await client.$queryRawUnsafe(
        `SELECT "legacyWordId", "domainId", "title", "userUnderstanding", "masteryStatus",
                "isIsland", "islandReason", "language", "sentenceSample", "coreEssence",
                "manualBranchesJson", "lastReviewedAt", "nextReviewAt", "reviewIntervalDays",
                "createdAt", "updatedAt"
         FROM "KnowledgePoint" WHERE "legacyWordId" = ?`,
        word.id
      );
      if (rows.length !== 1) {
        throw new Error(`Migration fidelity check failed for Word "${word.id}": record count`);
      }
      const point = rows[0];
      const fields = [
        ["domainId", "canvasId"],
        ["title", "text"],
        ["userUnderstanding", "userUnderstanding"],
        ["masteryStatus", "masteryStatus"],
        ["isIsland", "isIsland"],
        ["islandReason", "islandReason"],
        ["createdAt", "createdAt"],
        ["updatedAt", "updatedAt"],
        "language",
        "sentenceSample",
        "lastReviewedAt",
        "nextReviewAt",
        "reviewIntervalDays"
      ];
      for (const fieldMapping of fields) {
        const [targetField, sourceField] = Array.isArray(fieldMapping)
          ? fieldMapping
          : [fieldMapping, fieldMapping];
        if (comparableValue(point[targetField]) !== comparableValue(word[sourceField])) {
          throw new Error(`Migration fidelity check failed for Word "${word.id}": ${targetField}`);
        }
      }
      const graphNodes = await client.$queryRawUnsafe(
        `SELECT "domainId", "title", "nodeType", "status", "positionX", "positionY",
                "createdAt", "updatedAt"
         FROM "KnowledgeGraphNode" WHERE "knowledgePointId" = ?`,
        point.legacyWordId
      );
      if (graphNodes.length !== 1) {
        throw new Error(`Migration fidelity check failed for Word "${word.id}": graph node count`);
      }
      const graphNode = graphNodes[0];
      const expectedGraphStatus = word.masteryStatus === "not_started" ? "candidate" : word.masteryStatus;
      for (const [targetField, expected] of [
        ["domainId", word.canvasId], ["title", word.text], ["nodeType", word.nodeType],
        ["status", expectedGraphStatus], ["positionX", word.positionX], ["positionY", word.positionY],
        ["createdAt", word.createdAt], ["updatedAt", word.updatedAt]
      ]) {
        if (comparableValue(graphNode[targetField]) !== comparableValue(expected)) {
          throw new Error(`Migration fidelity check failed for Word "${word.id}": graph ${targetField}`);
        }
      }

      const latestCore = word.coreEssences[0] || null;
      if (latestCore && comparableValue(point.coreEssence) !== comparableValue(latestCore.summary)) {
        throw new Error(`Migration fidelity check failed for Word "${word.id}": coreEssence`);
      }

      let envelope;
      try {
        envelope = JSON.parse(String(point.manualBranchesJson || ""));
      } catch {
        throw new Error(`Migration fidelity check failed for Word "${word.id}": manualBranchesJson`);
      }
      if (JSON.stringify(envelope) !== JSON.stringify(fidelityEnvelopeFor(word))) {
        throw new Error(`Migration fidelity check failed for Word "${word.id}": legacy structure`);
      }

      report.coreEssences += word.coreEssences.length;
      report.inferenceTrees += word.inferenceTrees.length;
      report.treeNodes += word.inferenceTrees.reduce((total, tree) => total + tree.nodes.length, 0);
      report.nodeRelations += word.inferenceTrees.reduce(
        (total, tree) => total + tree.relations.length,
        0
      );
      report.tagAssignments +=
        word.wordTags.length +
        word.inferenceTrees.reduce(
          (total, tree) =>
            total + tree.tags.length + tree.nodes.reduce((sum, node) => sum + node.tags.length, 0),
          0
        );
    }
    for (const variants of relationVariantGroups(snapshot).values()) {
      const edge = variants[0];
      const rows = await client.$queryRawUnsafe(
        `SELECT "legacyVariantsJson" FROM "KnowledgeGraphEdge"
         WHERE "domainId" = ? AND "fromNodeId" = ? AND "toNodeId" = ? AND "relationType" = ?`,
        edge.domainId,
        edge.fromNodeId,
        edge.toNodeId,
        edge.relationType
      );
      if (rows.length !== 1) {
        throw new Error("Migration fidelity check failed for one formal graph relation: record count");
      }
      let restoredVariants;
      try {
        restoredVariants = JSON.parse(String(rows[0].legacyVariantsJson || ""));
      } catch {
        throw new Error("Migration fidelity check failed for one formal graph relation: variants");
      }
      if (JSON.stringify(restoredVariants) !== JSON.stringify(variants)) {
        throw new Error("Migration fidelity check failed for one formal graph relation: semantics");
      }
    }
    return report;
  } finally {
    await client.$disconnect();
  }
};

const runPrismaMigrateDeploy = ({
  userDatabasePath,
  schemaPath,
  prismaCliPath,
  spawnSync: run = spawnSync
}) => {
  const result = run(
    process.execPath,
    [prismaCliPath, "migrate", "deploy", "--schema", schemaPath],
    {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        DATABASE_URL: databaseUrl(userDatabasePath)
      },
      encoding: "utf8"
    }
  );
  if (result.error) {
    throw new Error(`Prisma migrate deploy failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const stderr = String(result.stderr || "").trim();
    throw new Error(`Prisma migrate deploy failed: ${stderr || `exit ${result.status}`}`);
  }
};

const runPrismaDbExecute = ({
  userDatabasePath,
  schemaPath,
  prismaCliPath,
  sqlFilePath,
  spawnSync: run = spawnSync
}) => {
  const result = run(
    process.execPath,
    [prismaCliPath, "db", "execute", "--schema", schemaPath, "--file", sqlFilePath],
    {
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: "1",
        DATABASE_URL: databaseUrl(userDatabasePath)
      },
      encoding: "utf8"
    }
  );
  if (result.error) {
    throw new Error(`Prisma db execute failed: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const stderr = String(result.stderr || "").trim();
    throw new Error(`Prisma db execute failed: ${stderr || `exit ${result.status}`}`);
  }
};

const backupPathFor = (userDatabasePath, now) => {
  const timestamp = now().toISOString().replace(/[:.]/g, "-");
  const parsed = path.parse(userDatabasePath);
  return path.join(parsed.dir, `${parsed.name}.backup-${timestamp}${parsed.ext}`);
};

const prepareUserDatabase = async ({
  userDatabasePath,
  seedDatabasePath,
  migrate,
  foreignKeyCheck,
  now = () => new Date()
}) => {
  fs.mkdirSync(path.dirname(userDatabasePath), { recursive: true });

  const existingDatabase = fs.existsSync(userDatabasePath);
  let backupPath = null;
  if (existingDatabase) {
    backupPath = backupPathFor(userDatabasePath, now);
    fs.copyFileSync(userDatabasePath, backupPath, fs.constants.COPYFILE_EXCL);
  } else {
    if (!fs.existsSync(seedDatabasePath)) {
      throw new Error(`Versioned seed database is missing: ${seedDatabasePath}`);
    }
    fs.copyFileSync(seedDatabasePath, userDatabasePath);
  }

  await migrate(userDatabasePath);
  const violations = await foreignKeyCheck(userDatabasePath);
  if (violations.length > 0) {
    throw new Error(`Foreign-key check failed with ${violations.length} violation(s).`);
  }

  return {
    userDatabasePath,
    createdFromSeed: !existingDatabase,
    backupPath
  };
};

const checkForeignKeysWithPrisma = async ({
  userDatabasePath,
  PrismaClient
}) => {
  const client = new PrismaClient({
    datasources: { db: { url: databaseUrl(userDatabasePath) } }
  });
  try {
    return await client.$queryRawUnsafe("PRAGMA foreign_key_check");
  } finally {
    await client.$disconnect();
  }
};

const migrationEntries = (migrationsDirectory) =>
  fs
    .readdirSync(migrationsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      sqlPath: path.join(migrationsDirectory, entry.name, "migration.sql")
    }))
    .filter((entry) => fs.existsSync(entry.sqlPath))
    .sort((left, right) => left.name.localeCompare(right.name));

const markHistoricalMigrationsApplied = async ({
  userDatabasePath,
  migrationsDirectory,
  PrismaClient,
  throughMigration,
  now = () => new Date()
}) => {
  const client = new PrismaClient({
    datasources: { db: { url: databaseUrl(userDatabasePath) } }
  });
  try {
    await client.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "checksum" TEXT NOT NULL,
        "finished_at" DATETIME,
        "migration_name" TEXT NOT NULL,
        "logs" TEXT,
        "rolled_back_at" DATETIME,
        "started_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "applied_steps_count" INTEGER NOT NULL DEFAULT 0
      )
    `);

    const entries = migrationEntries(migrationsDirectory);
    const throughIndex = throughMigration
      ? entries.findIndex((migration) => migration.name === throughMigration)
      : entries.length - 1;
    if (throughMigration && throughIndex < 0) {
      throw new Error(`Baseline migration boundary not found: ${throughMigration}`);
    }

    for (const migration of entries.slice(0, throughIndex + 1)) {
      const existing = await client.$queryRawUnsafe(
        'SELECT 1 FROM "_prisma_migrations" WHERE "migration_name" = ?',
        migration.name
      );
      if (existing.length > 0) continue;

      const checksum = crypto
        .createHash("sha256")
        .update(fs.readFileSync(migration.sqlPath))
        .digest("hex");
      const timestamp = now().toISOString();
      await client.$executeRawUnsafe(
        `INSERT INTO "_prisma_migrations" (
          "id", "checksum", "finished_at", "migration_name", "started_at", "applied_steps_count"
        ) VALUES (?, ?, ?, ?, ?, 1)`,
        crypto.randomUUID(),
        checksum,
        timestamp,
        migration.name,
        timestamp
      );
    }
  } finally {
    await client.$disconnect();
  }
};

const runUserDatabaseLifecycle = async ({
  userDatabasePath,
  seedDatabasePath,
  schemaPath,
  prismaCliPath,
  PrismaClient,
  now
}) => {
  const fidelitySnapshotPath = `${userDatabasePath}.migration-fidelity.json`;
  let snapshot = null;
  const result = await prepareUserDatabase({
    userDatabasePath,
    seedDatabasePath,
    now,
    migrate: async (databasePath) => {
      if (fs.existsSync(fidelitySnapshotPath)) {
        snapshot = JSON.parse(fs.readFileSync(fidelitySnapshotPath, "utf8"));
        assertSupportedFidelitySnapshot(snapshot);
      } else {
        snapshot = await captureLegacyMigrationFidelity({
          userDatabasePath: databasePath,
          PrismaClient,
          now
        });
        if (snapshot) {
          const temporarySnapshotPath = `${fidelitySnapshotPath}.${crypto.randomUUID()}.tmp`;
          fs.writeFileSync(temporarySnapshotPath, JSON.stringify(snapshot, null, 2), {
            encoding: "utf8",
            flag: "wx"
          });
          fs.renameSync(temporarySnapshotPath, fidelitySnapshotPath);
        }
      }
      runPrismaMigrateDeploy({
        userDatabasePath: databasePath,
        schemaPath,
        prismaCliPath
      });
      if (snapshot) {
        await restoreLegacyMigrationFidelity({
          userDatabasePath: databasePath,
          PrismaClient,
          snapshot
        });
        await verifyMigrationFidelity({
          userDatabasePath: databasePath,
          PrismaClient,
          snapshot
        });
      }
    },
    foreignKeyCheck: (databasePath) =>
      checkForeignKeysWithPrisma({ userDatabasePath: databasePath, PrismaClient })
  });
  if (snapshot && fs.existsSync(fidelitySnapshotPath)) {
    fs.rmSync(fidelitySnapshotPath);
  }
  return result;
};

module.exports = {
  backupPathFor,
  prepareUserDatabase,
  databaseUrl,
  runPrismaMigrateDeploy,
  runPrismaDbExecute,
  checkForeignKeysWithPrisma,
  captureLegacyMigrationFidelity,
  restoreLegacyMigrationFidelity,
  verifyMigrationFidelity,
  markHistoricalMigrationsApplied,
  runUserDatabaseLifecycle
};
