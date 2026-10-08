import type { TeachingContext, TeachingLesson } from "./nodeTeaching";
import lesson from "../../../test-fixtures/node-teaching.json";

// A deterministic contract fixture, not a validated teaching-effect sample.
export const teachingContextFixture: TeachingContext = {
  domain: { name: "变化率入门", goal: "理解速度", currentLevel: "会基本运算", background: "",
    taskBrief: "理解平均变化率", scope: "平均变化率", excludedScope: "导数计算", depth: "直观入门", outputType: "解释", outputTarget: "解释简单运动" },
  node: { title: "平均变化率", objective: "计算并解释区间平均变化率", keyQuestion: "如何比较变化快慢？",
    prerequisite: "四则运算", commonMistake: "只计算变化量" },
  stage: { title: "认识变化", goal: "用变化率解释运动", moduleTitle: "变化率", checkableOutcome: "解释每单位时间的变化" },
  sources: [], warnings: []
};

export const teachingLessonFixture = lesson as TeachingLesson;
