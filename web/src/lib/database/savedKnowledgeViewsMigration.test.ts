import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { validateEmptySeedDatabase } from "../../../scripts/seed-validation";
import { verifySavedKnowledgeViewsUpgrade } from "../../../scripts/saved-knowledge-views-fidelity";

describe("saved knowledge view configuration migration", () => {
  it("preserves populated aliases, source snapshots and historical ledger through backup-first upgrade and configuration restart", async () => {
    const result = await verifySavedKnowledgeViewsUpgrade({ webRoot: process.cwd(), PrismaClient });
    expect(result).toMatchObject({
      beforeMigrationCount: 28, afterMigrationCount: 29, existingRevisions: 4,
      backupCreatedBeforeMigration: true, originalFieldsPreserved: true, rawAliasesPreserved: true,
      currentPointersPreserved: true, multiParagraphSourcesPreserved: true, historicalLedgerPreserved: true,
      newConfigurationTableInitiallyEmpty: true, configurationReopenedUnchanged: true,
      configurationVersion: 2, configurationWritesLeaveKnowledgeUnchanged: true,
      foreignKeyViolations: 0, integrity: "ok", repeatedLifecycleUnchanged: true
    });
  }, 60000);

  it("keeps the current seed empty with configuration defaults and a complete migration ledger", async () => {
    const tempBase = path.resolve(os.tmpdir());
    const temporaryRoot = fs.mkdtempSync(path.join(tempBase, "englishnode-empty-saved-views-seed-"));
    const databasePath = path.join(temporaryRoot, "seed.db");
    fs.copyFileSync(path.resolve("prisma", "seed.db"), databasePath);
    try {
      const result = await validateEmptySeedDatabase({ databasePath, migrationsDirectory: path.resolve("prisma", "migrations"), PrismaClient });
      const currentMigrationCount = fs.readdirSync(path.resolve("prisma", "migrations"), { withFileTypes: true })
        .filter(entry => entry.isDirectory() && fs.existsSync(path.resolve("prisma", "migrations", entry.name, "migration.sql"))).length;
      expect(result.migrationCount).toBe(currentMigrationCount);
      expect(result.checksumsMatch).toBe(true);
      expect(Object.keys(result.businessCounts)).toHaveLength(27);
      expect(result.businessCounts.SavedKnowledgeView).toBe(0);
      expect(Object.values(result.businessCounts).every(count => count === 0)).toBe(true);
      expect(result.savedViewColumns).toEqual(["id", "title", "schemaVersion", "configJson", "version", "createdAt", "updatedAt"]);
      expect(result.savedViewSchemaVersionDefault).toBe(1);
      expect(result.savedViewVersionDefault).toBe(1);
      expect(result.aliasesDefault).toBe("[]");
      expect(result.foreignKeyViolations).toBe(0);
      expect(result.integrity).toBe("ok");
    } finally {
      if (path.dirname(path.resolve(temporaryRoot)) !== tempBase || !path.basename(temporaryRoot).startsWith("englishnode-empty-saved-views-seed-")) throw new Error("Refusing to remove an unexpected saved-view seed fixture directory.");
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
  }, 30000);
});
