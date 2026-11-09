import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { validateEmptySeedDatabase } from "../../../scripts/seed-validation";
import { verifyRecordTemplatesUpgrade } from "../../../scripts/record-templates-fidelity";

describe("personal record template configuration migration", () => {
  it("preserves populated knowledge and saved views through backup-first upgrade and custom-template restart", async () => {
    const result = await verifyRecordTemplatesUpgrade({ webRoot: process.cwd(), PrismaClient });
    expect(result).toMatchObject({
      beforeMigrationCount: 29, afterMigrationCount: 30, existingRevisions: 4, existingSavedViews: 2,
      backupCreatedBeforeMigration: true, originalFieldsPreserved: true, rawAliasesPreserved: true,
      currentPointersPreserved: true, multiParagraphSourcesPreserved: true, oldSavedViewsPreserved: true,
      historicalLedgerPreserved: true, newTemplateTableInitiallyEmpty: true, customTemplateReopenedUnchanged: true,
      templateRawBodyPreserved: true, templateVersion: 2, templateWritesLeaveOldDataUnchanged: true,
      foreignKeyViolations: 0, integrity: "ok", repeatedLifecycleUnchanged: true
    });
  }, 60000);

  it("keeps the current seed empty with template defaults and the complete migration ledger", async () => {
    const tempBase = path.resolve(os.tmpdir());
    const temporaryRoot = fs.mkdtempSync(path.join(tempBase, "englishnode-empty-record-template-seed-"));
    const databasePath = path.join(temporaryRoot, "seed.db");
    fs.copyFileSync(path.resolve("prisma", "seed.db"), databasePath);
    try {
      const result = await validateEmptySeedDatabase({ databasePath, migrationsDirectory: path.resolve("prisma", "migrations"), PrismaClient });
      const currentMigrationCount = fs.readdirSync(path.resolve("prisma", "migrations"), { withFileTypes: true })
        .filter(entry => entry.isDirectory() && fs.existsSync(path.resolve("prisma", "migrations", entry.name, "migration.sql"))).length;
      expect(result.migrationCount).toBe(currentMigrationCount);
      expect(result.checksumsMatch).toBe(true);
      expect(Object.keys(result.businessCounts)).toHaveLength(27);
      expect(result.businessCounts.KnowledgeRecordTemplate).toBe(0);
      expect(Object.values(result.businessCounts).every(count => count === 0)).toBe(true);
      expect(result.recordTemplateColumns).toEqual(["id", "title", "schemaVersion", "configJson", "version", "createdAt", "updatedAt"]);
      expect(result.recordTemplateSchemaVersionDefault).toBe(1);
      expect(result.recordTemplateVersionDefault).toBe(1);
      expect(result.savedViewSchemaVersionDefault).toBe(1);
      expect(result.savedViewVersionDefault).toBe(1);
      expect(result.aliasesDefault).toBe("[]");
      expect(result.foreignKeyViolations).toBe(0);
      expect(result.integrity).toBe("ok");
    } finally {
      if (path.dirname(path.resolve(temporaryRoot)) !== tempBase || !path.basename(temporaryRoot).startsWith("englishnode-empty-record-template-seed-")) throw new Error("Refusing to remove an unexpected template seed fixture directory.");
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
  }, 30000);
});
