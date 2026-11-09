import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";

export const planningRequestSelect = {
  id: true, name: true, description: true, currentLevel: true, goal: true,
  scope: true, excludedScope: true, depth: true, outputType: true, outputTarget: true,
  taskBrief: true, taskBriefConfirmedAt: true, entryGuideJson: true,
  courseDesignDraft: true, courseDesignStatus: true, courseDesignRepairCount: true,
  courseDesignConfirmedAt: true, courseDesignAiCallLogId: true
} satisfies Prisma.DomainSelect;

export type PlanningRequestRecord = Prisma.DomainGetPayload<{ select: typeof planningRequestSelect }>;

/** Only the original research inputs enter prompts, not the previous course or save guard. */
export function planningResearchDomain(record: PlanningRequestRecord) {
  const { id, name, description, currentLevel, goal, scope, excludedScope, depth, outputType, outputTarget, taskBrief, taskBriefConfirmedAt } = record;
  return { id, name, description, currentLevel, goal, scope, excludedScope, depth, outputType, outputTarget, taskBrief, taskBriefConfirmedAt };
}

export function savedPlanningInput(record: { entryGuideJson?: string | null }) {
  try {
    const input = JSON.parse(record.entryGuideJson || "{}").planningInput;
    return { materials: typeof input?.materials === "string" ? input.materials : "", feedback: typeof input?.feedback === "string" ? input.feedback : "" };
  } catch { return { materials: "", feedback: "" }; }
}

/** The starting candidate identity prevents two equal-input requests from overwriting each other. */
export function planningRequestFingerprint(record: PlanningRequestRecord) {
  return createHash("sha256").update(JSON.stringify({
    inputs: planningResearchDomain(record), planningInput: savedPlanningInput(record),
    candidate: {
      draft: record.courseDesignDraft ?? null, status: record.courseDesignStatus ?? null,
      repairCount: record.courseDesignRepairCount ?? null,
      confirmedAt: record.courseDesignConfirmedAt ?? null, aiCallLogId: record.courseDesignAiCallLogId ?? null
    }
  })).digest("hex");
}

export class StalePlanningRequestError extends Error {
  constructor() {
    super("规划输入或课程候选已更新；本次旧结果已保留在调用日志中，不能覆盖当前课程，请基于当前输入重试。");
    this.name = "StalePlanningRequestError";
  }
}
