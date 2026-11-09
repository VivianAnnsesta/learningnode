import type { PrismaClientLike } from "./database-lifecycle";

export interface EmptySeedValidation {
  businessCounts: Record<string, number>;
  migrationCount: number;
  checksumsMatch: boolean;
  aliasesDefault: string;
  foreignKeyViolations: number;
  integrity: string;
}

export function validateEmptySeedDatabase(options: {
  databasePath: string;
  migrationsDirectory: string;
  PrismaClient: PrismaClientLike;
}): Promise<EmptySeedValidation>;
