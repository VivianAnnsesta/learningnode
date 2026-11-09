import type { PrismaClientLike } from "./database-lifecycle";

export const recordTemplatesMigration: string;
export interface RecordTemplatesUpgradeReport {
  beforeMigrationCount: number;
  afterMigrationCount: number;
  existingRevisions: number;
  existingSavedViews: number;
  backupCreatedBeforeMigration: boolean;
  originalFieldsPreserved: boolean;
  rawAliasesPreserved: boolean;
  currentPointersPreserved: boolean;
  multiParagraphSourcesPreserved: boolean;
  oldSavedViewsPreserved: boolean;
  historicalLedgerPreserved: boolean;
  newTemplateTableInitiallyEmpty: boolean;
  customTemplateReopenedUnchanged: boolean;
  templateRawBodyPreserved: boolean;
  templateVersion: number;
  templateWritesLeaveOldDataUnchanged: boolean;
  foreignKeyViolations: number;
  integrity: string;
  repeatedLifecycleUnchanged: boolean;
}
export function verifyRecordTemplatesUpgrade(options: {
  webRoot: string;
  PrismaClient: PrismaClientLike;
}): Promise<RecordTemplatesUpgradeReport>;
