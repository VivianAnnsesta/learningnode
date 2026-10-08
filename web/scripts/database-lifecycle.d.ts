export interface PrismaClientLike {
  new (options: { datasources: { db: { url: string } } }): {
    $queryRawUnsafe(query: string, ...values: unknown[]): Promise<unknown[]>;
    $executeRawUnsafe(query: string, ...values: unknown[]): Promise<unknown>;
    $disconnect(): Promise<void>;
  };
}

export interface UserDatabaseLifecycleResult {
  userDatabasePath: string;
  createdFromSeed: boolean;
  backupPath: string | null;
}

export interface LegacyMigrationCoreEssence {
  id: string;
  summary: string;
  rationale: string | null;
  createdAt: string | null;
}

export interface LegacyMigrationTreeNode {
  id: string;
  label: string;
  nodeType: string;
  content: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  tags: string[];
}

export interface LegacyMigrationInferenceTree {
  id: string;
  name: string | null;
  description: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  tags: string[];
  nodes: LegacyMigrationTreeNode[];
  relations: Array<{
    id: string;
    fromNodeId: string;
    toNodeId: string;
    relationType: string;
    detail: string | null;
    createdAt: string | null;
  }>;
}

export interface LegacyMigrationFidelitySnapshot {
  version: 2;
  capturedAt: string;
  words: Array<{
    id: string;
    text: string | null;
    canvasId: string | null;
    nodeType: string | null;
    masteryStatus: string | null;
    isIsland: number | boolean | null;
    islandReason: string | null;
    userUnderstanding: string | null;
    positionX: number | null;
    positionY: number | null;
    createdAt: string | null;
    updatedAt: string | null;
    language: string | null;
    sentenceSample: string | null;
    lastReviewedAt: string | null;
    nextReviewAt: string | null;
    reviewIntervalDays: number | null;
    coreEssences: LegacyMigrationCoreEssence[];
    inferenceTrees: LegacyMigrationInferenceTree[];
    wordTags: string[];
  }>;
  knowledgeGraphEdges: Array<{
    legacyRowId: string;
    id: string;
    domainId: string;
    fromNodeId: string;
    toNodeId: string;
    relationType: string;
    [key: string]: unknown;
  }>;
}

export interface MigrationFidelityReport {
  words: number;
  coreEssences: number;
  inferenceTrees: number;
  treeNodes: number;
  nodeRelations: number;
  tagAssignments: number;
  knowledgeGraphEdgeVariants: number;
}

export function prepareUserDatabase(options: {
  userDatabasePath: string;
  seedDatabasePath: string;
  migrate: (databasePath: string) => Promise<void> | void;
  foreignKeyCheck: (databasePath: string) => Promise<unknown[]> | unknown[];
  now?: () => Date;
}): Promise<UserDatabaseLifecycleResult>;

export function runPrismaMigrateDeploy(options: {
  userDatabasePath: string;
  schemaPath: string;
  prismaCliPath: string;
  spawnSync?: (...args: unknown[]) => { status?: number; stderr?: unknown; error?: Error };
}): void;

export function runPrismaDbExecute(options: {
  userDatabasePath: string;
  schemaPath: string;
  prismaCliPath: string;
  sqlFilePath: string;
  spawnSync?: (...args: unknown[]) => { status?: number; stderr?: unknown; error?: Error };
}): void;

export function captureLegacyMigrationFidelity(options: {
  userDatabasePath: string;
  PrismaClient: PrismaClientLike;
  now?: () => Date;
}): Promise<LegacyMigrationFidelitySnapshot | null>;

export function restoreLegacyMigrationFidelity(options: {
  userDatabasePath: string;
  PrismaClient: PrismaClientLike;
  snapshot: LegacyMigrationFidelitySnapshot;
}): Promise<void>;

export function verifyMigrationFidelity(options: {
  userDatabasePath: string;
  PrismaClient: PrismaClientLike;
  snapshot: LegacyMigrationFidelitySnapshot;
}): Promise<MigrationFidelityReport>;

export function markHistoricalMigrationsApplied(options: {
  userDatabasePath: string;
  migrationsDirectory: string;
  PrismaClient: PrismaClientLike;
  throughMigration?: string;
  now?: () => Date;
}): Promise<void>;

export function runUserDatabaseLifecycle(options: {
  userDatabasePath: string;
  seedDatabasePath: string;
  schemaPath: string;
  prismaCliPath: string;
  PrismaClient: PrismaClientLike;
  now?: () => Date;
}): Promise<UserDatabaseLifecycleResult>;
