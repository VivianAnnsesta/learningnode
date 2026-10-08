import { prisma } from "../prisma";
import { getCourseDesignState } from "./courseDesignService";
import { getDomainMap } from "./domainMapService";
import {
  evaluateMapDraftReview,
  getBoundMapDraftReview,
  type MapDraftReviewState
} from "./mapDraftReviewService";
import { getRoadmapByDomain } from "./roadmapService";

export const domainWorkflowActions = [
  "CONFIRM_TASK_BRIEF",
  "RESEARCH_COURSE_DESIGN",
  "GENERATE_SKELETON",
  "REVIEW_MAP",
  "RESOLVE_MAP_REVIEW",
  "CONFIRM_MAP",
  "EXPAND_STAGE",
  "REVIEW_STAGE",
  "CONFIRM_STAGE",
  "OPEN_FIRST_NODE"
] as const;

export type DomainWorkflowAction = (typeof domainWorkflowActions)[number];

export type DomainWorkflowInput = {
  taskBriefConfirmed: boolean;
  courseDesignReady: boolean;
  formalMapExists: boolean;
  formalNodeCount: number;
  formalHasPlannedStages: boolean;
  draftExists: boolean;
  draftHasExpandedStages: boolean;
  reviewState: MapDraftReviewState | null;
};

export type DomainWorkflowSnapshot = {
  phase:
    | "needs_task_brief"
    | "needs_course_design"
    | "needs_skeleton"
    | "needs_map_review"
    | "needs_review_resolution"
    | "ready_to_confirm_map"
    | "needs_stage_expansion"
    | "needs_stage_review"
    | "ready_to_confirm_stage"
    | "learning_ready";
  allowedActions: DomainWorkflowAction[];
  blockers: string[];
};

export function deriveDomainWorkflowSnapshot(
  input: DomainWorkflowInput
): DomainWorkflowSnapshot {
  if (!input.taskBriefConfirmed) {
    return {
      phase: "needs_task_brief",
      allowedActions: ["CONFIRM_TASK_BRIEF"],
      blockers: ["任务书尚未由服务端确认。"]
    };
  }
  if (!input.courseDesignReady) {
    return {
      phase: "needs_course_design",
      allowedActions: ["RESEARCH_COURSE_DESIGN"],
      blockers: ["课程设计方向尚未通过确定性质量门。"]
    };
  }

  if (input.draftExists) {
    const reviewAction = input.formalMapExists ? "REVIEW_STAGE" : "REVIEW_MAP";
    if (input.reviewState === "blocked" || input.reviewState === "unavailable") {
      return {
        phase: "needs_review_resolution",
        allowedActions: ["RESOLVE_MAP_REVIEW", reviewAction],
        blockers: [
          input.reviewState === "unavailable"
            ? "AI 语义复审暂不可用，需要重试或明确确认风险。"
            : "AI 语义复审仍有未解决发现，需要编辑、重试或带理由裁决。"
        ]
      };
    }
    if (input.reviewState !== "passed" && input.reviewState !== "resolved") {
      return {
        phase: input.formalMapExists ? "needs_stage_review" : "needs_map_review",
        allowedActions: [reviewAction],
        blockers: ["当前草稿缺少与内容及版本绑定的有效复审回执。"]
      };
    }
    return {
      phase: input.formalMapExists
        ? "ready_to_confirm_stage"
        : "ready_to_confirm_map",
      allowedActions: [input.formalMapExists ? "CONFIRM_STAGE" : "CONFIRM_MAP"],
      blockers: []
    };
  }

  if (!input.formalMapExists) {
    return {
      phase: "needs_skeleton",
      allowedActions: ["GENERATE_SKELETON"],
      blockers: []
    };
  }

  if (input.formalNodeCount > 0) {
    return {
      phase: "learning_ready",
      allowedActions: [
        "OPEN_FIRST_NODE",
        ...(input.formalHasPlannedStages ? (["EXPAND_STAGE"] as const) : [])
      ],
      blockers: []
    };
  }

  return {
    phase: "needs_stage_expansion",
    allowedActions: ["EXPAND_STAGE"],
    blockers: ["正式地图还没有可进入的 Learning Node，请先展开并确认一个 Stage。"]
  };
}

export async function getDomainWorkflowSnapshot(domainId: string) {
  const [domain, courseDesignState, roadmap, map] = await Promise.all([
    prisma.domain.findUnique({
      where: { id: domainId },
      select: { taskBriefConfirmedAt: true }
    }),
    getCourseDesignState(domainId),
    getRoadmapByDomain(domainId),
    getDomainMap(domainId)
  ]);
  if (!domain) throw new Error("学习领域不存在");

  const review = roadmap?.draft
    ? await getBoundMapDraftReview(domainId)
    : null;
  const reviewState =
    roadmap?.draft && roadmap.draftCourseDesignAiCallLogId
      ? evaluateMapDraftReview({
          draft: roadmap.draft,
          baseRevision: roadmap.mapRevision,
          courseDesignAiCallLogId: roadmap.draftCourseDesignAiCallLogId,
          review
        })
      : null;
  const courseDesignReady = Boolean(
    courseDesignState.draft?.qualityGate.passed &&
      courseDesignState.aiCallLogId &&
      ["draft", "confirmed"].includes(courseDesignState.status)
  );

  return deriveDomainWorkflowSnapshot({
    taskBriefConfirmed: Boolean(domain.taskBriefConfirmedAt),
    courseDesignReady,
    formalMapExists: Boolean(map.roadmap),
    formalNodeCount: map.nodes.length,
    formalHasPlannedStages: Boolean(map.roadmap?.hasPlannedStages),
    draftExists: Boolean(roadmap?.draft),
    draftHasExpandedStages: Boolean(
      roadmap?.draft?.stages.some(
        (stage: { status?: string | null; modules?: unknown[] }) =>
          stage.status === "expanded" || Boolean(stage.modules?.length)
      )
    ),
    reviewState
  });
}
