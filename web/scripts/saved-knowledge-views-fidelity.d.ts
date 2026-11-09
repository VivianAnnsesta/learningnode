import type { PrismaClientLike } from "./database-lifecycle";

export const savedViewsMigration: string;
export interface SavedKnowledgeViewsUpgradeReport {
  beforeMigrationCount: number;
  afterMigrationCount: number;
  existingRevisions: number;
  backupCreatedBeforeMigration: boolean;
  originalFieldsPreserved: boolean;
  rawAliasesPreserved: boolean;
  currentPointersPreserved: boolean;
  multiParagraphSourcesPreserved: boolean;
  historicalLedgerPreserved: boolean;
  newConfigurationTableInitiallyEmpty: boolean;
  configurationReopenedUnchanged: boolean;
  configurationVersion: number;
  configurationWritesLeaveKnowledgeUnchanged: boolean;
  foreignKeyViolations: number;
  integrity: string;
  repeatedLifecycleUnchanged: boolean;
}
export function verifySavedKnowledgeViewsUpgrade(options: {
  webRoot: string;
  PrismaClient: PrismaClientLike;
}): Promise<SavedKnowledgeViewsUpgradeReport>;
