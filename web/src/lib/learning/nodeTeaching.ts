export class NodeTeachingError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
    this.name = "NodeTeachingError";
  }
}

export type TeachingContext = {
  domain: {
    name: string; goal: string; currentLevel: string; background: string;
    taskBrief: string; scope: string; excludedScope: string; depth: string;
    outputType: string; outputTarget: string;
  };
  node: {
    title: string; objective: string; keyQuestion: string;
    prerequisite: string; commonMistake: string;
  };
  stage: { title: string; goal: string; moduleTitle: string; checkableOutcome: string };
  sources: { id: string; title: string; url: string; excerpt: string }[];
  warnings: string[];
};

export type TeachingExercise = {
  key: string;
  mode: "guided" | "independent";
  prompt: string;
  expectedAnswer: string;
  rubric: string[];
  hints: string[];
};

export type TeachingLesson = {
  explanation: string;
  workedExample: { prompt: string; steps: string[]; conclusion: string };
  exercises: TeachingExercise[];
  takeaways: string[];
  sourceIds: string[];
  limitations: string[];
};

export type TeachingProgress = {
  section: "explanation" | "example" | "practice";
  exerciseKey: string;
  drafts: Record<string, string>;
  support: Record<string, { hints: number; solution: boolean }>;
};

export type TeachingReply = {
  text: string;
  nextStep: string;
  verdict?: "correct" | "partial" | "needs_work" | "uncertain";
};

export type TeachingInteractionView = {
  id: string; requestId: string; kind: "answer" | "question";
  exerciseKey: string; input: string; assistance: number;
  status: string; response: TeachingReply | null; error: string | null;
};

export type TeachingSessionView = {
  id: string; revision: number; stale: boolean; mapRevision: number;
  context: TeachingContext;
  lesson: Omit<TeachingLesson, "exercises"> & {
    exercises: (Pick<TeachingExercise, "key" | "mode" | "prompt"> & {
      hintCount: number; visibleHints: string[]; solution: string | null;
    })[];
  };
  progress: TeachingProgress;
  interactions: TeachingInteractionView[];
};

export function teachingObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new NodeTeachingError("请求必须是一个对象。");
  }
  return value as Record<string, unknown>;
}

export function teachingText(value: unknown, label: string, max = 6000, allowEmpty = false) {
  if (typeof value !== "string" || value.length > max || (!allowEmpty && !value.trim())) {
    throw new NodeTeachingError(`${label}需要${allowEmpty ? "" : "非空"}文本，最多 ${max} 个字符。`);
  }
  return value.trim();
}

function textArray(value: unknown, label: string, min: number, max: number) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    throw new NodeTeachingError(`${label}的条目数量不合法。`);
  }
  return value.map((item) => teachingText(item, label, 3000));
}

export function validateTeachingLesson(value: unknown, context: TeachingContext): TeachingLesson {
  const data = teachingObject(value);
  const example = teachingObject(data.workedExample);
  if (!Array.isArray(data.exercises) || data.exercises.length < 2 || data.exercises.length > 6) {
    throw new NodeTeachingError("教学材料需要引导和独立练习，总数为 2 至 6 道。");
  }
  const exercises = data.exercises.map((item): TeachingExercise => {
    const exercise = teachingObject(item);
    const key = teachingText(exercise.key, "练习标识", 60);
    if (!/^[a-zA-Z0-9_-]+$/.test(key) || Object.prototype.hasOwnProperty.call(Object.prototype, key)) {
      throw new NodeTeachingError("练习标识不合法。");
    }
    if (exercise.mode !== "guided" && exercise.mode !== "independent") {
      throw new NodeTeachingError("练习类型不合法。");
    }
    return {
      key, mode: exercise.mode,
      prompt: teachingText(exercise.prompt, "练习题目"),
      expectedAnswer: teachingText(exercise.expectedAnswer, "参考解答"),
      rubric: textArray(exercise.rubric, "评价依据", 1, 6),
      hints: textArray(exercise.hints, "提示", 1, 3)
    };
  });
  if (new Set(exercises.map((item) => item.key)).size !== exercises.length ||
      !exercises.some((item) => item.mode === "guided") ||
      !exercises.some((item) => item.mode === "independent")) {
    throw new NodeTeachingError("练习标识须唯一，且同时包含引导与独立练习。");
  }
  const sourceIds = textArray(data.sourceIds, "来源标识", 0, context.sources.length);
  if (sourceIds.some((id) => !context.sources.some((source) => source.id === id)) ||
      new Set(sourceIds).size !== sourceIds.length) {
    throw new NodeTeachingError("教学材料引用了未提供的来源。");
  }
  return {
    explanation: teachingText(data.explanation, "讲解", 12000),
    workedExample: {
      prompt: teachingText(example.prompt, "示范问题"),
      steps: textArray(example.steps, "示范步骤", 1, 12),
      conclusion: teachingText(example.conclusion, "示范结论")
    },
    exercises,
    takeaways: textArray(data.takeaways, "小结", 1, 6),
    sourceIds,
    limitations: textArray(data.limitations, "适用边界", 1, 6)
  };
}

export function validateTeachingReply(value: unknown, kind: "answer" | "question"): TeachingReply {
  const data = teachingObject(value);
  const response: TeachingReply = {
    text: teachingText(data.text, "教学反馈", 10000),
    nextStep: teachingText(data.nextStep, "后续尝试", 3000)
  };
  if (kind === "answer") {
    if (!["correct", "partial", "needs_work", "uncertain"].includes(String(data.verdict))) {
      throw new NodeTeachingError("作答反馈缺少有效的判断。");
    }
    response.verdict = data.verdict as TeachingReply["verdict"];
  }
  return response;
}

export function initialTeachingProgress(lesson: TeachingLesson): TeachingProgress {
  return { section: "explanation", exerciseKey: lesson.exercises[0].key, drafts: {}, support: {} };
}

export function publicTeachingLesson(lesson: TeachingLesson, progress: TeachingProgress): TeachingSessionView["lesson"] {
  return {
    ...lesson,
    exercises: lesson.exercises.map((exercise) => ({
      key: exercise.key, mode: exercise.mode, prompt: exercise.prompt,
      hintCount: exercise.hints.length,
      visibleHints: exercise.hints.slice(0, progress.support[exercise.key]?.hints || 0),
      solution: progress.support[exercise.key]?.solution ? exercise.expectedAnswer : null
    }))
  };
}

export function parseTeachingBinding(value: unknown) {
  const data = teachingObject(value);
  const sessionId = teachingText(data.sessionId, "教学会话", 100);
  if (!Number.isSafeInteger(data.revision) || Number(data.revision) < 0) {
    throw new NodeTeachingError("教学版本不合法，请重新加载。");
  }
  return { data, sessionId, revision: data.revision as number };
}

export function updateTeachingProgress(lesson: TeachingLesson, current: TeachingProgress, value: unknown) {
  const data = teachingObject(value);
  const progress: TeachingProgress = JSON.parse(JSON.stringify(current));
  const key = teachingText(data.exerciseKey ?? current.exerciseKey, "练习标识", 60);
  const exercise = lesson.exercises.find((item) => item.key === key);
  if (!exercise) throw new NodeTeachingError("练习不属于当前教学材料。");
  if (data.action === "navigate") {
    if (!["explanation", "example", "practice"].includes(String(data.section))) {
      throw new NodeTeachingError("学习位置不合法。");
    }
    progress.section = data.section as TeachingProgress["section"];
    progress.exerciseKey = key;
  } else if (data.action === "save_answer") {
    teachingText(data.answer, "作答草稿", 6000, true);
    progress.drafts[key] = data.answer as string;
  } else if (data.action === "hint" || data.action === "solution") {
    const support = progress.support[key] || { hints: 0, solution: false };
    progress.support[key] = data.action === "hint"
      ? { ...support, hints: Math.min(support.hints + 1, exercise.hints.length) }
      : { ...support, solution: true };
  } else {
    throw new NodeTeachingError("不支持的教学操作。");
  }
  return progress;
}
