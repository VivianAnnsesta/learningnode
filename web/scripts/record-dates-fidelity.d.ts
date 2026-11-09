import type { PrismaClientLike } from "./database-lifecycle";

export const recordDatesMigration: string;
export interface RecordDatesUpgradeReport {
  beforeMigrationCount: number;
  afterMigrationCount: number;
  existingRevisions: number;
  existingSavedViews: number;
  existingTemplates: number;
  backupCreatedBeforeMigration: boolean;
  originalFieldsPreserved: boolean;
  rawAliasesSourcesPreserved: boolean;
  migrationPointersPreserved: boolean;
  configurationsPreserved: boolean;
  historicalLedgerPreserved: boolean;
  oldDatesAllNull: boolean;
  immutableTriggerPreserved: boolean;
  immutableDateUpdateRejected: boolean;
  appendedDateRevisions: number;
  explicitDateClearPreserved: boolean;
  oldRawRevisionsUnchanged: boolean;
  foreignKeyViolations: number;
  integrity: string;
  reopenedUnchanged: boolean;
  repeatedLifecycleUnchanged: boolean;
}
export function verifyRecordDatesUpgrade(options: {
  webRoot: string;
  PrismaClient: PrismaClientLike;
}): Promise<RecordDatesUpgradeReport>;
