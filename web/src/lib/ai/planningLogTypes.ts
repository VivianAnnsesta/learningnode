import type { AiValidationIssue } from "./validationEvidence";
import type { AiMessage } from "./provider";

export const planningLogTasks = [
  "task_brief_generation", "course_design_research", "course_design_regeneration", "course_design_repair", "course_design_critique", "source_relevance_check",
  "roadmap_skeleton_generation", "roadmap_skeleton_critique", "roadmap_skeleton_repair", "roadmap_stage_generation", "roadmap_stage_critique", "roadmap_stage_repair", "roadmap_generation"
] as const;

export const planningLogLabels: Record<string, string> = {
  task_brief_generation: "入门导引与任务书", course_design_research: "课程研究", course_design_regeneration: "重新研究课程", course_design_repair: "课程修复", course_design_critique: "课程内容复核", source_relevance_check: "资料相关性复核",
  roadmap_skeleton_generation: "阶段骨架生成", roadmap_skeleton_critique: "阶段骨架复核", roadmap_skeleton_repair: "阶段骨架修复", roadmap_stage_generation: "概念节点规划", roadmap_stage_critique: "节点规划复核", roadmap_stage_repair: "节点规划修复", roadmap_generation: "课程地图生成"
};

export type PlanningLogSummary = {
  id: string; taskType: string; provider: string; model: string | null; status: string; inputSummary: string | null; outputSummary: string | null; errorMessage: string | null;
  createdAt: string; finishedAt: string | null; latencyMs: number | null; promptVersion: string | null; providerRequestId: string | null;
  runId: string | null; attempt: number | null; retryOfLogId: string | null; retryReason: string | null; failureStage: string | null;
};
export type PlanningLogDetail = PlanningLogSummary & {
  requestMessages: AiMessage[] | null; rawOutput: string | null; providerResponse: unknown; parsedOutput: unknown; validatedOutput: unknown;
  validationIssues: AiValidationIssue[]; researchSources: unknown; relatedAttempts: PlanningLogSummary[];
};
