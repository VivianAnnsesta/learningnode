import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { validateEmptySeedDatabase } from "../../../scripts/seed-validation";
import { verifyRecordDatesUpgrade } from "../../../scripts/record-dates-fidelity";

describe("revision-owned record date migration", () => {
  it("preserves the old raw database with its trigger while appending date additions, changes and clearing", async () => {
    const result = await verifyRecordDatesUpgrade({ webRoot: process.cwd(), PrismaClient });
    expect(result).toMatchObject({
      beforeMigrationCount: 30, afterMigrationCount: 31, existingRevisions: 4, existingSavedViews: 2, existingTemplates: 2,
      backupCreatedBeforeMigration: true, originalFieldsPreserved: true, rawAliasesSourcesPreserved: true,
      migrationPointersPreserved: true, configurationsPreserved: true, historicalLedgerPreserved: true,
      oldDatesAllNull: true, immutableTriggerPreserved: true, immutableDateUpdateRejected: true,
      appendedDateRevisions: 3, explicitDateClearPreserved: true, oldRawRevisionsUnchanged: true,
      foreignKeyViolations: 0, integrity: "ok", reopenedUnchanged: true, repeatedLifecycleUnchanged: true
    });
  }, 60000);

  it("keeps the current seed empty with both nullable date columns and the immutable trigger", async () => {
    const tempBase = path.resolve(os.tmpdir());
    const temporaryRoot = fs.mkdtempSync(path.join(tempBase, "englishnode-empty-record-date-seed-"));
    const databasePath = path.join(temporaryRoot, "seed.db");
    fs.copyFileSync(path.resolve("prisma", "seed.db"), databasePath);
    try {
      const result = await validateEmptySeedDatabase({ databasePath, migrationsDirectory: path.resolve("prisma", "migrations"), PrismaClient });
      expect(result.migrationCount).toBe(31);
      expect(result.checksumsMatch).toBe(true);
      expect(Object.keys(result.businessCounts)).toHaveLength(27);
      expect(Object.values(result.businessCounts).every(count => count === 0)).toBe(true);
      expect(result.recordDateColumns).toEqual(["recordDate", "recordDateTimeZone"]);
      expect(result.recordDateColumnsNullable).toBe(true);
      expect(result.recordDateDefaultsNull).toBe(true);
      expect(result.revisionImmutabilityTriggerPresent).toBe(true);
      expect(result.aliasesDefault).toBe("[]");
      expect(result.savedViewVersionDefault).toBe(1);
      expect(result.recordTemplateVersionDefault).toBe(1);
      expect(result.foreignKeyViolations).toBe(0);
      expect(result.integrity).toBe("ok");
    } finally {
      if (path.dirname(path.resolve(temporaryRoot)) !== tempBase || !path.basename(temporaryRoot).startsWith("englishnode-empty-record-date-seed-")) throw new Error("Refusing to remove an unexpected record-date seed fixture directory.");
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
  }, 30000);
});
