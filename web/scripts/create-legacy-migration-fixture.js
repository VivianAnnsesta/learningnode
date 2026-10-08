const { execFileSync, spawnSync } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { PrismaClient } = require("@prisma/client");
const {
  checkForeignKeysWithPrisma,
  databaseUrl,
  markHistoricalMigrationsApplied
} = require("./database-lifecycle");

const webRoot = path.resolve(__dirname, "..");
const repositoryRoot = path.resolve(webRoot, "..");
const legacySchemaCommit = "71a0071e0e6f8a04141b24fdd74e2a53b24f94b6";
const fixturePath = path.join(webRoot, "prisma", "fixtures", "legacy-pre-removal.db");
const migrationsDirectory = path.join(webRoot, "prisma", "migrations");
const prismaCliPath = path.join(webRoot, "node_modules", "prisma", "build", "index.js");

const run = async () => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), "englishnode-legacy-fixture-"));
  const legacySchemaPath = path.join(temporaryRoot, "legacy.schema.prisma");
  fs.mkdirSync(path.dirname(fixturePath), { recursive: true });
  fs.rmSync(fixturePath, { force: true });

  try {
    const legacySchema = execFileSync(
      "git",
      ["show", `${legacySchemaCommit}:web/prisma/schema.prisma`],
      { cwd: repositoryRoot, encoding: "utf8" }
    );
    fs.writeFileSync(legacySchemaPath, legacySchema, "utf8");
    const push = spawnSync(
      process.execPath,
      [
        prismaCliPath,
        "db",
        "push",
        "--schema",
        legacySchemaPath,
        "--skip-generate",
        "--accept-data-loss"
      ],
      {
        cwd: webRoot,
        env: { ...process.env, DATABASE_URL: databaseUrl(fixturePath) },
        encoding: "utf8"
      }
    );
    if (push.error || push.status !== 0) {
      throw push.error || new Error(String(push.stderr || push.stdout));
    }

    const client = new PrismaClient({
      datasources: { db: { url: databaseUrl(fixturePath) } }
    });
    try {
      const statements = [
        `INSERT INTO "GraphCanvas" ("id", "name", "status", "createdAt", "updatedAt")
         VALUES ('domain-legacy', 'Legacy JavaScript', 'active', '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z')`,
        `INSERT INTO "Domain" (
           "id", "legacyCanvasId", "name", "status", "createdAt", "updatedAt"
         ) VALUES (
           'domain-legacy', 'domain-legacy', 'Legacy JavaScript', 'active',
           '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z'
         )`,
        `INSERT INTO "Word" (
           "id", "text", "language", "sentenceSample", "nodeType", "masteryStatus",
           "isIsland", "userUnderstanding", "lastReviewedAt", "nextReviewAt",
           "reviewIntervalDays", "canvasId", "createdAt", "updatedAt"
         ) VALUES
           ('word-closure', 'closure', 'en', 'A closure retains lexical state.', 'knowledge',
            'seen', 0, 'A function plus its retained environment.',
            '2026-06-05T00:00:00.000Z', '2026-06-12T00:00:00.000Z', 7,
            'domain-legacy', '2026-06-01T00:00:00.000Z', '2026-06-05T00:00:00.000Z'),
           ('word-scope', 'lexical scope', 'en', 'Scope follows source structure.', 'knowledge',
            'seen', 0, 'Names resolve through lexical parents.', NULL, NULL, NULL,
            'domain-legacy', '2026-06-01T00:00:00.000Z', '2026-06-05T00:00:00.000Z')`,
        `INSERT INTO "CoreEssence" ("id", "wordId", "summary", "rationale", "createdAt")
         VALUES (
           'core-closure', 'word-closure', 'Function plus retained lexical environment.',
           'Explains why captured variables remain available.', '2026-06-02T00:00:00.000Z'
         )`,
        `INSERT INTO "InferenceTree" (
           "id", "wordId", "name", "description", "createdAt", "updatedAt"
         ) VALUES (
           'tree-closure', 'word-closure', 'Execution model', 'Trace captured state',
           '2026-06-03T00:00:00.000Z', '2026-06-03T00:00:00.000Z'
         )`,
        `INSERT INTO "TreeNode" (
           "id", "treeId", "label", "nodeType", "content", "createdAt", "updatedAt"
         ) VALUES
           ('tree-node-create', 'tree-closure', 'Create function', 'step', 'Capture scope',
            '2026-06-03T00:00:00.000Z', '2026-06-03T00:00:00.000Z'),
           ('tree-node-call', 'tree-closure', 'Call later', 'step', 'Read captured value',
            '2026-06-03T00:00:00.000Z', '2026-06-03T00:00:00.000Z')`,
        `INSERT INTO "NodeRelation" (
           "id", "treeId", "fromNodeId", "toNodeId", "relationType", "detail", "createdAt"
         ) VALUES (
           'tree-relation', 'tree-closure', 'tree-node-create', 'tree-node-call',
           'leads_to', 'Later invocation', '2026-06-03T00:00:00.000Z'
         )`,
        `INSERT INTO "Tag" ("id", "name") VALUES
           ('tag-word', 'javascript'), ('tag-node', 'runtime'), ('tag-tree', 'reasoning')`,
        `INSERT INTO "WordTag" ("wordId", "tagId") VALUES ('word-closure', 'tag-word')`,
        `INSERT INTO "NodeTag" ("nodeId", "tagId") VALUES ('tree-node-call', 'tag-node')`,
        `INSERT INTO "TreeTag" ("treeId", "tagId") VALUES ('tree-closure', 'tag-tree')`,
        `INSERT INTO "WordRelation" (
           "id", "fromWordId", "toWordId", "relationType", "detail", "status",
           "evidenceStrength", "userExplanation", "aiAssessment", "applicability", "misuseRisk", "createdAt"
         ) VALUES
           ('edge-first', 'word-closure', 'word-scope', 'depends_on',
            'Closure uses lexical scope.', 'candidate', 'weak', 'First explanation', NULL, NULL, NULL,
            '2026-06-04T00:00:00.000Z'),
           ('edge-second', 'word-closure', 'word-scope', 'depends_on',
            'Captured bindings resolve lexically.', 'confirmed', 'strong', 'Second explanation',
            'Accurate', 'JavaScript functions', 'Do not confuse with dynamic scope',
            '2026-06-05T00:00:00.000Z')`
      ];
      for (const statement of statements) {
        await client.$executeRawUnsafe(statement);
      }
    } finally {
      await client.$disconnect();
    }

    await markHistoricalMigrationsApplied({
      userDatabasePath: fixturePath,
      migrationsDirectory,
      PrismaClient,
      throughMigration: "20260706143000_add_domain_research_input_fields",
      now: () => new Date("2026-07-17T00:00:00.000Z")
    });
    const violations = await checkForeignKeysWithPrisma({
      userDatabasePath: fixturePath,
      PrismaClient
    });
    if (violations.length > 0) {
      throw new Error(`Legacy fixture has ${violations.length} foreign-key violation(s).`);
    }
    console.log(`Created synthetic legacy migration fixture: ${fixturePath}`);
  } finally {
    fs.rmSync(temporaryRoot, { recursive: true, force: true });
  }
};

run().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
