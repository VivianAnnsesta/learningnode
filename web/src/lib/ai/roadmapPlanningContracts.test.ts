import { describe, expect, it } from "vitest";
import {
  AiTaskValidationError,
  buildMapDraftQualityReviewPrompt,
  buildRoadmapSkeletonCritiquePrompt,
  buildRoadmapSkeletonRepairPrompt,
  buildRoadmapSkeletonPrompt,
  buildRoadmapStagePrompt,
  validateRoadmapDraft,
  validateRoadmapStageDraft,
  validateRoadmapSkeletonCritique,
  validateRoadmapSkeletonDraft
} from "./tasks";

const courseDesign = {
  taskBriefSnapshot: "高数任务书",
  globalExplanation: {
    theorySkeleton: "从极限到微积分",
    sourceBasis: "使用已接地课程来源",
    optimizationRationale: "先修正确性优先",
    risksAndValidation: "需要检查极限基础"
  },
  sources: [],
  keyTradeoffs: [],
  qualityGate: { passed: true, missing: [] }
};

const layeredSkeletonValue = {
  planningVersion: 2,
  title: "高数路线",
  status: "draft",
  stages: [
    {
      key: "limits",
      title: "极限与连续",
      goal: "建立微积分基础",
      coreTopics: ["极限", "连续"],
      prerequisiteStageTitles: [],
      prerequisiteStageKeys: [],
      moduleBlueprints: [
        {
          key: "limit-foundations",
          title: "极限基础",
          goal: "解释极限并判断存在性",
          keyQuestions: [
            {
              key: "limit-meaning",
              question: "极限的严格定义表达了什么？",
              checkableOutcome: "能解释量词关系"
            }
          ]
        }
      ]
    }
  ]
};

describe("layered roadmap AI contracts", () => {
  it("asks skeleton generation for Module blueprints without generating Learning Nodes", () => {
    const prompt = buildRoadmapSkeletonPrompt(
      { name: "高等数学", scope: "极限与连续" },
      courseDesign
    );

    expect(prompt).toContain('"planningVersion": 2');
    expect(prompt).toContain('"moduleBlueprints"');
    expect(prompt).toContain('"keyQuestions"');
    expect(prompt).toContain('"checkableOutcome"');
    expect(prompt).toContain("Return no more than 16 Stages");
    expect(prompt).toContain("Do not generate Learning Nodes");
    expect(prompt).toContain("Do not satisfy quality by padding a fixed count");
    expect(prompt).toContain(
      "When a Module goal names several independently checkable abilities"
    );
    expect(prompt).toContain(
      "keep a single question only when the goal is truly atomic"
    );
  });

  it("validates and preserves the versioned Module blueprint", () => {
    const skeleton = validateRoadmapSkeletonDraft(layeredSkeletonValue);

    expect(skeleton.planningVersion).toBe(2);
    expect(skeleton.stages[0].moduleBlueprints?.[0].keyQuestions[0]).toEqual({
      key: "limit-meaning",
      question: "极限的严格定义表达了什么？",
      checkableOutcome: "能解释量词关系"
    });
  });

  it("tolerates an empty legacy modules field but still rejects generated Learning Nodes", () => {
    expect(() =>
      validateRoadmapSkeletonDraft({
        ...layeredSkeletonValue,
        stages: layeredSkeletonValue.stages.map((stage) => ({
          ...stage,
          modules: []
        }))
      })
    ).not.toThrow();

    expect(() =>
      validateRoadmapSkeletonDraft({
        ...layeredSkeletonValue,
        stages: [
          {
            ...layeredSkeletonValue.stages[0],
            modules: [{ title: "不应在骨架出现", items: [] }]
          }
        ]
      })
    ).toThrow("must not include generated modules or items");
  });

  it("rejects a v2 skeleton that has no key questions", () => {
    expect(() =>
      validateRoadmapSkeletonDraft({
        ...layeredSkeletonValue,
        stages: [
          {
            ...layeredSkeletonValue.stages[0],
            moduleBlueprints: [
              {
                ...layeredSkeletonValue.stages[0].moduleBlueprints[0],
                keyQuestions: []
              }
            ]
          }
        ]
      })
    ).toThrow(AiTaskValidationError);
  });

  it("requires Stage nodes to declare the planned question they decompose", () => {
    const skeleton = validateRoadmapSkeletonDraft(layeredSkeletonValue);
    const prompt = buildRoadmapStagePrompt({
      domain: { name: "高等数学" },
      courseDesign,
      skeleton,
      stage: skeleton.stages[0],
      stageIndex: 0
    });

    expect(prompt).toContain('"planningQuestionKey"');
    expect(prompt).toContain("exactly one key question from moduleBlueprints");
    expect(prompt).toContain("checkable outcome in objective");
    expect(prompt).toContain("limit-meaning");
    expect(prompt).toContain(
      "Size the batch to fully decompose every planning question of this Stage"
    );
    expect(prompt).toContain(
      "split them into separate Learning Nodes instead of compressing coverage to shrink the batch"
    );
    expect(prompt).not.toContain("Keep the batch small enough");
  });

  it("rejects generated Stage nodes without a checkable outcome", () => {
    expect(() =>
      validateRoadmapStageDraft({
        key: "limits",
        title: "极限",
        modules: [
          {
            title: "极限基础",
            items: [
              {
                key: "limit-definition",
                title: "极限定义",
                keyQuestion: "极限表达了什么？",
                objective: " ",
                planningQuestionKey: "limit-meaning",
                prerequisiteKeys: []
              }
            ]
          }
        ]
      })
    ).toThrow("checkable outcome");
  });

  it("preserves planning provenance in a v2 Map Draft", () => {
    const draft = validateRoadmapDraft({
      planningVersion: 2,
      title: "高数路线",
      stages: [
        {
          ...layeredSkeletonValue.stages[0],
          status: "expanded",
          rationale: "按蓝图展开",
          moduleDirections: ["极限基础"],
          modules: [
            {
              title: "极限基础",
              goal: "解释极限",
              items: [
                {
                  key: "limit-definition-node",
                  title: "极限定义",
                  keyQuestion: "严格定义表达了什么？",
                  objective: "解释量词关系",
                  planningQuestionKey: "limit-meaning",
                  prerequisiteKeys: [],
                  status: "not_started"
                }
              ]
            }
          ]
        }
      ]
    });

    expect(draft.planningVersion).toBe(2);
    expect(draft.stages?.[0].moduleBlueprints?.[0].key).toBe(
      "limit-foundations"
    );
    expect(draft.stages?.[0].modules?.[0].items?.[0].planningQuestionKey).toBe(
      "limit-meaning"
    );
  });

  it("builds a fresh blueprint review prompt with a blocking rubric", () => {
    const skeleton = validateRoadmapSkeletonDraft(layeredSkeletonValue);
    const prompt = buildRoadmapSkeletonCritiquePrompt({
      domain: { name: "高等数学", goal: "建立考研高数结构" },
      courseDesign,
      skeleton,
      deterministicIssues: skeleton.planningWarnings || []
    });

    expect(prompt).toContain("scopeCoverage");
    expect(prompt).toContain("questionAtomicity");
    expect(prompt).toContain("blockingIssues");
    expect(prompt).toContain("limit-meaning");
    expect(prompt).toContain("Do not use a minimum question count");
    expect(prompt).toContain(
      "Compressing a Module goal that contains independent abilities into too few key questions is a scopeCoverage or questionAtomicity defect"
    );
  });

  it("validates a blueprint review and keeps critical findings separate from warnings", () => {
    const result = validateRoadmapSkeletonCritique({
      report: {
        summary: "极限模块仍把独立方法压在一起。",
        blockingIssues: [
          {
            code: "questionAtomicity",
            targetKey: "limit-meaning",
            message: "关键问题包含多个独立能力。",
            suggestion: "拆分定义、存在性和计算方法。"
          }
        ],
        warnings: [
          {
            code: "optionalEnrichment",
            targetKey: "limits",
            message: "可以补充历史直觉。",
            suggestion: "仅作为可选材料。"
          }
        ]
      },
      draft: layeredSkeletonValue
    });

    expect(result.report.status).toBe("blocked");
    expect(result.report.blockingIssues).toHaveLength(1);
    expect(result.report.warnings).toHaveLength(1);
    expect(result.draft.planningVersion).toBe(2);
  });

  it("rejects a critique or repair that drops the layered planning version", () => {
    const { planningVersion: _planningVersion, ...legacyDraft } =
      layeredSkeletonValue;
    expect(() =>
      validateRoadmapSkeletonCritique({
        report: {
          summary: "声称通过",
          blockingIssues: [],
          warnings: []
        },
        draft: legacyDraft
      })
    ).toThrow("must preserve planningVersion=2");
  });

  it("requires a repair pass to report only defects that remain in its returned draft", () => {
    const skeleton = validateRoadmapSkeletonDraft(layeredSkeletonValue);
    const prompt = buildRoadmapSkeletonRepairPrompt({
      domain: { name: "高等数学" },
      courseDesign,
      skeleton,
      previousReport: {
        status: "blocked",
        summary: "问题过载",
        blockingIssues: [
          {
            code: "questionAtomicity",
            targetKey: "limit-meaning",
            message: "混合多个能力",
            suggestion: "拆分"
          }
        ],
        warnings: []
      }
    });

    expect(prompt).toContain("reports only defects that remain in the returned draft");
    expect(prompt).toContain("remove resolved findings");
    expect(prompt).toContain("Re-evaluate the exact draft you return");
  });

  it("lets several Learning Nodes decompose one planned question during map review", () => {
    const draft = validateRoadmapDraft({
      planningVersion: 2,
      title: "高数路线",
      status: "draft",
      baseRevision: 0,
      stages: [
        {
          ...layeredSkeletonValue.stages[0],
          status: "expanded",
          rationale: "按蓝图展开",
          moduleDirections: ["极限基础"],
          modules: [
            {
              title: "极限基础",
              goal: "解释极限",
              items: [
                {
                  key: "limit-definition-node",
                  title: "极限定义",
                  keyQuestion: "严格定义表达了什么？",
                  objective: "解释量词关系",
                  planningQuestionKey: "limit-meaning",
                  prerequisiteKeys: [],
                  status: "not_started"
                }
              ]
            }
          ]
        }
      ]
    });
    const prompt = buildMapDraftQualityReviewPrompt({
      domain: { name: "高等数学" },
      courseDesign,
      draft,
      scope: "map"
    });

    expect(prompt).toContain("covered by at least one Learning Node");
    expect(prompt).toContain("several nodes may decompose one planned question");
    expect(prompt).not.toContain("covered exactly once");
    expect(prompt).toContain("Report findings only; do not rewrite the draft");
    expect(prompt).toContain("Judge only the supplied draft");
    expect(prompt).toContain(
      "Do not use a minimum Stage, Module, question, or Learning Node count"
    );
    expect(prompt).toContain(
      "Compressing a Module goal or an expanded Stage that contains independent abilities into too few key questions or Learning Nodes is a scopeCoverage or questionAtomicity defect"
    );
  });
});
