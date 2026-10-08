import { describe, expect, it } from "vitest";
import { ConceptPlanningValidationError, validateConceptGoals } from "./conceptPlanning";
import { validateRoadmapSkeletonDraft } from "../ai/tasks";
import { roadmapSkeletonToDraft, validateRoadmapInput, roadmapDraftToSkeleton } from "./roadmapService";

const contentCourse = () => ({planningVersion:3,contentCoverageVersion:1,title:"极限入门",status:"draft",learningGoals:[{key:"method-choice",description:"学习极限计算方法的选择。",contentQuestions:[{key:"equivalent-conditions",question:"什么时候可以使用等价无穷小替换？",contentRequirements:["说明替换条件，提供一次示范和一个误用反例。"],dimensionKeys:["boundaries","selection"]}]}],stages:[{key:"limits",title:"极限与连续",goal:"讲清极限计算中的使用条件。",goalKeys:["wrong-parent-label"],problem:{question:"怎样处理一个未定式？",steps:["识别形式","比较方法"]},coreTopics:["等价无穷小"],prerequisiteStageKeys:[],moduleBlueprints:[{key:"equivalents",title:"等价替换",goal:"解释替换条件。",goalKeys:[],keyQuestions:[{key:"q-equivalents",contentQuestionKey:"equivalent-conditions"}]}]}]});

describe("traceable content coverage contract",()=>{
  it("computes parent summaries from references and retains the registry across persistence",()=>{
    const raw=contentCourse();const registry=JSON.stringify(raw.learningGoals);
    const skeleton=validateRoadmapSkeletonDraft(raw);
    expect(skeleton.stages[0].goalKeys).toEqual(["method-choice"]);
    expect(skeleton.stages[0].moduleBlueprints![0].keyQuestions[0]).toMatchObject({goalKeys:["method-choice"],contentRequirements:["说明替换条件，提供一次示范和一个误用反例。"]});
    const saved=validateRoadmapInput(JSON.parse(JSON.stringify(roadmapSkeletonToDraft(skeleton,7))));
    expect(saved.contentCoverageVersion).toBe(1);
    expect(JSON.stringify(roadmapDraftToSkeleton(saved).learningGoals)).toBe(registry);
    expect(raw.stages[0].goalKeys).toEqual(["wrong-parent-label"]);
  });
  it("does not accept dangling references or turn an unarranged question into coverage",()=>{
    const raw=contentCourse();raw.stages[0].moduleBlueprints[0].keyQuestions[0].contentQuestionKey="unknown";
    try{validateRoadmapSkeletonDraft(raw);throw new Error("must reject");}catch(error){expect((error as {issues:unknown[]}).issues).toEqual(expect.arrayContaining([expect.objectContaining({code:"unknown_content_question",stageKey:"limits",questionKey:"q-equivalents",allowedReferenceKeys:["equivalent-conditions"]}),expect.objectContaining({code:"unarranged_content_question",questionKey:"equivalent-conditions"})]));}
  });
  it("rejects incomplete material requirements, invalid dimensions and duplicate content identities",()=>{
    const raw=contentCourse();raw.learningGoals[0].contentQuestions[0].dimensionKeys=["constructor"];
    expect(()=>validateRoadmapSkeletonDraft(raw)).toThrow("有效九维");
    raw.learningGoals[0].contentQuestions[0].dimensionKeys=["definition"];raw.learningGoals[0].contentQuestions[0].contentRequirements=[];
    expect(()=>validateRoadmapSkeletonDraft(raw)).toThrow("材料说明要求");
    const other=contentCourse();other.learningGoals[0].contentQuestions.push({...other.learningGoals[0].contentQuestions[0]});
    expect(()=>validateRoadmapSkeletonDraft(other)).toThrow("唯一");
  });
});

const valid = () => ({
  learningGoals: [{ key: "limit-goal", description: "解释和计算极限" }, { key: "derivative-goal", description: "解释变化率" }],
  stages: [{ key: "limits-and-derivatives", goalKeys: ["limit-goal", "derivative-goal"], problem: { question: "如何分析函数局部变化？", steps: ["确定变化趋势", "求瞬时变化率"] },
    moduleBlueprints: [
      { key: "limits", goalKeys: ["limit-goal"], keyQuestions: [{ key: "meaning-of-limit", goalKeys: ["limit-goal"] }] },
      { key: "derivatives", goalKeys: ["derivative-goal"], keyQuestions: [{ key: "meaning-of-derivative", goalKeys: ["derivative-goal"] }] }
    ] }]
});

describe("concept planning goal diagnostics", () => {
  it("accepts an intentional allocation with all goals covered", () => {
    expect(() => validateConceptGoals(valid())).not.toThrow();
  });
  it("reports all invalid parent references with paths, stable keys and allowed values", () => {
    const candidate = valid();
    candidate.stages[0].moduleBlueprints[0].goalKeys = ["invented-module-goal"];
    candidate.stages[0].moduleBlueprints[1].keyQuestions[0].goalKeys = [];
    try {
      validateConceptGoals(candidate);
      throw new Error("The invalid candidate must fail");
    } catch (error) {
      expect(error).toBeInstanceOf(ConceptPlanningValidationError);
      const issues = (error as ConceptPlanningValidationError).issues;
      expect(issues).toContainEqual(expect.objectContaining({ code: "invalid_module_goals", path: "stages[0].moduleBlueprints[0].goalKeys", stageKey: "limits-and-derivatives", moduleKey: "limits", actualGoalKeys: ["invented-module-goal"], allowedGoalKeys: ["limit-goal", "derivative-goal"] }));
      expect(issues).toContainEqual(expect.objectContaining({ code: "invalid_question_goals", path: "stages[0].moduleBlueprints[1].keyQuestions[0].goalKeys", questionKey: "meaning-of-derivative", actualGoalKeys: [], allowedGoalKeys: ["derivative-goal"] }));
      expect(issues).toContainEqual(expect.objectContaining({ code: "uncovered_learning_goals", missingGoalKeys: ["derivative-goal"] }));
    }
    expect(candidate.stages[0].moduleBlueprints[0].goalKeys).toEqual(["invented-module-goal"]);
  });
  it("still rejects missing goals, invalid stage goals, duplicate goals and missing problem scope", () => {
    const candidate = valid();
    candidate.learningGoals.push(candidate.learningGoals[0]);
    candidate.stages[0].goalKeys = ["unrelated-goal"];
    candidate.stages[0].problem.steps = [];
    expect(() => validateConceptGoals(candidate)).toThrow(ConceptPlanningValidationError);
  });
});
