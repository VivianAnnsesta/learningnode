import { describe, expect, it } from "vitest";
import { dimensions, validateFramework, validateMaterial, type TeachingMaterial } from "./teachingContracts";
import type { CourseContentQuestion } from "./roadmapPlanningTypes";

const arrangements = [
  { key: "encounter", dimensionKeys: ["motivation", "significance", "role"] },
  { key: "concept", dimensionKeys: ["definition", "mechanism", "relations"] },
  { key: "use", dimensionKeys: ["use", "mechanism"] },
  { key: "discriminate", dimensionKeys: ["boundaries", "relations", "selection"] },
  { key: "integrate", dimensionKeys: ["role", "significance", "relations"] }
];
const questions: CourseContentQuestion[] = [{ key: "content-1", question: "函数与定义域的作用？", contentRequirements: ["定义与范围"], dimensionKeys: ["definition", "motivation", "role", "boundaries"] }];
const framework = validateFramework({
  concept: "函数与定义域", scope: "一元实值函数", definition: "定义域与对应规则确定函数。", runningCase: "约分不扩大原定义域。", prerequisites: [], limitations: [],
  dimensions: Object.keys(dimensions).map(key => ({ key, points: ["具体要点"], segmentKeys: arrangements.filter(s => s.dimensionKeys.includes(key)).map(s => s.key) })),
  segments: arrangements.map(s => ({ ...s, goal: "本段安排", steps: (s.key === "concept" ? ["explain", "convention", "relate"] : ["explain"]).map(key => ({ key: `${s.key}-${key}`, goal: "讲解本概念" })) }))
}, questions);
function material(): TeachingMaterial {
  return { key: "concept", summary: "定义与限制", limitations: [], steps: (["definition", "mechanism", "relations"] as const).map((dimension, i) => ({
    key: framework.segments[1].steps[i].key, contentQuestionKeys: ["content-1"], dimensionKeys: [dimension], explanation: "具体解释当前概念", example: "", summary: "本步结论", terms: [], basis: "derivation", sourceIds: [],
    activities: i ? [] : [{ key: "optional-thought", kind: "explain", prompt: "定义域是什么？", answer: "允许的自变量集合。", criteria: ["含义一致即可"], hints: ["看看允许的输入。"] }]
  })) };
}

describe("content references and required teaching coverage", () => {
  it("unwraps only a literal AI json_object envelope and still validates the complete inner frame", () => {
    const wrapped = { type: "json_object", content: structuredClone(framework) };
    expect(validateFramework(wrapped, questions)).toEqual(framework);
    expect(wrapped.content).toEqual(framework);
    expect(() => validateFramework({ ...wrapped, extra: "ignored field" }, questions)).toThrow();
    expect(() => validateFramework({ type: "unknown", content: framework }, questions)).toThrow();
    expect(() => validateFramework({ type: "json_object", content: { ...framework, dimensions: [] } }, questions)).toThrow("九个维度");
  });
  it("does not let an AI wrapper bypass source or step identity validation", () => {
    const candidate = material();
    expect(validateMaterial({ type: "json_object", content: candidate }, framework, "concept", [])).toEqual(validateMaterial(candidate, framework, "concept", []));
    candidate.steps[0].sourceIds = ["made-up-source"];
    expect(() => validateMaterial({ type: "json_object", content: candidate }, framework, "concept", [])).toThrow("来源片段");
  });
  it("allows a known question on a supplementary relation dimension", () => {
    const result = validateMaterial(material(), framework, "concept", []);
    expect(result.steps[2].contentQuestionKeys).toEqual(["content-1"]);
    expect(result.steps[2].dimensionKeys).toEqual(["relations"]);
  });

  it("does not let supplementary relations replace required definition coverage", () => {
    const candidate = material();
    candidate.steps[0].contentQuestionKeys = [];
    candidate.steps[1].contentQuestionKeys = [];
    expect(() => validateMaterial(candidate, framework, "concept", [])).toThrow("content-1 定位到相应维度");
  });

  it("continues rejecting unknown and duplicate question identities", () => {
    const candidate = material();
    candidate.steps[2].contentQuestionKeys = ["outside-this-lesson"];
    expect(() => validateMaterial(candidate, framework, "concept", [])).toThrow("当前允许：content-1");
    candidate.steps[2].contentQuestionKeys = ["content-1", "content-1"];
    expect(() => validateMaterial(candidate, framework, "concept", [])).toThrow("重复或未知引用");
  });

  it("continues rejecting dimensions outside the current segment plan", () => {
    const candidate = material();
    candidate.steps[2].dimensionKeys.push("role");
    expect(() => validateMaterial(candidate, framework, "concept", [])).toThrow("维度存在重复或未知引用");
  });

  it("continues rejecting invented source-fragment references", () => {
    const candidate = material();
    candidate.steps[0].basis = "source";
    candidate.steps[0].sourceIds = ["invented-fragment"];
    expect(() => validateMaterial(candidate, framework, "concept", [])).toThrow("来源片段存在重复或未知引用");
  });

  it("provides the exact expected layout when a response adds later-segment steps", () => {
    const candidate = material();
    candidate.steps.push({ ...candidate.steps[0], key: "use-explain" });
    try { validateMaterial(candidate, framework, "concept", []); throw new Error("expected rejection"); }
    catch (error) {
      expect(error).toMatchObject({ issues: [{ code: "segment_step_mismatch", path: "steps", actualReferenceKeys: ["concept-explain", "concept-convention", "concept-relate", "use-explain"], allowedReferenceKeys: ["concept-explain", "concept-convention", "concept-relate"] }] });
    }
  });

  it("does not accept missing or reordered planned steps", () => {
    const candidate = material();
    candidate.steps.reverse();
    expect(() => validateMaterial(candidate, framework, "concept", [])).toThrow("不能新增、遗漏、重排");
    candidate.steps.pop();
    expect(() => validateMaterial(candidate, framework, "concept", [])).toThrow("只能包含 3 个步骤");
  });

  it("reports the exact segment dimensions missing when material only tags question coverage", () => {
    const candidate = material();
    candidate.steps.forEach(step => {step.dimensionKeys = ["definition"];});
    expect(() => validateMaterial(candidate, framework, "concept", [])).toThrow("mechanism、relations");
    try { validateMaterial(candidate, framework, "concept", []); } catch (error) {
      expect(error).toMatchObject({issues:[{code:"missing_segment_dimensions",missingDimensionKeys:["mechanism", "relations"],allowedReferenceKeys:["concept-explain", "concept-convention", "concept-relate"]}]});
    }
  });
});


describe("node-local contributions and step allocation", () => {
  const local: CourseContentQuestion[] = [{ key: "shared", question: "完整问题", contentRequirements: ["本节点解释定义"], dimensionKeys: ["definition", "relations"], requirementIndices: [0], contribution: "只解释概念及联系" }];
  const scopedFrame = () => {
    const raw = structuredClone(framework);
    for (const segment of raw.segments) for (const step of segment.steps) step.contentAssignments = [];
    raw.segments[1].steps[0].contentAssignments = [{ contentQuestionKey: "shared", dimensionKeys: ["definition"] }];
    raw.segments[1].steps[2].contentAssignments = [{ contentQuestionKey: "shared", dimensionKeys: ["relations"] }];
    return validateFramework(raw, local);
  };
  it("binds every local contribution to steps without requiring it in every recurring dimension", () => {
    const frame = scopedFrame();
    const input = material();
    input.steps.forEach(s => { s.contentQuestionKeys = ["shared"]; });
    expect(validateMaterial(input, frame, "concept", []).steps).toHaveLength(3);
    const other = { ...input, key: "integrate", steps: [{ ...input.steps[0], key: frame.segments[4].steps[0].key, dimensionKeys: frame.segments[4].dimensionKeys, contentQuestionKeys: [] }] };
    expect(validateMaterial(other, frame, "integrate", []).steps[0].contentQuestionKeys).toEqual([]);
    input.steps[2].contentQuestionKeys = [];
    expect(() => validateMaterial(input, frame, "concept", [])).toThrow("尚未覆盖其安排");
  });
  it("rejects dropping, inventing or moving the contribution outside its allowed dimensions", () => {
    const raw = scopedFrame();
    raw.segments[1].steps[2].contentAssignments = [];
    expect(() => validateFramework(raw, local)).toThrow("尚未安排");
    raw.segments[1].steps[2].contentAssignments = [{ contentQuestionKey: "unknown", dimensionKeys: ["relations"] }];
    expect(() => validateFramework(raw, local)).toThrow("未承担");
  });

  it("counts only local question dimensions while preserving all nine teaching dimensions", () => {
    // Real ε-N framework failure: the question needs three dimensions, while
    // the model attaches it to every valid dimension of the complete lesson.
    const question: CourseContentQuestion = { key: "sequence-limit", question: "数列极限的含义与边界", contentRequirements: ["说明定义", "解释需要", "有限项不影响极限"], requirementIndices: [0, 1, 2], dimensionKeys: ["definition", "motivation", "boundaries"] };
    const raw = structuredClone(framework);
    for (const segment of raw.segments) for (const step of segment.steps) step.contentAssignments = [{ contentQuestionKey: question.key, dimensionKeys: [...segment.dimensionKeys] }];
    const result = validateFramework(raw, [question]);
    expect(result.dimensions).toEqual(raw.dimensions);
    expect(result.segments.map(s => ({ ...s, steps: s.steps.map(({key, goal}) => ({key, goal})) }))).toEqual(raw.segments.map(s => ({ ...s, steps: s.steps.map(({key, goal}) => ({key, goal})) })));
    expect(result.segments[2].steps[0].contentAssignments).toEqual([]);
    expect(result.segments.flatMap(s => s.steps.flatMap(step => step.contentAssignments || [])).flatMap(a => a.dimensionKeys)).toEqual(["motivation", "definition", "definition", "definition", "boundaries"]);
    expect(validateFramework(result, [question])).toEqual(result);
    expect(raw.segments[2].steps[0].contentAssignments?.[0].dimensionKeys).toEqual(["use", "mechanism"]);
    raw.segments[3].steps[0].contentAssignments![0].dimensionKeys = ["relations"];
    expect(() => validateFramework(raw, [question])).toThrow("尚未安排");
    try { validateFramework(raw, [question]); } catch (error) {
      expect(error).toMatchObject({issues:[{code:"missing_content_assignment",contentQuestionKey:"sequence-limit",missingDimensionKeys:["boundaries"]}]});
      expect((error as Error).message).toContain("boundaries → discriminate");
    }
  });

  it("does not normalize unknown, duplicate or wrong-segment references away", () => {
    for (const invalid of [["invented"], ["definition", "definition"], ["definition", "motivation"]]) {
      const raw = scopedFrame();
      (raw.segments[1].steps[0].contentAssignments![0] as {dimensionKeys: string[]}).dimensionKeys = invalid;
      expect(() => validateFramework(raw, local)).toThrow();
    }
    const raw = scopedFrame();
    raw.segments[2].steps[0].contentAssignments = [{contentQuestionKey: "shared", dimensionKeys: ["use"]}, {contentQuestionKey: "shared", dimensionKeys: ["mechanism"]}];
    expect(() => validateFramework(raw, local)).toThrow("不能重复");
  });
});
