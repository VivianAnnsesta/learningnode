import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyStageAssessment,
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

  it("replaces a roadmap with normalized nested stages", async () => {
    prismaMock.domain.findUnique.mockResolvedValue({
      id: "d1",
      name: "English",
      roadmapTitle: "English 学习路线图",
      roadmapStatus: "draft",
      roadmapDraftJson: null,
      mapRevision: 0
    });
    prismaMock.unit.findMany.mockResolvedValue([
      {
        id: "stage-1",
        mapKey: "stage-1",
        domainId: "d1",
        title: "阶段 1",
        goal: null,
        orderIndex: 0,
        status: "available",
        rationale: null,
        moduleDirectionsJson: null,
        prerequisiteStageKeysJson: null,
        assessmentRecords: []
      }
    ]);
    prismaMock.learningNode.findMany.mockResolvedValue([
      {
        id: "item-1",
        mapKey: "item-1",
        domainId: "d1",
        unitId: "stage-1",
        moduleTitle: "模块 1",
        moduleOrderIndex: 0,
        title: "derive",
        nodeType: "knowledge",
        status: "locked",
        objective: null,
        keyQuestion: "what changes?",
        prerequisite: null,
        commonMistake: null,
        transferPrompt: null,
        orderIndex: 0,
        knowledgePointId: "word-1",
        dependencies: [],
        knowledgePoint: {
          id: "word-1",
          title: "derive",
          masteryStatus: "not_started",
          isIsland: false
        }
      }
    ]);
    prismaMock.domain.update.mockResolvedValue({
      id: "d1",
      roadmapTitle: "English 学习路线图",
      roadmapStatus: "draft"
    });
    prismaMock.unit.create.mockResolvedValue({
      id: "stage-1",
      domainId: "d1",
      title: "阶段 1",
      goal: null,
      orderIndex: 0,
      status: "available"
    });
    prismaMock.unit.update.mockResolvedValue({
      id: "stage-1",
      domainId: "d1",
      mapKey: "stage-1",
      title: "阶段 1",
      goal: null,
      orderIndex: 0,
      status: "expanded"
    });
    prismaMock.learningNode.create.mockResolvedValue({
      id: "item-1",
      domainId: "d1",
      unitId: "stage-1",
      moduleTitle: "模块 1",
      moduleOrderIndex: 0,
      title: "derive",
      status: "locked"
    });
    prismaMock.learningNode.update.mockResolvedValue({
      id: "item-1",
      domainId: "d1",
      mapKey: "item-1",
      unitId: "stage-1",
      moduleTitle: "模块 1",
      moduleOrderIndex: 0,
      title: "derive",
      status: "available"
    });

    await replaceRoadmap("d1", {
      stages: [
        {
          key: "stage-1",
          status: "expanded",
          modules: [
            {
              items: [
                {
                  key: "item-1",
                  title: "  derive  ",
                  keyQuestion: "  what changes? ",
                  linkedWordId: " word-1 "
                }
              ]
            }
          ]
        }
      ]
    });

    const tx = prismaMock.$transaction.mock.calls[0][0];
    const txApi = {
      domain: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 })
      },
      unit: {
        updateMany: vi.fn(),
        deleteMany: vi.fn(),
        update: vi.fn().mockResolvedValue({ id: "stage-1" }),
        create: vi.fn().mockResolvedValue({
          id: "stage-1",
          domainId: "d1",
          title: "阶段 1",
          goal: null,
          orderIndex: 0,
          status: "available"
        })
      },
      learningNode: {
        deleteMany: vi.fn(),
        update: vi.fn().mockResolvedValue({ id: "item-1" }),
        create: vi.fn().mockResolvedValue({
          id: "item-1",
          domainId: "d1",
          unitId: "stage-1",
          moduleTitle: "模块 1",
          moduleOrderIndex: 0,
          title: "derive",
          status: "locked"
        })
      },
      learningNodeDependency: {
        create: vi.fn(),
        deleteMany: vi.fn()
      }
    };
    await tx(txApi);
    expect(txApi.domain.updateMany).toHaveBeenCalledWith({
      where: { id: "d1", mapRevision: 0 },
      data: {
        roadmapTitle: "English 学习路线图",
        roadmapStatus: "draft",
        roadmapDraftJson: null,
        roadmapDraftCourseDesignAiCallLogId: null,
        mapRevision: { increment: 1 }
      }
    });
    expect(txApi.unit.updateMany).toHaveBeenCalledWith({
      where: { domainId: "d1" },
      data: { orderIndex: { increment: 1000000 } }
    });
    expect(txApi.learningNode.deleteMany).not.toHaveBeenCalled();
    expect(txApi.unit.deleteMany).not.toHaveBeenCalled();
    expect(txApi.unit.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "stage-1" },
        data: expect.objectContaining({
          title: "阶段 1",
          status: "expanded"
        })
      })
    );
    expect(txApi.learningNode.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "item-1" },
        data: expect.objectContaining({
          unitId: "stage-1",
          moduleTitle: "模块 1",
          title: "derive",
          keyQuestion: "what changes?"
        })
      })
    );
  });

  it("stores a validated map draft without changing the formal map revision", async () => {
    prismaMock.domain.findUnique.mockResolvedValue({
      id: "d1",
      mapRevision: 3,
      taskBriefConfirmedAt: new Date(),
      courseDesignStatus: "draft",
      courseDesignAiCallLogId: "course-log-1"
    });
    prismaMock.domain.updateMany.mockResolvedValue({ count: 1 });

    const result = await saveRoadmapDraft(
      "d1",
      {
        baseRevision: 3,
        title: "English map",
        stages: [
          {
            key: "foundation",
            title: "Foundation",
            status: "planned",
            moduleDirections: ["concepts"]
          }
        ]
      },
      "course-log-1"
    );

    expect(prismaMock.domain.updateMany).toHaveBeenCalledWith({
      where: {
        id: "d1",
        mapRevision: 3,
        taskBriefConfirmedAt: { not: null },
        courseDesignStatus: "draft",
        courseDesignAiCallLogId: "course-log-1"
      },
      data: {
        roadmapDraftJson: expect.stringContaining('"key":"foundation"'),
        roadmapDraftCourseDesignAiCallLogId: "course-log-1",
        roadmapStatus: "draft"
      }
    });
    expect(result.mapRevision).toBe(3);
    expect(result.draft.stages[0]).toEqual(
      expect.objectContaining({ key: "foundation", status: "planned" })
    );
  });

  it("binds a long-running AI draft write to the exact persisted draft it reviewed", async () => {
    const persistedDraft = {
      baseRevision: 3,
      title: "English map",
      stages: [
        {
          key: "foundation",
          title: "Foundation before review",
          status: "planned" as const,
          moduleDirections: ["concepts"]
        }
      ]
    };
    prismaMock.domain.findUnique.mockResolvedValue({
      id: "d1",
      mapRevision: 3,
      taskBriefConfirmedAt: new Date(),
      courseDesignStatus: "draft",
      courseDesignAiCallLogId: "course-log-1",
      roadmapDraftJson: JSON.stringify(persistedDraft)
    });

    await saveRoadmapDraft(
      "d1",
      {
        ...persistedDraft,
        stages: [
          {
            ...persistedDraft.stages[0],
            title: "Foundation after AI review"
          }
        ]
      },
      "course-log-1",
      { expectedCurrentDraft: persistedDraft }
    );

    expect(prismaMock.domain.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          roadmapDraftJson: JSON.stringify(persistedDraft)
        })
      })
    );
  });

  it("confirms course design fields and audit records inside the map transaction", async () => {
    prismaMock.domain.findUnique.mockResolvedValue({
      id: "d1",
      name: "English",
      roadmapTitle: "English map",
      roadmapStatus: "confirmed",
      roadmapDraftJson: null,
      mapRevision: 0
    });
    prismaMock.unit.findMany.mockResolvedValue([]);
    prismaMock.learningNode.findMany.mockResolvedValue([]);

    await replaceRoadmap(
      "d1",
      {
        stages: [],
        status: "confirmed",
        confirmationReason: "Combined review confirmed."
      },
      {
        courseDesignDraftJson: '{"qualityGate":{"passed":true}}',
        expectedCourseDesignAiCallLogId: "course-log-1",
        expectedCourseDesignStatus: "draft",
        expectedRoadmapDraftJson: '{"stages":[]}'
      }
    );

    expect(prismaMock.domain.updateMany).toHaveBeenCalledWith({
      where: {
        id: "d1",
        mapRevision: 0,
        taskBriefConfirmedAt: { not: null },
        courseDesignStatus: "draft",
        courseDesignAiCallLogId: "course-log-1",
        roadmapStatus: "draft",
        roadmapDraftJson: '{"stages":[]}',
        roadmapDraftCourseDesignAiCallLogId: "course-log-1"
      },
      data: expect.objectContaining({
        roadmapStatus: "confirmed",
        roadmapDraftCourseDesignAiCallLogId: null,
        mapRevision: { increment: 1 },
        courseDesignDraft: '{"qualityGate":{"passed":true}}',
        courseDesignStatus: "confirmed",
        courseDesignConfirmedAt: expect.any(Date)
      })
    });
    expect(prismaMock.aiCallLog.create).toHaveBeenCalledTimes(2);
  });

  it("rejects saving a draft based on a stale formal map revision", async () => {
    prismaMock.domain.findUnique.mockResolvedValue({
      id: "d1",
      mapRevision: 4,
      taskBriefConfirmedAt: new Date(),
      courseDesignStatus: "draft",
      courseDesignAiCallLogId: "course-log-1"
    });

    await expect(
      saveRoadmapDraft(
        "d1",
        { baseRevision: 3, stages: [] },
        "course-log-1"
      )
    ).rejects.toThrow("地图已更新");

    expect(prismaMock.domain.updateMany).not.toHaveBeenCalled();
  });

  it("rejects formal reconciliation based on a stale revision", async () => {
    prismaMock.domain.findUnique.mockResolvedValue({
      id: "d1",
      name: "English",
      mapRevision: 5
    });

    await expect(
      replaceRoadmap("d1", { baseRevision: 4, stages: [] })
    ).rejects.toThrow("地图已更新");

    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("does not delete a node that already has learning evidence", async () => {
    prismaMock.domain.findUnique.mockResolvedValue({
      id: "d1",
      name: "English",
      mapRevision: 2
    });
    prismaMock.unit.findMany.mockResolvedValue([]);
    prismaMock.learningNode.findMany.mockResolvedValue([
      {
        id: "learned-node",
        mapKey: "learned-node",
        status: "completed",
        knowledgePointId: "kp-1",
        unitId: "stage-1"
      }
    ]);

    await expect(
      replaceRoadmap("d1", { baseRevision: 2, stages: [] })
    ).rejects.toThrow("不能从首版地图删除");
  });

  it("saves roadmap item learning into knowledge point and learning node", async () => {
    prismaMock.learningNode.findUnique.mockResolvedValue({
      id: "item-1",
      domainId: "d1",
      title: "derive",
      keyQuestion: "what changes?",
      objective: "track transformation",
      nodeType: "knowledge",
      status: "locked",
      knowledgePoint: {
        id: "word-1",
        domainId: "d1",
        title: "derive",
        language: "und",
        sentenceSample: "what changes?",
        coreEssence: null,
        userUnderstanding: null,
        masteryStatus: "not_started",
        isIsland: false,
        islandReason: null,
        lastReviewedAt: null,
        nextReviewAt: null,
        reviewIntervalDays: 7
      }
    });
    prismaMock.$transaction.mockImplementation(async (callback) =>
      callback({
        knowledgePoint: {
          update: vi.fn().mockResolvedValue({
            id: "word-1",
            domainId: "d1",
            title: "derive",
            language: "und",
            sentenceSample: "what changes?",
            coreEssence: "core",
            userUnderstanding: "my understanding",
            masteryStatus: "island",
            isIsland: true,
            islandReason: "isolated",
            lastReviewedAt: new Date("2026-06-25T00:00:00.000Z"),
            nextReviewAt: new Date("2026-06-30T00:00:00.000Z"),
            reviewIntervalDays: 5
          })
        },
        learningNode: {
          update: vi.fn().mockResolvedValue({ id: "item-1" })
        },
        knowledgeGraphNode: {
          upsert: vi.fn()
        }
      })
    );

    const result = await saveRoadmapItemLearning("item-1", {
      userUnderstanding: "  my understanding ",
      coreEssence: "  core ",
      isIsland: true,
      islandReason: "  isolated "
    });

    const tx = prismaMock.$transaction.mock.calls[0][0];
    const txApi = {
      knowledgePoint: {
        update: vi.fn().mockResolvedValue({
          id: "word-1",
          domainId: "d1",
          title: "derive",
          language: "und",
          sentenceSample: "what changes?",
          coreEssence: "core",
          userUnderstanding: "my understanding",
          masteryStatus: "island",
          isIsland: true,
          islandReason: "isolated",
          lastReviewedAt: new Date("2026-06-25T00:00:00.000Z"),
          nextReviewAt: new Date("2026-06-30T00:00:00.000Z"),
          reviewIntervalDays: 5
        })
      },
      learningNode: {
        update: vi.fn().mockResolvedValue({ id: "item-1" })
      },
      knowledgeGraphNode: {
        upsert: vi.fn()
      }
    };
    await tx(txApi);

    expect(txApi.knowledgePoint.update).toHaveBeenCalledWith({
      where: { id: "word-1" },
      data: expect.objectContaining({
        title: "derive",
        sentenceSample: "what changes?",
        coreEssence: "core",
        userUnderstanding: "my understanding",
        masteryStatus: "island",
        isIsland: true,
        islandReason: "isolated",
        lastReviewedAt: expect.any(Date),
        nextReviewAt: expect.any(Date),
        reviewIntervalDays: 5
      })
    });
    expect(txApi.learningNode.update).toHaveBeenCalledWith({
      where: { id: "item-1" },
      data: {
        status: "completed",
        knowledgePointId: "word-1"
      }
    });
    expect(txApi.knowledgeGraphNode.upsert).toHaveBeenCalledWith({
      where: { id: "word-1" },
      create: expect.objectContaining({
        id: "word-1",
        domainId: "d1"
      }),
      update: expect.objectContaining({
        title: "derive",
        status: "island"
      })
    });
    expect(result.word.id).toBe("word-1");
  });

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

  it("applies stage assessment and records roadmap status", async () => {
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
        goal: "Apply knowledge",
        orderIndex: 0,
        status: "available",
        assessmentRecords: []
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
        status: "completed",
        objective: null,
        keyQuestion: null,
        prerequisite: null,
        commonMistake: null,
        transferPrompt: null,
        orderIndex: 0,
        knowledgePoint: {
          masteryStatus: "can_apply",
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
      }
    ]);
    const updateRoadmapStatus = vi.fn().mockResolvedValue({
      id: "roadmap-1",
      roadmapTitle: "Roadmap",
      roadmapStatus: "confirmed"
    });
    const createAssessmentRecord = vi.fn().mockResolvedValue({ id: "record-1" });
    prismaMock.$transaction.mockImplementation(async (arg: any) =>
      Array.isArray(arg)
        ? Promise.all(arg)
        : arg({
            domain: {
              update: updateRoadmapStatus
            },
            unitAssessmentRecord: {
              create: createAssessmentRecord
            }
          })
    );

    const result = await applyStageAssessment("d1", "stage-1");

    expect(result.roadmap.status).toBe("confirmed");
    expect(result.stage.readiness).toBe("completed");

    expect(updateRoadmapStatus).toHaveBeenCalledWith({
      where: { id: "d1" },
      data: { roadmapStatus: "confirmed" }
    });
    expect(createAssessmentRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          unitId: "stage-1",
          readiness: "completed",
          appliedRoadmapStatus: "confirmed"
        })
      })
    );
  });
});
