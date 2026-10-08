import { describe, expect, it } from "vitest";
import { initialTeachingProgress, publicTeachingLesson, updateTeachingProgress, validateTeachingLesson, validateTeachingReply } from "./nodeTeaching";
import { teachingContextFixture as context, teachingLessonFixture as lesson } from "./nodeTeaching.fixture";

describe("node teaching material boundaries", () => {
  it("keeps unrequested exercise answers and hints on the server", () => {
    const progress = initialTeachingProgress(lesson);
    const visible = publicTeachingLesson(lesson, progress);
    const output = JSON.stringify(visible.exercises);
    expect(output).not.toContain(lesson.exercises[0].expectedAnswer);
    expect(output).not.toContain(lesson.exercises[0].hints[0]);
    expect(output).not.toContain("rubric");
    const hinted = updateTeachingProgress(lesson, progress, { action: "hint", exerciseKey: "guided-1" });
    expect(publicTeachingLesson(lesson, hinted).exercises[0].visibleHints).toEqual([lesson.exercises[0].hints[0]]);
    expect(publicTeachingLesson(lesson, hinted).exercises[0].solution).toBeNull();
    expect(progress.support).toEqual({});
  });

  it("preserves exact draft whitespace so autosave converges", () => {
    const progress = updateTeachingProgress(lesson, initialTeachingProgress(lesson), { action: "save_answer", answer: "我的计算  \n" });
    expect(progress.drafts["guided-1"]).toBe("我的计算  \n");
  });

  it("rejects unknown exercise references and arbitrary state writes", () => {
    expect(() => updateTeachingProgress(lesson, initialTeachingProgress(lesson), { action: "hint", exerciseKey: "foreign" })).toThrow();
    expect(() => updateTeachingProgress(lesson, initialTeachingProgress(lesson), { action: "mastered" })).toThrow();
  });

  it("rejects invented sources, duplicate keys and missing independent work", () => {
    expect(validateTeachingLesson(lesson, context)).toEqual(lesson);
    expect(() => validateTeachingLesson({ ...lesson, sourceIds: ["invented"] }, context)).toThrow();
    expect(() => validateTeachingLesson({ ...lesson, exercises: [lesson.exercises[0], lesson.exercises[0]] }, context)).toThrow();
    expect(() => validateTeachingLesson({ ...lesson, exercises: lesson.exercises.map((item) => ({ ...item, mode: "guided" })) }, context)).toThrow();
    expect(() => validateTeachingLesson({ ...lesson, exercises: [{ ...lesson.exercises[0], expectedAnswer: "" }, lesson.exercises[1]] }, context)).toThrow();
    expect(() => validateTeachingLesson({ ...lesson, exercises: [{ ...lesson.exercises[0], key: "__proto__" }, lesson.exercises[1]] }, context)).toThrow();
  });

  it("requires bounded, specific feedback and never parses mastery states", () => {
    expect(validateTeachingReply({ text: "需要核对", nextStep: "换一种方法验证", verdict: "uncertain", masteryStatus: "mastered" }, "answer"))
      .toEqual({ text: "需要核对", nextStep: "换一种方法验证", verdict: "uncertain" });
    expect(() => validateTeachingReply({ text: "很好", nextStep: "", verdict: "correct" }, "answer")).toThrow();
    expect(() => validateTeachingReply({ text: "很好", nextStep: "下一题", verdict: "mastered" }, "answer")).toThrow();
  });
});
