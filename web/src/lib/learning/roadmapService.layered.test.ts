import { describe, expect, it } from "vitest";
import {
  mergeRoadmapStageDraft,
  roadmapDraftToSkeleton,
  validateRoadmapInput
} from "./roadmapService";

const moduleBlueprints = [
  {
    key: "limit-foundations",
    title: "极限基础",
    goal: "理解极限",
    keyQuestions: [
      {
        key: "limit-meaning",
        question: "极限表达了什么？",
        checkableOutcome: "能解释定义"
      }
    ]
  }
];

const baseStage = {
  key: "limits",
  title: "极限",
  goal: "理解极限",
  rationale: "按蓝图规划",
  moduleDirections: ["极限基础"],
  moduleBlueprints,
  prerequisiteStageKeys: []
};

describe("roadmapService layered draft validation", () => {
  it("keeps a v2 planned Stage without materializing Learning Nodes", () => {
    const result = validateRoadmapInput({
      planningVersion: 2,
      title: "高数路线",
      stages: [{ ...baseStage, status: "planned", modules: [] }]
    });

    expect(result.planningVersion).toBe(2);
    expect(result.stages[0].moduleBlueprints).toEqual(moduleBlueprints);
    expect(result.stages[0].modules).toEqual([]);
  });

  it("rejects an expanded v2 Stage that does not cover its planned question", () => {
    expect(() =>
      validateRoadmapInput({
        planningVersion: 2,
        title: "高数路线",
        stages: [
          {
            ...baseStage,
            status: "expanded",
            modules: [
              {
                title: "极限基础",
                items: [
                  {
                    key: "node-1",
                    title: "极限定义",
                    keyQuestion: "极限表达了什么？",
                    objective: "能解释极限定义",
                    planningQuestionKey: null,
                    prerequisiteKeys: []
                  }
                ]
              }
            ]
          }
        ]
      })
    ).toThrow("没有规划问题归属");
  });

  it("rejects an expanded v2 Learning Node without a checkable outcome", () => {
    expect(() =>
      validateRoadmapInput({
        planningVersion: 2,
        title: "高数路线",
        stages: [
          {
            ...baseStage,
            status: "expanded",
            modules: [
              {
                title: "极限基础",
                items: [
                  {
                    key: "node-1",
                    title: "极限定义",
                    keyQuestion: "极限表达了什么？",
                    objective: "   ",
                    planningQuestionKey: "limit-meaning",
                    prerequisiteKeys: []
                  }
                ]
              }
            ]
          }
        ]
      })
    ).toThrow("缺少可检查结果");
  });

  it("accepts exact v2 coverage and preserves its planning key", () => {
    const result = validateRoadmapInput({
      planningVersion: 2,
      title: "高数路线",
      stages: [
        {
          ...baseStage,
          status: "expanded",
          modules: [
            {
              title: "极限基础",
              items: [
                {
                  key: "node-1",
                  title: "极限定义",
                  keyQuestion: "极限表达了什么？",
                  objective: "能解释极限定义",
                  planningQuestionKey: "limit-meaning",
                  prerequisiteKeys: []
                }
              ]
            }
          ]
        }
      ]
    });

    expect(result.stages[0].modules[0].items[0].planningQuestionKey).toBe(
      "limit-meaning"
    );
  });

  it("continues to read legacy drafts without planning fields", () => {
    expect(() =>
      validateRoadmapInput({
        title: "旧路线",
        stages: [
          {
            key: "legacy-stage",
            title: "旧阶段",
            status: "planned",
            moduleDirections: ["旧方向"],
            prerequisiteStageKeys: [],
            modules: []
          }
        ]
      })
    ).not.toThrow();
  });

  it("reconstructs the AI Stage input from the persisted server blueprint", () => {
    const draft = validateRoadmapInput({
      planningVersion: 2,
      title: "高数路线",
      baseRevision: 4,
      stages: [{ ...baseStage, status: "planned", modules: [] }]
    });

    const skeleton = roadmapDraftToSkeleton(draft);

    expect(skeleton.planningVersion).toBe(2);
    expect(skeleton.stages[0].moduleBlueprints).toEqual(moduleBlueprints);
    expect(skeleton.stages[0].coreTopics).toEqual(["极限基础"]);
  });

  it("merges only the requested Stage and preserves its reviewed blueprint", () => {
    const draft = validateRoadmapInput({
      planningVersion: 2,
      title: "高数路线",
      baseRevision: 4,
      stages: [{ ...baseStage, status: "planned", modules: [] }]
    });

    const merged = mergeRoadmapStageDraft(draft, "limits", {
      key: "model-tried-to-change-key",
      title: "极限展开",
      status: "expanded",
      modules: [
        {
          title: "极限基础",
          items: [
            {
              key: "limit-definition",
              title: "极限定义",
              keyQuestion: "极限表达了什么？",
              objective: "能解释极限定义",
              planningQuestionKey: "limit-meaning",
              prerequisiteKeys: []
            }
          ]
        }
      ]
    });

    expect(merged.stages[0]).toEqual(
      expect.objectContaining({
        key: "limits",
        status: "expanded",
        moduleBlueprints
      })
    );
  });
});
