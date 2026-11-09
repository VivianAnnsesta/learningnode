import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  calculateLearningProgress,
  assertLearningNodeInDomain,
  completeLearningNode,
  confirmDomainMap,
  getDomainMap,
  normalizeLearningNodeStatus
} from "./domainMapService";
import { canonicalMapDraftDigest } from "./mapDraftReviewService";

const prismaMock = vi.hoisted(() => ({
  domain: {
    findUnique: vi.fn(),
    findMany: vi.fn()
  },
  unit: {
    findMany: vi.fn()
  },
  learningNode: {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn()
  },
  aiCallLog: {
    create: vi.fn()
  },
  mapDraftQualityReview: {
    findFirst: vi.fn()
  },
  learningRoadmap: {
    findFirst: vi.fn(),
    update: vi.fn()
  },
  roadmapItem: {
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn()
  },
  $transaction: vi.fn()
}));

const roadmapServiceMock = vi.hoisted(() => ({
  getRoadmapByDomain: vi.fn(),
  replaceRoadmap: vi.fn(),
  saveLearningNodeProgress: vi.fn()
}));

const courseDesignServiceMock = vi.hoisted(() => ({
  getConfirmedCourseDesign: vi.fn(),
  getCourseDesignState: vi.fn()
}));

const persistedRoadmapDraft = {
  planningVersion: 2 as const,
  title: "Persisted map",
  status: "draft",
  baseRevision: 0,
  stages: [
    {
      key: "stage-1",
      title: "Stage 1",
      status: "planned" as const,
      moduleBlueprints: [
        {
          key: "module-1",
          title: "Foundation",
          goal: "Build foundations",
          keyQuestions: [
            {
              key: "question-1",
              question: "What is the foundation?",
              checkableOutcome: "Explain it with one example."
            }
          ]
        }
      ],
      modules: []
    }
  ]
};

vi.mock("../prisma", () => ({
  prisma: prismaMock
}));

vi.mock("./roadmapService", () => roadmapServiceMock);
vi.mock("./courseDesignService", () => courseDesignServiceMock);

const domain = {
  id: "domain-1",
  name: "Algebra",
  description: null,
  currentLevel: "beginner",
  goal: "Solve equations",
  scope: null,
  excludedScope: null,
  depth: null,
  outputType: null,
  outputTarget: null,
  taskBrief: "brief",
  taskBriefConfirmedAt: new Date("2026-07-19T04:00:00.000Z"),
  roadmapDraftJson: JSON.stringify(persistedRoadmapDraft),
  roadmapDraftCourseDesignAiCallLogId: "course-log-1",
  mapRevision: 0,
  courseDesignStatus: "draft",
  status: "active"
};

const unit = {
  id: "unit-1",
  domainId: "domain-1",
  title: "Basics",
  goal: "Build foundations",
  orderIndex: 0,
  status: "available"
};

const learningNode = (
  id: string,
  title: string,
  status: string,
  orderIndex: number,
  overrides: Partial<{
    nodeType: string;
    dependencies: Array<{ prerequisiteId: string }>;
    knowledgePointId: string | null;
    knowledgePoint: { id: string } | null;
  }> = {}
) => ({
  id,
  domainId: "domain-1",
  unitId: "unit-1",
  moduleTitle: "Core",
  moduleOrderIndex: 0,
  title,
  nodeType: overrides.nodeType || "knowledge",
  status,
  objective: null,
  keyQuestion: `${title}?`,
  prerequisite: null,
  commonMistake: null,
  transferPrompt: null,
  orderIndex,
  knowledgePointId: overrides.knowledgePointId ?? null,
  knowledgePoint: overrides.knowledgePoint ?? null,
  dependencies: overrides.dependencies || []
});

describe("domainMapService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(async (callback: any) =>
      callback(prismaMock)
    );
    prismaMock.domain.findUnique.mockResolvedValue(domain);
    prismaMock.learningRoadmap.findFirst.mockResolvedValue({
      id: "roadmap-1",
      title: "Algebra map",
      status: "confirmed"
    });
    prismaMock.unit.findMany.mockResolvedValue([unit]);
    prismaMock.learningNode.findMany.mockResolvedValue([]);
    roadmapServiceMock.getRoadmapByDomain.mockResolvedValue(null);
    courseDesignServiceMock.getConfirmedCourseDesign.mockResolvedValue({
      qualityGate: { passed: true, missing: [] }
    });
    courseDesignServiceMock.getCourseDesignState.mockResolvedValue({
      draft: { qualityGate: { passed: true } },
      status: "confirmed",
      aiCallLogId: "course-log-1"
    });
    prismaMock.mapDraftQualityReview.findFirst.mockResolvedValue({
      id: "review-1",
      scope: "skeleton",
      stageKey: null,
      status: "passed",
      draftHash: canonicalMapDraftDigest(persistedRoadmapDraft),
      baseRevision: 0,
      courseDesignAiCallLogId: "course-log-1",
      reportJson: JSON.stringify({
        status: "passed",
        summary: "Ready",
        blockingIssues: [],
        warnings: []
      }),
      aiCallLogIdsJson: "[]",
      createdAt: new Date("2026-08-09T00:00:00.000Z")
    });
  });

  it("normalizes legacy roadmap statuses into PRD node statuses", () => {
    expect(normalizeLearningNodeStatus("not_started")).toBe("available");
    expect(normalizeLearningNodeStatus("seen")).toBe("available");
    expect(normalizeLearningNodeStatus("can_apply")).toBe("available");
    expect(normalizeLearningNodeStatus("integrated")).toBe("available");
    expect(normalizeLearningNodeStatus("island")).toBe("available");
    expect(normalizeLearningNodeStatus("suggested")).toBe("available");
  });

  it("calculates learning progress from PRD statuses", () => {
    expect(
      calculateLearningProgress([
        { status: "completed" },
        { status: "in_progress" },
        { status: "available" },
        { status: "available" }
      ])
    ).toEqual({
      totalNodes: 4,
      completedNodes: 1,
      masteredNodes: 0,
      needsReviewNodes: 0,
      percent: 25
    });
  });

  it("keeps several visible nodes without choosing a mandatory route", async () => {
    prismaMock.learningNode.findMany.mockResolvedValue([
      learningNode("node-1", "Started", "in_progress", 0),
      learningNode("node-2", "Review", "needs_review", 1, {
        dependencies: [{ prerequisiteId: "node-1" }]
      }),
      learningNode("node-3", "Next", "locked", 2, {
        dependencies: [{ prerequisiteId: "node-2" }]
      })
    ]);

    const map = await getDomainMap("domain-1");

    expect(map.nodes.find((node) => node.id === "node-1")?.status).toBe(
      "in_progress"
    );
  });

  // Superseded contract: keeps review state visible without turning it into a mandatory route.
// Current equivalents use real SQLite in learningSessionService/roadmapLifecycle tests,
// and current provider contracts in coursePlanningCurrent; original test retained in before/retired.


  it("warns about unmet prerequisites without locking visible nodes", async () => {
    prismaMock.learningNode.findMany.mockResolvedValue([
      learningNode("node-1", "Done", "completed", 0),
      learningNode("node-2", "Next", "locked", 1, {
        dependencies: [{ prerequisiteId: "node-1" }]
      }),
      learningNode("node-3", "Locked", "locked", 2, {
        dependencies: [{ prerequisiteId: "node-2" }]
      })
    ]);

    const map = await getDomainMap("domain-1");

    expect(map.nodes.find((node) => node.id === "node-2")?.status).toBe(
      "available"
    );
    expect(
      map.nodes.find((node) => node.id === "node-2")?.unmetDependencyIds
    ).toEqual([]);
    expect(map.nodes.find((node) => node.id === "node-3")?.status).toBe(
      "available"
    );
    expect(
      map.nodes.find((node) => node.id === "node-3")?.unmetDependencyIds
    ).toEqual(["node-2"]);
  });

  it("treats an island-backed node as completed when the learning node is already complete", async () => {
    prismaMock.learningNode.findMany.mockResolvedValue([
      learningNode("node-1", "Island", "completed", 0, {
        knowledgePointId: "kp-1",
        knowledgePoint: { id: "kp-1" }
      }),
      learningNode("node-2", "Next", "locked", 1, {
        dependencies: [{ prerequisiteId: "node-1" }]
      })
    ]);

    const map = await getDomainMap("domain-1");

    expect(map.nodes.find((node) => node.id === "node-1")?.status).toBe(
      "completed"
    );
    expect(map.nodes.find((node) => node.id === "node-2")?.status).toBe(
      "available"
    );
  });

  it("returns an empty node projection when no learning nodes exist", async () => {
    prismaMock.unit.findMany.mockResolvedValue([]);

    const map = await getDomainMap("domain-1");

    expect(map.nodes).toHaveLength(0);
    expect(map.units).toHaveLength(0);
  });

  // Superseded contract: requires the user's own understanding before knowledge is materialized.
// Current equivalents use real SQLite in learningSessionService/roadmapLifecycle tests,
// and current provider contracts in coursePlanningCurrent; original test retained in before/retired.


  it("checks node ownership against both the URL domain and node id", async () => {
    prismaMock.learningNode.findFirst.mockResolvedValue(null);

    await expect(
      assertLearningNodeInDomain("domain-1", "foreign-node")
    ).rejects.toThrow("不属于该领域");
    expect(prismaMock.learningNode.findFirst).toHaveBeenCalledWith({
      where: { id: "foreign-node", domainId: "domain-1" },
      select: { id: true }
    });
  });

  // Superseded contract: stores first-pass knowledge as seen while completing the learning task.
// Current equivalents use real SQLite in learningSessionService/roadmapLifecycle tests,
// and current provider contracts in coursePlanningCurrent; original test retained in before/retired.


  // Superseded contract: rejects map confirmation before the task brief is saved.
// Current equivalents use real SQLite in learningSessionService/roadmapLifecycle tests,
// and current provider contracts in coursePlanningCurrent; original test retained in before/retired.


  // Superseded contract: rejects map confirmation when task brief confirmation was invalidated.
// Current equivalents use real SQLite in learningSessionService/roadmapLifecycle tests,
// and current provider contracts in coursePlanningCurrent; original test retained in before/retired.


  // Superseded contract: rejects map confirmation without a user confirmation reason.
// Current equivalents use real SQLite in learningSessionService/roadmapLifecycle tests,
// and current provider contracts in coursePlanningCurrent; original test retained in before/retired.


  // Superseded contract: confirms a map only after task brief confirmation evidence is present.
// Current equivalents use real SQLite in learningSessionService/roadmapLifecycle tests,
// and current provider contracts in coursePlanningCurrent; original test retained in before/retired.


  it("rejects a v2 map when its server-bound quality review is missing", async () => {
    prismaMock.mapDraftQualityReview.findFirst.mockResolvedValue(null);

    await expect(
      confirmDomainMap(
        "domain-1",
        persistedRoadmapDraft,
        "User confirmed the task brief and map."
      )
    ).rejects.toThrow("MAP_REVIEW_STALE");

    expect(roadmapServiceMock.replaceRoadmap).not.toHaveBeenCalled();
  });

  it("rejects a legacy initial draft that has not passed the layered review", async () => {
    prismaMock.domain.findUnique.mockResolvedValue({
      ...domain,
      roadmapDraftJson: JSON.stringify({
        title: "Legacy map",
        status: "draft",
        baseRevision: 0,
        stages: [{ key: "legacy", title: "Legacy", status: "planned" }]
      })
    });

    await expect(
      confirmDomainMap("domain-1", persistedRoadmapDraft, "User confirmed.")
    ).rejects.toThrow("MAP_REVIEW_STALE");

    expect(roadmapServiceMock.replaceRoadmap).not.toHaveBeenCalled();
  });

  // Superseded contract: passes an edited course design into the same formal map transaction.
// Current equivalents use real SQLite in learningSessionService/roadmapLifecycle tests,
// and current provider contracts in coursePlanningCurrent; original test retained in before/retired.


  it("rejects a combined map confirmation when the persisted course design needs review", async () => {
    courseDesignServiceMock.getCourseDesignState.mockResolvedValue({
      draft: { qualityGate: { passed: true } },
      status: "needs_review",
      aiCallLogId: "course-log-1"
    });

    await expect(
      confirmDomainMap(
        "domain-1",
        {
          title: "Map",
          stages: [{ key: "stage-1", title: "Stage 1", status: "planned" }]
        },
        "User confirmed the combined review.",
        { qualityGate: { passed: true } } as Parameters<
          typeof confirmDomainMap
        >[3]
      )
    ).rejects.toThrow("课程设计方向已失效");

    expect(roadmapServiceMock.replaceRoadmap).not.toHaveBeenCalled();
  });

  it("rejects map confirmation before course design direction is confirmed", async () => {
    courseDesignServiceMock.getCourseDesignState.mockResolvedValue({
      draft: { qualityGate: { passed: true } },
      status: "draft",
      aiCallLogId: "course-log-1"
    });

    await expect(
      confirmDomainMap(
        "domain-1",
        { title: "Map", stages: [] },
        "User confirmed the map."
      )
    ).rejects.toThrow("课程设计方向已失效");

    expect(roadmapServiceMock.replaceRoadmap).not.toHaveBeenCalled();
  });

  it("rejects confirmation without a complete Stage skeleton", async () => {
    prismaMock.domain.findUnique.mockResolvedValue({
      ...domain,
      roadmapDraftJson: JSON.stringify({
        ...persistedRoadmapDraft,
        stages: []
      })
    });
    await expect(
      confirmDomainMap(
        "domain-1",
        { title: "Empty map", stages: [] },
        "User confirmed."
      )
    ).rejects.toThrow("完整 Stage 骨架");
    expect(roadmapServiceMock.replaceRoadmap).not.toHaveBeenCalled();
  });

  it("rejects a map draft bound to an older course design", async () => {
    prismaMock.domain.findUnique.mockResolvedValue({
      ...domain,
      roadmapDraftCourseDesignAiCallLogId: "course-log-old"
    });
    await expect(
      confirmDomainMap(
        "domain-1",
        persistedRoadmapDraft,
        "User confirmed the map."
      )
    ).rejects.toThrow("领域地图草稿已失效");

    expect(roadmapServiceMock.replaceRoadmap).not.toHaveBeenCalled();
  });
});
