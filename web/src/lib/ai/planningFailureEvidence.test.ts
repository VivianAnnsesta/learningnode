import { describe, expect, it, vi } from "vitest";
import { validateRoadmapInput, type RoadmapInput } from "../learning/roadmapService";
import { scopedContentQuestions } from "../learning/curriculumBoundary";
import { applyPlanningKnowledgeCorrections, validatePlanningKnowledgeReview, planningKnowledgeDigest } from "./planningKnowledgeReview";

// Minimal verbatim failing texts retained from:
// web/test-results/fresh-user-2026-10-09-1791604544968/expanded-stage.json:
// draft.learningGoals[0].contentQuestions[1], stage-limits-continuity / node-limit-operations.
// data.json confirms mapRevision=1, zero formal nodes, and the learner goal below.
// The original artifacts remain untouched. CI uses this inline fixture, never ignored test-results.
// This is a deterministic correction-contract regression with a model stub, not live AI acceptance.
const originalRequirement = "陈述复合函数极限法则及其前提（内层极限存在、外层在对应点连续或极限存在）";
const originalNewKnowledge = "极限四则运算法则及其前提（各极限存在且分母极限不为零）；复合函数极限法则及其前提（内层极限存在、外层在对应点连续或极限存在）；法则失效的反例与替代方法。";
const originalTask = "陈述复合函数极限法则，说明内层极限存在、外层在对应点连续或极限存在这两个前提的作用";
const conditionExplanation = "若 g(x)→b 且 F 在 b 连续，则 F(g(x))→F(b)；若只知 F(t) 在 t→b 的去心极限为 L，且没有 F(b)=L 的额外保证，则还须检查 g(x) 在充分小的去心邻域内不取 b，并满足 F(g(x)) 的定义域及相应趋近方式条件，才能由该法则推出复合极限为 L";
const correctedRequirement = `陈述复合函数极限法则及其前提：${conditionExplanation}`;
const correctedNewKnowledge = `极限四则运算法则及其前提（各极限存在且分母极限不为零）；复合函数极限法则及其前提：${conditionExplanation}；法则失效的反例与替代方法。`;
const correctedTask = `陈述复合函数极限法则，分别解释连续情形与仅用去心极限的情形：${conditionExplanation}；用 g(x)=0、F(t)=1（t≠0）且 F(0)=2 的反例说明为什么仅有两个极限存在不充分`;
const learnerGoal = "我有高中函数与代数基础，希望入门考研数学的一元微积分：理解极限、导数和积分的意义与成立条件，能正确使用基本方法。特别想用函数图像与导数判断 x³−3x=a 的不同实根数量。暂不学多元微积分。";
const counterexample = "g(x)恒为0，所以其极限为0；F(t)在每个t≠0处恒为1，所以t→0的去心极限为1；但F(g(x))恒为F(0)=2，因此复合极限为2而非1。";

function originalFailureDraft(): RoadmapInput & { mapRevision: number; learnerGoal: string } {
  const question = "极限的四则运算与复合运算法则成立的条件是什么，什么情况下不能直接使用？";
  const requirements = [
    "陈述极限四则运算法则及其前提（各极限存在且分母极限不为零）", originalRequirement,
    "给出法则失效的反例（如分母极限为零、外层不连续），并说明失效时如何改用其他方法",
    "演示用运算法则计算若干典型极限，并标注每一步用到的条件"
  ];
  return {
    planningVersion: 3, contentCoverageVersion: 1, baseRevision: 1, mapRevision: 1, learnerGoal,
    title: "考研数学微积分入门：极限、导数与积分", status: "draft",
    learningGoals: [{ key: "goal-1", description: "理解一元微积分中极限、导数与积分的意义与成立条件，能正确使用基本方法，并能用函数图像与导数判断 x³−3x=a 的不同实根数量。", contentQuestions: [
      { key: "content-1", question: "数列极限与函数极限的直观意义与精确刻画分别是什么，ε-N 与 ε-δ 语言如何基本使用？", dimensionKeys: [], contentRequirements: [
        "给出数列极限的直观描述（无限接近）与 ε-N 定义的精确表述，并说明两者关系",
        "给出函数在一点极限的直观描述与 ε-δ 定义的精确表述，说明去心邻域的作用"
      ] },
      { key: "content-2", question, contentRequirements: requirements, dimensionKeys: [] }
    ] }],
    stages: [{ key: "stage-limits-continuity", title: "极限与连续", status: "expanded", prerequisiteStageKeys: [],
      goal: "建立极限的直观与精确理解，掌握极限运算法则与无穷小替换的条件，理解连续性定义与闭区间上连续函数的性质。",
      problem: { question: "讨论函数 f(x)=(x²−1)/(x−1) 在 x→1 时的极限，并判断该函数在 x=1 处是否连续；若补充定义能否使其连续？", steps: ["识别问题：求极限并判断连续性", "用因式分解化简并计算极限，检查运算法则条件"] },
      moduleBlueprints: [
        { key: "module-limit-definition", title: "极限的定义与精确刻画", goal: "理解数列极限与函数极限的直观意义。", keyQuestions: [{ key: "pq-limit-definition-1", contentQuestionKey: "content-1", question: "实际极限定义", checkableOutcome: "说明定义" }] },
        { key: "module-limit-operations", title: "极限运算法则与无穷小替换", goal: "掌握极限四则运算与复合运算法则的成立条件，理解无穷小与无穷大，能正确使用等价无穷小替换并识别失效情形。", keyQuestions: [{ key: "pq-limit-operations-1", contentQuestionKey: "content-2", question, contentRequirements: [...requirements], checkableOutcome: requirements.join("；") }] }
      ],
      modules: [
        { title: "极限的定义与精确刻画", items: [
          { key: "node-sequence-limit-definition", title: "数列极限的直观意义与 ε-N 定义", keyQuestion: "数列极限的直观意义与精确刻画是什么，ε-N 语言如何基本使用？", objective: "解释数列极限及 ε-N 定义。", planningQuestionKeys: ["pq-limit-definition-1"], prerequisiteKeys: [], concept: { name: "数列极限的直观意义与 ε-N 定义", aliases: [], scope: "只讨论数列极限：直观描述、ε-N 定义的精确表述。", problemRole: "提供极限的精确含义。" } },
          { key: "node-function-limit-definition", title: "函数极限的直观意义与 ε-δ 定义", keyQuestion: "函数在一点极限的直观意义与精确刻画是什么，ε-δ 语言如何基本使用，左右极限与极限存在的关系如何？", objective: "解释函数极限及去心邻域。", planningQuestionKeys: ["pq-limit-definition-1"], prerequisiteKeys: ["node-sequence-limit-definition"], concept: { name: "函数极限的直观意义与 ε-δ 定义", aliases: [], scope: "只讨论函数在一点的极限：直观描述、ε-δ 定义、去心邻域的作用。", problemRole: "为连续性、导数定义提供语言基础。" } }
        ] },
        { title: "极限运算法则与无穷小替换", items: [{ key: "node-limit-operations", title: "极限的四则运算与复合运算法则及其条件", keyQuestion: question,
          objective: "能陈述四则运算与复合运算法则及其前提，能标注每一步用到的条件，能识别法则失效的情形并改用其他方法。", planningQuestionKeys: ["pq-limit-operations-1"], prerequisiteKeys: ["node-function-limit-definition"],
          concept: { name: "极限的四则运算与复合运算法则及其条件", aliases: ["极限运算法则", "极限的四则运算", "复合函数极限法则"], scope: "只讨论极限的四则运算与复合运算法则及其成立条件、失效反例与替代方法。不涉及等价无穷小替换（下一节点教学），不涉及连续性定义。", problemRole: "为阶段问题中 (x²−1)/(x−1) 在 x→1 的极限计算提供合法步骤，并说明为什么不能直接代入。",
            learningUnit: { version: 2, newKnowledge: originalNewKnowledge, assumedKnowledge: ["高中函数概念与基本初等函数图像", "方程与不等式的代数求解：因式分解、配方"], teachingTasks: [
              "陈述四则运算法则，逐条标注前提，特别强调“各极限存在”与“分母极限不为零”", originalTask,
              "给出法则失效的反例（如分母极限为零、外层不连续），并说明失效时改用因式分解、通分、有理化等方法",
              "演示用运算法则计算若干典型极限，每一步标注所用条件"
            ], example: "计算 lim_{x→1}(x²−1)/(x−1)：先说明分母极限为 0 不能直接用商的法则，再用因式分解约去 (x−1)，最后用四则运算法则得 2。", references: [{ key: "node-function-limit-definition", purpose: "回忆极限存在的含义与左右极限判别，用于检查法则前提是否满足。" }], contentContributions: [{ contentQuestionKey: "content-2", requirementIndices: [0, 1, 2, 3], dimensionKeys: [], contribution: "陈述极限四则运算法则及其前提；陈述复合函数极限法则及其前提；给出法则失效的反例并说明替代方法；演示用运算法则计算典型极限并标注每一步条件。" }] }
          }
        }] }
      ]
    }]
  };
}
const targets = [
  { path: "learningGoals[0].contentQuestions[1].contentRequirements[1]", quote: originalRequirement, replacement: correctedRequirement },
  { path: "stages[0].modules[1].items[0].concept.learningUnit.newKnowledge", quote: originalNewKnowledge, replacement: correctedNewKnowledge },
  { path: "stages[0].modules[1].items[0].concept.learningUnit.teachingTasks[1]", quote: originalTask, replacement: correctedTask }
];
const reviewStub = () => ({
  summary: "三处原文重复缺少复合极限规则条件；这是纠错合同夹具，不是实际模型审查通过。", limitations: ["没有运行真实模型，不表示整门课程知识质量合格。"],
  claims: targets.map((target, index) => ({ key: `preserved-error-${index}`, path: target.path, quote: target.quote,
    conclusion: "两个极限存在就足以使用复合极限规则。", premises: ["内层极限存在", "外层在对应点连续或去心极限存在"], applicability: [conditionExplanation], verdict: "confirmed_error",
    basis: { kind: "derivation", fragmentIds: [], reason: counterexample }, reason: "遗漏外层只具去心极限时所需的内层避值条件；连续与去心极限存在必须区分。", counterexample
  })),
  findings: targets.map(target => ({ ...target, reason: "在同一请求明确更正课程要求和节点的两处教学承诺，保留稳定身份与内容分工。" }))
});

describe("preserved fresh desktop failure: correction contract, not live AI acceptance", () => {
  it("preserves the real missing-condition text even though the deterministic map contract accepts its structure", () => {
    const candidate = validateRoadmapInput(originalFailureDraft());
    expect(candidate.learningGoals![0].contentQuestions![1].contentRequirements[1]).toBe(originalRequirement);
    expect(candidate.stages[0].modules[1].items[0].concept!.learningUnit!.newKnowledge).toBe(originalNewKnowledge);
    expect(candidate.stages[0].modules[1].items[0].concept!.learningUnit!.teachingTasks[1]).toBe(originalTask);
    const review = validatePlanningKnowledgeReview(reviewStub(), candidate, []);
    expect(review.verdict).toBe("confirmed_error");
    expect(review.claims).toHaveLength(3);
  });

  it("patches all three actual offending fields and automatically resolves the Module copy from the corrected registry", () => {
    const candidate = validateRoadmapInput(originalFailureDraft()), originalHash = planningKnowledgeDigest(candidate);
    const model = vi.fn(async () => reviewStub());
    return model().then(raw => {
      const review = validatePlanningKnowledgeReview(raw, candidate, []);
      const patched = applyPlanningKnowledgeCorrections(review, candidate);
      // The reviewer patches only the authoritative registry and actual node fields.
      // The existing structural resolver updates Module question requirements/outcome.
      expect(patched.stages[0].moduleBlueprints![1].keyQuestions[0].contentRequirements![1]).toBe(originalRequirement);
      const corrected = validateRoadmapInput(patched);
      const question = corrected.learningGoals![0].contentQuestions![1], moduleQuestion = corrected.stages[0].moduleBlueprints![1].keyQuestions[0];
      expect(question.contentRequirements[1]).toBe(correctedRequirement);
      expect(moduleQuestion.contentRequirements).toEqual(question.contentRequirements);
      expect(moduleQuestion.checkableOutcome).toContain(conditionExplanation);
      const node = corrected.stages[0].modules[1].items[0], unit = node.concept!.learningUnit!;
      expect(unit.newKnowledge).toBe(correctedNewKnowledge);
      expect(unit.teachingTasks[1]).toBe(correctedTask);
      expect(unit.teachingTasks[0]).toBe(candidate.stages[0].modules[1].items[0].concept!.learningUnit!.teachingTasks[0]);
      expect(unit.example).toBe(candidate.stages[0].modules[1].items[0].concept!.learningUnit!.example);
      expect(scopedContentQuestions(corrected.learningGoals!.flatMap(goal => goal.contentQuestions || []), unit.contentContributions!)[0].contentRequirements[1]).toBe(correctedRequirement);
      expect(corrected).toMatchObject({ baseRevision: 1, mapRevision: 1, learnerGoal });
      expect(node.key).toBe("node-limit-operations");
      expect(node.prerequisiteKeys).toEqual(["node-function-limit-definition"]);
      expect(corrected.stages[0].modules[0]).toEqual(candidate.stages[0].modules[0]);
      expect(corrected.learningGoals![0].description).toBe(candidate.learningGoals![0].description);
      expect(unit.contentContributions).toEqual(candidate.stages[0].modules[1].items[0].concept!.learningUnit!.contentContributions);
      expect(unit.references).toEqual(candidate.stages[0].modules[1].items[0].concept!.learningUnit!.references);
      expect(planningKnowledgeDigest(candidate)).toBe(originalHash);
      expect(planningKnowledgeDigest(corrected)).not.toBe(originalHash);
      expect(model).toHaveBeenCalledTimes(1);
    });
  });

  it("retains the independent counterexample: punctured outer values are 1 while the composition is identically 2", () => {
    // This exact piecewise identity proves the mismatch; it is not a numerical convergence estimate.
    const inner = () => 0, outer = (value: number) => value === 0 ? 2 : 1;
    expect(inner()).toBe(0);
    expect(outer(0)).toBe(2);
    expect(outer(1)).toBe(1);
    expect(outer(-1)).toBe(1);
    expect(outer(inner())).toBe(2);
    expect(reviewStub().claims.every(claim => claim.basis.reason === counterexample)).toBe(true);
  });

  it("does not allow an upstream-only finding to masquerade as correction of the node task", () => {
    const candidate = validateRoadmapInput(originalFailureDraft()), incomplete = reviewStub();
    incomplete.findings = [incomplete.findings[0]];
    expect(() => validatePlanningKnowledgeReview(incomplete, candidate, [])).toThrow("确认错误的主张必须给出对应原文");
  });
});
