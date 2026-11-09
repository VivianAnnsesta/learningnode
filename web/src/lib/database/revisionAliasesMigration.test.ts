import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { PrismaClient } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { validateEmptySeedDatabase } from "../../../scripts/seed-validation";
import { verifyRevisionAliasesUpgrade } from "../../../scripts/revision-aliases-fidelity";

describe("revision-owned aliases data migration", () => {
  it("backs up populated previous revisions, preserving snapshots and pointers through the actual lifecycle", async () => {
    const result = await verifyRevisionAliasesUpgrade({ webRoot: process.cwd(), PrismaClient });
    expect(result).toMatchObject({
      beforeMigrationCount: 27, afterMigrationCount: 28, existingRevisions: 4,
      backupCreatedBeforeMigration: true, originalFieldsPreserved: true,
      currentPointersPreserved: true, multiParagraphSourcesPreserved: true,
      aliasesDefault: "[]", foreignKeyViolations: 0, repeatedLifecycleUnchanged: true
    });
  }, 60000);

  it("keeps the versioned seed empty with the complete matching migration ledger and aliases default", async () => {
    const tempBase = path.resolve(os.tmpdir());
    const temporaryRoot = fs.mkdtempSync(path.join(tempBase, "englishnode-empty-aliases-seed-"));
    const databasePath = path.join(temporaryRoot, "seed.db");
    fs.copyFileSync(path.resolve("prisma", "seed.db"), databasePath);
    try {
      const result = await validateEmptySeedDatabase({
        databasePath, migrationsDirectory: path.resolve("prisma", "migrations"), PrismaClient
      });
      expect(result.migrationCount).toBe(28);
      expect(result.checksumsMatch).toBe(true);
      expect(result.aliasesDefault).toBe("[]");
      expect(Object.keys(result.businessCounts)).toContain("KnowledgePointRevision");
      expect(Object.values(result.businessCounts).every(count => count === 0)).toBe(true);
      expect(result.foreignKeyViolations).toBe(0);
      expect(result.integrity).toBe("ok");
    } finally {
      if (path.dirname(path.resolve(temporaryRoot)) !== tempBase ||
          !path.basename(temporaryRoot).startsWith("englishnode-empty-aliases-seed-")) {
        throw new Error("Refusing to remove an unexpected seed fixture directory.");
      }
      fs.rmSync(temporaryRoot, { recursive: true, force: true });
    }
  }, 30000);
});
