export type AiValidationIssue = {
  code: string;
  path: string;
  message: string;
  stageKey?: string;
  moduleKey?: string;
  questionKey?: string;
  actualGoalKeys?: string[];
  allowedGoalKeys?: string[];
  missingGoalKeys?: string[];
  actualReferenceKeys?: string[];
  allowedReferenceKeys?: string[];
};

export class AiTaskValidationError extends Error {
  constructor(message: string, readonly issues: AiValidationIssue[] = []) {
    super(message);
    this.name = "AiTaskValidationError";
  }
}

export function validationIssues(error: unknown): AiValidationIssue[] {
  if (error instanceof Error && "issues" in error && Array.isArray(error.issues) && error.issues.length) {
    return error.issues as AiValidationIssue[];
  }
  return [{ code: "validation_failed", path: "$", message: error instanceof Error ? error.message : "内容校验失败。" }];
}

export type AiFailureReference = { aiRunId?: string; aiCallLogId?: string; aiCallLogIds?: string[] };

export function aiFailureReference(error: unknown): AiFailureReference {
  if (!(error instanceof Error)) return {};
  const value = error as Error & AiFailureReference;
  return {
    ...(value.aiRunId ? { aiRunId: value.aiRunId } : {}),
    ...(value.aiCallLogId ? { aiCallLogId: value.aiCallLogId } : {}),
    ...(value.aiCallLogIds ? { aiCallLogIds: value.aiCallLogIds } : {})
  };
}
