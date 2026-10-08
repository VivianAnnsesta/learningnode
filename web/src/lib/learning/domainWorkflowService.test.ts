import { describe, expect, it } from "vitest";
import { deriveDomainWorkflowSnapshot } from "./domainWorkflowService";

describe("deriveDomainWorkflowSnapshot", () => {
  const readyPlanning = {
    taskBriefConfirmed: true,
    courseDesignReady: true,
    formalMapExists: false,
    formalNodeCount: 0,
    formalHasPlannedStages: false,
    draftExists: false,
    draftHasExpandedStages: false,
    reviewState: null
  } as const;

  it("walks the planning chain from task brief to a confirmable skeleton", () => {
    expect(
      deriveDomainWorkflowSnapshot({
        ...readyPlanning,
        taskBriefConfirmed: false,
        courseDesignReady: false
      })
    ).toMatchObject({
      phase: "needs_task_brief",
      allowedActions: ["CONFIRM_TASK_BRIEF"]
    });
    expect(
      deriveDomainWorkflowSnapshot({
        ...readyPlanning,
        courseDesignReady: false
      })
    ).toMatchObject({
      phase: "needs_course_design",
      allowedActions: ["RESEARCH_COURSE_DESIGN"]
    });
    expect(deriveDomainWorkflowSnapshot(readyPlanning)).toMatchObject({
      phase: "needs_skeleton",
      allowedActions: ["GENERATE_SKELETON"]
    });
    expect(
      deriveDomainWorkflowSnapshot({
        ...readyPlanning,
        draftExists: true,
        reviewState: "passed"
      })
    ).toMatchObject({
      phase: "ready_to_confirm_map",
      allowedActions: ["CONFIRM_MAP"]
    });
  });

  it("offers an explicit resolution action for semantic blocks and review outages", () => {
    for (const reviewState of ["blocked", "unavailable"] as const) {
      expect(
        deriveDomainWorkflowSnapshot({
          ...readyPlanning,
          draftExists: true,
          reviewState
        })
      ).toMatchObject({
        phase: "needs_review_resolution",
        allowedActions: ["RESOLVE_MAP_REVIEW", "REVIEW_MAP"]
      });
    }
  });

  it("makes the first persisted node directly discoverable", () => {
    expect(
      deriveDomainWorkflowSnapshot({
        ...readyPlanning,
        formalMapExists: true,
        formalNodeCount: 1,
        formalHasPlannedStages: true
      })
    ).toMatchObject({
      phase: "learning_ready",
      allowedActions: ["OPEN_FIRST_NODE", "EXPAND_STAGE"]
    });
  });
});
