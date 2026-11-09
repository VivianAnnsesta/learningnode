import type { PrismaClientLike } from "./database-lifecycle";

export const aliasesMigration: string;
export interface RevisionAliasesUpgradeReport {
  beforeMigrationCount: number;
  afterMigrationCount: number;
  existingRevisions: number;
  backupCreatedBeforeMigration: boolean;
  originalFieldsPreserved: boolean;
  currentPointersPreserved: boolean;
  multiParagraphSourcesPreserved: boolean;
  aliasesDefault: string;
  foreignKeyViolations: number;
  repeatedLifecycleUnchanged: boolean;
}
export function verifyRevisionAliasesUpgrade(options: {
  webRoot: string;
  PrismaClient: PrismaClientLike;
}): Promise<RevisionAliasesUpgradeReport>;
