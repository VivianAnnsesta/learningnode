import { describe, expect, it } from "vitest";
import {
  checkLayeredRoadmapSkeleton,
  checkLayeredStageCoverage,
  checkLayeredStageContentRisk,
  MIN_EXPANDED_STAGE_NODES,
  THIN_EXPANSION_RATIO
} from "./roadmapPlanningQuality";

const layeredStage = {
  key: "limits",
  title: "极限与连续",
  goal: "建立极限与连续的可检验基础",
  coreTopics: ["极限", "连续"],
  prerequisiteStageTitles: [],
  prerequisiteStageKeys: [],
  moduleBlueprints: [
    {
      key: "limit-foundations",
      title: "极限基础",
      goal: "解释极限并判断其存在性",
      keyQuestions: [
        {
          key: "limit-meaning",
          question: "极限的严格定义表达了什么？",
          checkableOutcome: "能用量词关系解释一个极限定义"
        },
        {
          key: "limit-existence",
          question: "怎样判断一个极限是否存在？",
          checkableOutcome: "能用左右极限或反例判断存在性"
        }
      ]
    }
  ]
};

describe("layered roadmap planning quality", () => {
  it("accepts one atomic key question without enforcing a count quota", () => {
    const result = checkLayeredRoadmapSkeleton({
      title: "高数路线",
      status: "draft" as const,
      planningVersion: 2 as const,
      stages: [
        {
          ...layeredStage,
          moduleBlueprints: [
            {
              ...layeredStage.moduleBlueprints[0],
              keyQuestions: [layeredStage.moduleBlueprints[0].keyQuestions[0]]
            }
          ]
        }
      ]
    });

    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("rejects blank stable keys and titles in the layered blueprint", () => {
    const result = checkLayeredRoadmapSkeleton({
      title: "高数路线",
      status: "draft",
      planningVersion: 2,
      stages: [
        {
          ...layeredStage,
          moduleBlueprints: [
            {
              key: "",
              title: "",
              goal: "目标",
              keyQuestions: [
                {
                  key: "",
                  question: "问题是什么？",
                  checkableOutcome: "能回答"
                }
              ]
            }
          ]
        }
      ]
    });

    expect(result.errors.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "missingModuleKey",
        "missingModuleTitle",
        "missingQuestionKey"
      ])
    );
  });

  it("surfaces overloaded key questions as review risks instead of counting them as complete", () => {
    const result = checkLayeredRoadmapSkeleton({
      title: "高数路线",
      status: "draft" as const,
      planningVersion: 2 as const,
      stages: [
        {
          ...layeredStage,
          moduleBlueprints: [
            {
              ...layeredStage.moduleBlueprints[0],
              keyQuestions: [
                {
                  key: "overloaded",
                  question:
                    "极限的严格定义是什么？它与直观描述有何区别？计算时如何选择洛必达、等价无穷小或泰勒展开？",
                  checkableOutcome: "能解释、比较并选择全部极限工具"
                }
              ]
            }
          ]
        }
      ]
    });

    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "compoundKeyQuestion",
          questionKey: "overloaded"
        })
      ])
    );
    expect(result.needsAiReview).toBe(true);
  });

  it("rejects missing, unknown and multiply-mapped planning coverage", () => {
    const result = checkLayeredStageCoverage(layeredStage, {
      key: "limits",
      title: "极限与连续",
      goal: "建立基础",
      status: "expanded" as const,
      rationale: "按蓝图展开",
      moduleDirections: ["极限基础"],
      prerequisiteStageKeys: [],
      modules: [
        {
          title: "极限基础",
          goal: "解释极限",
          items: [
            {
              key: "node-1",
              title: "极限定义",
              keyQuestion: "严格定义表达了什么？",
              objective: "解释定义",
              prerequisiteKeys: [],
              planningQuestionKey: "limit-meaning"
            },
            {
              key: "node-2",
              title: "孤立节点",
              keyQuestion: "这个问题来自哪里？",
              objective: "识别来源",
              prerequisiteKeys: [],
              planningQuestionKey: "not-in-blueprint"
            },
            {
              key: "node-3",
              title: "无覆盖节点",
              keyQuestion: "如何检查？",
              objective: "检查",
              prerequisiteKeys: [],
              planningQuestionKey: null
            }
          ]
        }
      ]
    });

    expect(result.errors.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        "uncoveredPlanningQuestion",
        "unknownPlanningQuestion",
        "missingPlanningQuestion"
      ])
    );
    expect(result.coverage).toEqual({
      total: 2,
      covered: 1,
      uncoveredQuestionKeys: ["limit-existence"]
    });
  });

  it("requires AI review only when generated Stage content shows semantic risk", () => {
    const safe = checkLayeredStageContentRisk({
      key: "limits",
      title: "极限",
      modules: [
        {
          title: "定义",
          items: [
            {
              key: "limit-meaning-node",
              keyQuestion: "极限表达了什么？"
            }
          ]
        }
      ]
    });
    const risky = checkLayeredStageContentRisk({
      key: "limits",
      title: "极限",
      modules: [
        {
          title: "定义与计算",
          items: [
            {
              key: "overloaded-node",
              keyQuestion:
                "极限的定义是什么？它与连续有什么关系？同时如何选择洛必达法则、等价无穷小以及泰勒展开？"
            }
          ]
        }
      ]
    });

    expect(safe.needsAiReview).toBe(false);
    expect(risky.needsAiReview).toBe(true);
    expect(risky.warnings[0]).toEqual(
      expect.objectContaining({ code: "compoundLearningQuestion" })
    );
  });

  it("flags a single-question Module with a multi-ability goal as thin without blocking", () => {
    const result = checkLayeredRoadmapSkeleton({
      title: "高数路线",
      status: "draft" as const,
      planningVersion: 2 as const,
      stages: [
        {
          ...layeredStage,
          moduleBlueprints: [
            {
              key: "limit-foundations",
              title: "极限基础",
              goal: "解释极限的定义，并会计算常见极限以及判断存在性",
              keyQuestions: [
                {
                  key: "limit-meaning",
                  question: "极限的严格定义表达了什么？",
                  checkableOutcome: "能用量词关系解释一个极限定义"
                }
              ]
            }
          ]
        }
      ]
    });

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "thinModuleBlueprint",
          severity: "warning",
          moduleKey: "limit-foundations"
        })
      ])
    );
    expect(result.needsAiReview).toBe(true);
  });

  it("does not flag an atomic single-question Module blueprint", () => {
    const result = checkLayeredRoadmapSkeleton({
      title: "高数路线",
      status: "draft" as const,
      planningVersion: 2 as const,
      stages: [
        {
          ...layeredStage,
          moduleBlueprints: [
            {
              key: "limit-definition",
              title: "极限定义",
              goal: "理解极限的严格定义",
              keyQuestions: [
                {
                  key: "limit-meaning",
                  question: "极限的严格定义表达了什么？",
                  checkableOutcome: "能用量词关系解释一个极限定义"
                }
              ]
            }
          ]
        }
      ]
    });

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(
      result.warnings.filter((issue) => issue.code === "thinModuleBlueprint")
    ).toEqual([]);
    expect(result.needsAiReview).toBe(false);
  });

  it("flags a thin Stage expansion against its blueprint as a warning only", () => {
    const result = checkLayeredStageContentRisk(
      {
        key: "limits",
        title: "极限",
        modules: [
          {
            title: "定义与存在性",
            items: [
              { key: "node-1", keyQuestion: "极限表达了什么？" },
              { key: "node-2", keyQuestion: "怎样判断极限存在？" }
            ]
          }
        ]
      },
      layeredStage
    );

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "thinStageExpansion",
          severity: "warning",
          stageKey: "limits"
        })
      ])
    );
    expect(result.needsAiReview).toBe(true);
  });

  it("does not flag a sufficiently dense Stage expansion", () => {
    const nodeCount = Math.max(
      MIN_EXPANDED_STAGE_NODES,
      Math.ceil(2 * THIN_EXPANSION_RATIO)
    );
    const result = checkLayeredStageContentRisk(
      {
        key: "limits",
        title: "极限",
        modules: [
          {
            title: "定义与存在性",
            items: Array.from({ length: nodeCount }, (_, index) => ({
              key: `node-${index + 1}`,
              keyQuestion:
                index % 2 === 0
                  ? "极限表达了什么？"
                  : "怎样判断极限存在？"
            }))
          }
        ]
      },
      layeredStage
    );

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(
      result.warnings.filter((issue) => issue.code === "thinStageExpansion")
    ).toEqual([]);
    expect(result.needsAiReview).toBe(false);
  });
});
