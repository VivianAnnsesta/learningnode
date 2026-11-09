import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getLongTermReviewSummary,
  getStageAssessmentSummaries,
  replaceRoadmap,
  saveRoadmapDraft,
  saveRoadmapItemLearning
} from "./roadmapService";

const prismaMock = vi.hoisted(() => ({
  domain: {
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn()
  },
  wordRelation: {
    findMany: vi.fn()
  },
  unit: {
    findMany: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn()
  },
  learningNode: {
    deleteMany: vi.fn(),
    create: vi.fn(),
    findMany: vi.fn(),
    updateMany: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn()
  },
  learningNodeDependency: {
    create: vi.fn(),
    deleteMany: vi.fn()
  },
  unitAssessmentRecord: {
    create: vi.fn()
  },
  knowledgePoint: {
    findUnique: vi.fn(),
    findMany: vi.fn(),
    create: vi.fn(),
    update: vi.fn()
  },
  knowledgeGraphNode: {
    upsert: vi.fn()
  },
  knowledgeGraphEdge: {
    findMany: vi.fn()
  },
  aiCallLog: {
    create: vi.fn()
  },
  word: {
    findMany: vi.fn()
  },
  $transaction: vi.fn()
}));

vi.mock("../prisma", () => ({
  prisma: prismaMock
}));

describe("roadmapService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-25T00:00:00.000Z"));
    vi.clearAllMocks();
    prismaMock.domain.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.unit.updateMany.mockResolvedValue({ count: 1 });
    prismaMock.$transaction.mockImplementation(async (arg: any) =>
      Array.isArray(arg) ? Promise.all(arg) : arg(prismaMock)
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // Superseded contract: replaces a roadmap with normalized nested stages.
// Current equivalents use real SQLite in learningSessionService/roadmapLifecycle tests,
// and current provider contracts in coursePlanningCurrent; original test retained in before/retired.


  // Superseded contract: stores a validated map draft without changing the formal map revision.
// Current equivalents use real SQLite in learningSessionService/roadmapLifecycle tests,
// and current provider contracts in coursePlanningCurrent; original test retained in before/retired.


  // Superseded contract: binds a long-running AI draft write to the exact persisted draft it reviewed.
// Current equivalents use real SQLite in learningSessionService/roadmapLifecycle tests,
// and current provider contracts in coursePlanningCurrent; original test retained in before/retired.


  // Superseded contract: confirms course design fields and audit records inside the map transaction.
// Current equivalents use real SQLite in learningSessionService/roadmapLifecycle tests,
// and current provider contracts in coursePlanningCurrent; original test retained in before/retired.


  // Superseded contract: rejects saving a draft based on a stale formal map revision.
// Current equivalents use real SQLite in learningSessionService/roadmapLifecycle tests,
// and current provider contracts in coursePlanningCurrent; original test retained in before/retired.


  // Superseded contract: rejects formal reconciliation based on a stale revision.
// Current equivalents use real SQLite in learningSessionService/roadmapLifecycle tests,
// and current provider contracts in coursePlanningCurrent; original test retained in before/retired.


  // Superseded contract: does not delete a node that already has learning evidence.
// Current equivalents use real SQLite in learningSessionService/roadmapLifecycle tests,
// and current provider contracts in coursePlanningCurrent; original test retained in before/retired.


  // Superseded contract: saves roadmap item learning into knowledge point and learning node.
// Current equivalents use real SQLite in learningSessionService/roadmapLifecycle tests,
// and current provider contracts in coursePlanningCurrent; original test retained in before/retired.


  it("returns empty stage assessments when no roadmap exists", async () => {
    prismaMock.domain.findUnique.mockResolvedValue(null);
    prismaMock.unit.findMany.mockResolvedValue([]);
    prismaMock.learningNode.findMany.mockResolvedValue([]);

    await expect(getStageAssessmentSummaries("d1")).resolves.toEqual({
      roadmap: null,
      stages: []
    });
  });

  it("computes stage readiness and flagged items from roadmap progress", async () => {
    prismaMock.domain.findUnique.mockResolvedValue({
      id: "roadmap-1",
      name: "Roadmap",
      roadmapTitle: "Roadmap",
      roadmapStatus: "draft"
    });
    prismaMock.unit.findMany.mockResolvedValue([
      {
        id: "stage-1",
        domainId: "d1",
        title: "Stage 1",
        goal: "Understand basics",
        orderIndex: 0,
        status: "available",
        assessmentRecords: [
          {
            id: "record-1",
            readiness: "in_progress",
            appliedRoadmapStatus: "adjusting",
            adjustmentReason: "previous",
            createdAt: new Date("2026-06-20T00:00:00.000Z")
          }
        ]
      }
    ]);
    prismaMock.learningNode.findMany.mockResolvedValue([
      {
        id: "item-1",
        domainId: "d1",
        unitId: "stage-1",
        moduleTitle: "Module 1",
        moduleOrderIndex: 0,
        title: "Derive",
        nodeType: "knowledge",
        status: "in_progress",
        objective: null,
        keyQuestion: null,
        prerequisite: null,
        commonMistake: null,
        transferPrompt: null,
        orderIndex: 0,
        knowledgePoint: {
          masteryStatus: "can_recall",
          isIsland: false,
          nextReviewAt: new Date("2026-06-30T00:00:00.000Z"),
          coreEssence: "core summary",
          coreReviewSessions: [{ id: "review-1" }]
        },
        diagnosticQuestions: [
          {
            answers: [
              {
                createdAt: new Date("2026-06-21T00:00:00.000Z"),
                result: "solid"
              }
            ]
          }
        ]
      },
      {
        id: "item-2",
        domainId: "d1",
        unitId: "stage-1",
        moduleTitle: "Module 1",
        moduleOrderIndex: 0,
        title: "Transfer",
        nodeType: "knowledge",
        status: "locked",
        objective: null,
        keyQuestion: null,
        prerequisite: null,
        commonMistake: null,
        transferPrompt: null,
        orderIndex: 1,
        knowledgePoint: null,
        diagnosticQuestions: []
      }
    ]);

    const result = await getStageAssessmentSummaries("d1");

    expect(result.roadmap).toEqual({
      id: "roadmap-1",
      title: "Roadmap",
      status: "draft"
    });
    expect(result.stages).toHaveLength(1);
    expect(result.stages[0]).toMatchObject({
      stageId: "stage-1",
      readiness: "in_progress",
      totalItems: 2,
      startedItems: 1,
      recallReadyItems: 1,
      diagnosedItems: 1,
      reviewedItems: 1,
      coreCapturedItems: 1
    });
    expect(result.stages[0].flaggedItems[0].itemId).toBe("item-2");
  });

  it("builds a long-term review summary from due words and weak relations", async () => {
    prismaMock.knowledgePoint.findMany.mockResolvedValue([
      {
        id: "word-1",
        title: "derive",
        masteryStatus: "can_apply",
        isIsland: false,
        islandReason: null,
        lastReviewedAt: new Date("2026-06-20T00:00:00.000Z"),
        nextReviewAt: new Date("2026-06-22T00:00:00.000Z"),
        reviewIntervalDays: 3,
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
        updatedAt: new Date("2026-06-22T00:00:00.000Z"),
        learningNodes: [{ id: "item-1", title: "Derive" }]
      },
      {
        id: "word-2",
        title: "bridge",
        masteryStatus: "island",
        isIsland: true,
        islandReason: "no stable links",
        lastReviewedAt: new Date("2026-06-01T00:00:00.000Z"),
        nextReviewAt: null,
        reviewIntervalDays: null,
        createdAt: new Date("2026-06-01T00:00:00.000Z"),
        updatedAt: new Date("2026-06-22T00:00:00.000Z"),
        learningNodes: [{ id: "item-2", title: "Bridge" }]
      }
    ]);
    prismaMock.knowledgeGraphEdge.findMany.mockResolvedValue([
      {
        id: "rel-1",
        relationType: "WORMHOLE",
        status: "weak_wormhole",
        evidenceStrength: "weak",
        detail: null,
        userExplanation: null,
        aiAssessment: null,
        applicability: null,
        misuseRisk: null,
        createdAt: new Date("2026-06-20T00:00:00.000Z"),
        fromNode: {
          id: "word-1",
          domainId: "d1",
          title: "derive",
          domain: { id: "d1", name: "Domain 1" },
          knowledgePoint: { id: "word-1", title: "derive" }
        },
        toNode: {
          id: "word-2",
          domainId: "d1",
          title: "bridge",
          domain: { id: "d1", name: "Domain 1" },
          knowledgePoint: { id: "word-2", title: "bridge" }
        }
      }
    ]);

    const result = await getLongTermReviewSummary("d1");

    expect(result.overdueCount + result.dueTodayCount + result.upcomingCount).toBe(
      result.queue.length
    );
    expect(result.longTermIslandCount).toBe(1);
    expect(result.weakRelationCount).toBe(1);
    expect(result.longTermIslands[0]).toMatchObject({
      wordId: "word-2",
      islandReason: "no stable links"
    });
    expect(result.weakRelations[0]).toMatchObject({
      relationId: "rel-1",
      evidenceStrength: "weak"
    });
  });


});
