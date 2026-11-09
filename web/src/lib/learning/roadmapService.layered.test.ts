import { describe, expect, it } from "vitest";
import { currentRoadmap } from "./currentRoadmap.fixture";
import { mergeRoadmapStageDraft, roadmapDraftToSkeleton, validateRoadmapInput } from "./roadmapService";
describe("当前渐进阶段规划", () => {
  it("蓝图只声明教学问题，当前没有正式节点", () => {
    const value = validateRoadmapInput(currentRoadmap());
    expect(value.stages[0].modules).toEqual([]); expect(value.stages[0].goalKeys).toEqual(["count"]);
    expect(value.stages[0].moduleBlueprints![0].keyQuestions[0].question).toBe("如何解释参数并正确计数交点？");
  });
  it("实际问题不能遗漏承接，允许多节点各承担一个要求", () => {
    const value = currentRoadmap(true); expect(validateRoadmapInput(value).stages[0].modules[0].items).toHaveLength(2);
    value.stages[0].modules[0].items.forEach(item => item.planningQuestionKeys = []);
    expect(() => validateRoadmapInput(value)).toThrow();
  });
  it("从服务器蓝图恢复总目标、具体问题和阶段依赖，旧格式不能展开", () => {
    const value = roadmapDraftToSkeleton(currentRoadmap());
    expect(value.learningGoals![0].contentQuestions![0].contentRequirements).toHaveLength(2);
    expect(value.stages[0].prerequisiteStageKeys).toEqual([]);
    expect(() => roadmapDraftToSkeleton({ ...currentRoadmap(), planningVersion: 2 })).toThrow("planningVersion=3");
  });
  it("只合并当前阶段，保持课程问题、其他阶段与其原有模块", () => {
    const source = currentRoadmap(); const second = structuredClone(source.stages[0]);
    second.key = "next"; second.title = "后续比较"; second.moduleBlueprints![0].key = "next-module"; second.moduleBlueprints![0].keyQuestions[0].key = "next-question";
    source.stages.push(second);
    const normalized = validateRoadmapInput(source), expanded = currentRoadmap(true).stages[0];
    const result = mergeRoadmapStageDraft(normalized, "graph", expanded);
    expect(result.learningGoals).toEqual(normalized.learningGoals); expect(result.stages[1]).toEqual(normalized.stages[1]);
    expect(result.stages[0].moduleBlueprints).toEqual(normalized.stages[0].moduleBlueprints); expect(result.stages[0].status).toBe("expanded");
  });
  it("阶段显示顺序和概念复用不能制造隐式依赖", () => {
    const source = currentRoadmap(true); source.stages[0].modules[0].items[1].prerequisiteKeys = [];
    expect(validateRoadmapInput(source).stages[0].modules[0].items.every(n => n.prerequisiteKeys.length === 0)).toBe(true);
    source.stages[0].modules[0].items[0].prerequisiteKeys = ["critical-count"]; source.stages[0].modules[0].items[1].prerequisiteKeys = ["parameters"];
    expect(() => validateRoadmapInput(source)).toThrow();
  });
});
