import { parseConcept, parseProblem, parseGoals, parseConceptReferences, validateConceptGoals, planningStrings } from "../learning/conceptPlanning";
import { AiTaskValidationError, validationIssues } from "./validationEvidence";
import { parseKnowledgeBoundary, knowledgeBoundaryShape, learningUnitShape, conceptReferenceShape, curriculumBoundaryRules } from "../learning/curriculumBoundary";
import type { KnowledgeBoundary } from "../learning/roadmapPlanningTypes";
import { validateCriticalPlanningReport, criticalPlanningTargets, validateContentRevisions, criticalReviewRules, contentRevisionRules, type ContentRevision, type CriticalEvidence } from "./planningReviewPolicy";
import type { LearningGoal, StageProblem } from "../learning/roadmapPlanningTypes";
import type { DiagnosticSessionInput } from "../learning/diagnosticService";
import type { RoadmapInput, RoadmapStageInput } from "../learning/roadmapService";
import {
  checkRoadmapSkeletonDeterminism,
  type DeterminismIssue
} from "./roadmapSkeletonChecks";
import {
  checkLayeredRoadmapSkeleton,
  type RoadmapPlanningIssue
} from "./roadmapPlanningQuality";
import type {
  RoadmapModuleBlueprint,
  RoadmapModuleKeyQuestion
} from "../learning/roadmapPlanningTypes";
import { isSafeExternalUrl } from "../security/externalUrl";
import {
  LOW_RELEVANCE_THRESHOLD
} from "../learning/sourceRelevanceService";

type StringRecord = Record<string, unknown>;

export { AiTaskValidationError } from "./validationEvidence";

const isRecord = (value: unknown): value is StringRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const asArray = (value: unknown) => (Array.isArray(value) ? value : []);

const requiredText = (value: unknown, fallback: string) => {
  if (typeof value === "string" && value.trim()) return value.trim();
  return fallback;
};

const optionalText = (value: unknown) => {
  if (typeof value === "string" && value.trim()) return value.trim();
  return null;
};

const textArray = (value: unknown) =>
  asArray(value)
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);

const stripOuterMarkdownFence = (text: string) => {
  const trimmed = text.trim();
  if (!trimmed.startsWith("```")) {
    return trimmed;
  }

  const lines = trimmed.split(/\r?\n/);
  if (lines.length < 2) {
    return trimmed;
  }

  const firstLine = lines[0].trim();
  if (!/^```[a-z0-9_-]*$/i.test(firstLine)) {
    return trimmed;
  }

  const lastLineIndex = lines.length - 1;
  if (lines[lastLineIndex].trim() !== "```") {
    return trimmed;
  }

  return lines.slice(1, lastLineIndex).join("\n").trim();
};

const findCompleteJsonObjectFrom = (text: string, startIndex: number) => {
  if (text[startIndex] !== "{") {
    return null;
  }

  let depth = 1;
  let inString = false;
  let escaped = false;

  for (let index = startIndex + 1; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
    } else if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return {
          jsonText: text.slice(startIndex, index + 1),
          endIndex: index
        };
      }
    }
  }

  return null;
};

export function parseJsonObjectFromModel(text: string): unknown {
  const original = text.trim();
  const unwrapped = stripOuterMarkdownFence(original);
  const sources = unwrapped === original ? [original] : [unwrapped, original];

  let lastParseError: string | null = null;

  for (const source of sources) {
    for (let startIndex = 0; startIndex < source.length; startIndex += 1) {
      if (source[startIndex] !== "{") continue;

      const candidate = findCompleteJsonObjectFrom(source, startIndex);
      if (!candidate) {
        continue;
      }

      try {
        return JSON.parse(candidate.jsonText);
      } catch (error) {
        lastParseError = error instanceof Error ? error.message : "invalid JSON";
        startIndex = candidate.endIndex;
      }
    }
  }

  if (!lastParseError) {
    throw new AiTaskValidationError("AI output does not contain a JSON object.");
  }

  throw new AiTaskValidationError(`AI output JSON parse failed: ${lastParseError}`);
}

export type TaskBriefDraft = {
  guide?: { overview:string; representativeQuestions:string[]; suggestions:{goal:string;scope:string;excludedScope:string;currentLevel:string;outputTarget:string}; assumptions:string[] };
  taskBrief: string;
  summary: string;
  successCriteria: string[];
  risks: string[];
};

export type SourceGroundingRelevance = {
  score: number;
  lowRelevance: boolean;
};

export type SourceGroundingAiRelevance = {
  score: number;
  lowRelevance: boolean;
  reason: string;
};

export type SourceGroundingInfo = {
  ok: boolean;
  status: number | null;
  title: string | null;
  excerpt: string | null;
  relevance?: SourceGroundingRelevance | null;
  aiRelevance?: SourceGroundingAiRelevance | null;
};

export type CourseDesignSource = {
  url: string;
  title: string;
  reason: string;
  grounding?: SourceGroundingInfo | null;
};

export type CourseDesignGlobalExplanation = {
  theorySkeleton: string;
  sourceBasis: string;
  optimizationRationale: string;
  risksAndValidation: string;
};

export type CourseDesignQualityGate = {
  passed: boolean;
  missing: string[];
};

export type RouteQualityDimensionKey =
  | "prerequisiteCorrectness"
  | "goalMatch"
  | "cognitiveLoad"
  | "sourceQuality"
  | "checkability";

export type RouteQualityDimension = {
  key: RouteQualityDimensionKey;
  score: number;
  note: string;
};

export type RouteQualityReport = {
  summary: string;
  significantIssues: boolean;
  dimensions: RouteQualityDimension[];
};

export const routeQualityDimensionKeys: RouteQualityDimensionKey[] = [
  "prerequisiteCorrectness",
  "goalMatch",
  "cognitiveLoad",
  "sourceQuality",
  "checkability"
];

export type CourseDesignDraft = {
  courseDesignVersion?: 3;
  knowledgeBoundary?: KnowledgeBoundary;
  taskBriefSnapshot: string;
  globalExplanation: CourseDesignGlobalExplanation;
  sources: CourseDesignSource[];
  keyTradeoffs: string[];
  qualityGate: CourseDesignQualityGate;
  qualityReport?: RouteQualityReport | null;
};

export type RoadmapSkeletonStage = {
  goalKeys?: string[];
  problem?: StageProblem;
  key: string;
  title: string;
  goal: string | null;
  coreTopics: string[];
  prerequisiteStageTitles: string[];
  prerequisiteStageKeys: string[];
  /** Required for newly generated planningVersion 3 skeletons. */
  moduleBlueprints?: RoadmapModuleBlueprint[];
};

export type RoadmapSkeletonDraft = {
  contentCoverageVersion?: 1;
  learningGoals?: LearningGoal[];
  title: string;
  status: "draft";
  /** Missing only on readable legacy skeletons. New AI generation must emit 3. */
  planningVersion?: 2 | 3;
  stages: RoadmapSkeletonStage[];
  /** Advisory-only determinism findings (warnings). Errors block validation. */
  determinismWarnings?: DeterminismIssue[];
  /** Content-risk signals that require the server-side AI review. */
  planningWarnings?: RoadmapPlanningIssue[];
};

export type MapDraftQualityFinding = {
  code: string;
  targetKey: string | null;
  message: string;
  suggestion: string | null;
  evidence?: CriticalEvidence;
};

export type MapDraftQualityReport = {
  reviewPolicyVersion?: 1;
  status: "passed" | "blocked";
  summary: string;
  blockingIssues: MapDraftQualityFinding[];
  warnings: MapDraftQualityFinding[];
  contentRevisions?: ContentRevision[];
};

export type RoadmapSkeletonCritique = {
  report: MapDraftQualityReport;
  draft: RoadmapSkeletonDraft;
};

export function evaluateCourseDesignQuality(
  draft: Omit<CourseDesignDraft, "qualityGate">
): CourseDesignQualityGate {
  const missing: string[] = [];
  const explanation = draft.globalExplanation;
  if (draft.courseDesignVersion === 3 && !draft.knowledgeBoundary) missing.push("knowledgeBoundary: 默认基础与课程新增知识清单");

  if (!draft.taskBriefSnapshot.trim()) missing.push("taskBriefSnapshot");
  if (!explanation.theorySkeleton.trim()) missing.push("theorySkeleton");
  if (!explanation.sourceBasis.trim()) missing.push("sourceBasis");
  if (!explanation.optimizationRationale.trim()) {
    missing.push("optimizationRationale");
  }
  if (!explanation.risksAndValidation.trim()) {
    missing.push("risksAndValidation");
  }
  if (draft.sources.length === 0) missing.push("sources");
  if (draft.sources.some((source) => !source.url || !source.reason)) {
    missing.push("source url/reason");
  }
  if (draft.sources.some((source) => !hasSpecificSourceUrl(source.url))) {
    missing.push("specific source url");
  }
  if (draft.sources.some((source) => hasSuspiciousSourceUrl(source.url))) {
    missing.push("non-placeholder source url");
  }

  return {
    passed: missing.length === 0,
    missing
  };
}

const hasSpecificSourceUrl = (url: string) => {
  if (!isSafeExternalUrl(url)) return false;
  try {
    const parsed = new URL(url);
    const path = parsed.pathname.replace(/\/+$/, "");
    if (!path) {
      const hostTokens = parsed.hostname.toLowerCase().split(/[.-]/);
      return ["docs", "developer", "handbook", "course", "cheatsheet"].some(
        (marker) => hostTokens.includes(marker)
      );
    }
    const lowerPath = path.toLowerCase();
    return (
      lowerPath.includes("course") ||
      lowerPath.includes("syllabus") ||
      lowerPath.includes("linear") ||
      lowerPath.includes("algebra") ||
      lowerPath.includes("math") ||
      lowerPath.includes("kaoyan") ||
      lowerPath.includes("outline") ||
      lowerPath.includes("docs") ||
      lowerPath.includes("tsconfig") ||
      lowerPath.includes("book") ||
      lowerPath.includes("pdf") ||
      path.split("/").filter(Boolean).length >= 2
    );
  } catch {
    return false;
  }
};

const hasSuspiciousSourceUrl = (url: string) => {
  const normalized = url.toLowerCase();
  return (
    normalized.includes("example.") ||
    normalized.includes("placeholder") ||
    normalized.includes("your-") ||
    /(?:0c0c[-_]?){3,}/.test(normalized) ||
    /bookid=[0-9a-f-]*0c0c[0-9a-f-]*0c0c[0-9a-f-]*0c0c/i.test(url)
  );
};

export function buildTaskBriefPrompt(domain: {
  name: string;
  description?: string | null;
  currentLevel?: string | null;
  goal?: string | null;
  scope?: string | null;
  excludedScope?: string | null;
  depth?: string | null;
  outputType?: string | null;
  outputTarget?: string | null;
  taskBrief?: string | null;
}) {
  return `
Generate a beginner entry guide and learning task brief draft for this learning domain. A domain name alone is enough; infer conservative beginner options and clearly mark assumptions, never pretend the learner already knows professional scope.

Domain data:
${JSON.stringify(domain, null, 2)}

Return only JSON with this shape:
{
  "taskBrief": "a structured Chinese task brief",
  "guide": {"overview":"what this field studies in beginner language","representativeQuestions":["concrete understandable problem"],"suggestions":{"goal":"beginner goal","scope":"included subjects","excludedScope":"excluded subjects","currentLevel":"unknown unless learner stated","outputTarget":"inspectable learning result"},"assumptions":["choice learner should confirm"]},
  "summary": "one-sentence Chinese summary",
  "successCriteria": ["short Chinese checklist items"],
  "risks": ["short Chinese risk or scope warnings"]
}

Requirements:
- The taskBrief must be practical and editable by the user.
- Include learning goal, included scope, excluded scope, expected output, and evaluation approach when the data supports it.
- Keep currentLevel as the learner's self-assessed level, and description as evidence of what they have studied, built, or are stuck on.
- Keep outputType as the output category, and outputTarget as the concrete inspectable deliverable.
- Keep taskBrief concise: 4-6 short sections, about 600-1200 Chinese characters.
- Do not propose course stages, roadmap stages, modules, node details, or per-stage plans. Those are generated later.
- End the taskBrief with a complete sentence, not an unfinished heading, bullet, or numbered item.
- Preserve uncertainty. If the scope is unclear, encode cautious assumptions instead of inventing facts.
- Keep successCriteria and risks concise and actionable.
- Separate assumed entry foundations from what this course will add in the taskBrief and guide.assumptions. Keep foundations out of the proposed required scope unless the learner asks to relearn them. Unknown foundations remain explicit assumptions for user editing; never certify mastery.
- This is a draft for user review, not a final authority.
`.trim();
}

const assertUsableTaskBrief = (taskBrief: string) => {
  const trimmed = taskBrief.trim();
  if (!/[。！？.!?）)]$/.test(trimmed)) {
    throw new AiTaskValidationError(
      "Task brief appears incomplete or truncated."
    );
  }
  if (/阶段划分|阶段\s*\d+\s*[：:]/.test(trimmed)) {
    throw new AiTaskValidationError(
      "Task brief must not expand into roadmap stages."
    );
  }
};

export function validateTaskBriefDraft(value: unknown): TaskBriefDraft {
  if (!isRecord(value)) {
    throw new AiTaskValidationError("Task brief draft must be a JSON object.");
  }

  const suppliedTaskBrief =
    typeof value.taskBrief === "string" ? value.taskBrief.trim() : "";
  const taskBrief = requiredText(
    value.taskBrief,
    [
      "学习目标：围绕当前领域建立可验证的理解。",
      "范围边界：先按现有信息推进，模糊部分保持保守假设。",
      "预期产出：形成可复述、可迁移、可回顾的知识结构。",
      "评估方式：通过路线图、诊断、复述和迁移练习持续检验。"
    ].join("\n")
  );

  if (suppliedTaskBrief) {
    assertUsableTaskBrief(taskBrief);
  }

  const guide = isRecord(value.guide) ? value.guide : null;
  if (!guide || !optionalText(guide.overview) || !textArray(guide.representativeQuestions).length || !isRecord(guide.suggestions)) {
    throw new AiTaskValidationError("入门导引缺少领域解释、代表问题或建议。");
  }
  return {
    taskBrief,
    guide: {overview:requiredText(guide.overview,""),representativeQuestions:textArray(guide.representativeQuestions),assumptions:textArray(guide.assumptions),suggestions:{goal:requiredText(guide.suggestions.goal,""),scope:requiredText(guide.suggestions.scope,""),excludedScope:requiredText(guide.suggestions.excludedScope,""),currentLevel:requiredText(guide.suggestions.currentLevel,"未知"),outputTarget:requiredText(guide.suggestions.outputTarget,"")}},
    summary: requiredText(
      value.summary,
      "先收敛目标、范围和评估方式，再推进后续学习设计。"
    ),
    successCriteria: textArray(value.successCriteria).slice(0, 6),
    risks: textArray(value.risks).slice(0, 6)
  };
}

export function buildCourseDesignPrompt(
  domain: {
    name: string;
    description?: string | null;
    currentLevel?: string | null;
    goal?: string | null;
    scope?: string | null;
    excludedScope?: string | null;
    depth?: string | null;
    outputType?: string | null;
    outputTarget?: string | null;
    taskBrief?: string | null;
  },
  feedback?: string | null
) {
  return `
Research and propose a course design direction before generating a domain map.
${curriculumBoundaryRules}

Domain data:
${JSON.stringify(domain, null, 2)}

User feedback for regeneration:
${feedback?.trim() || "None"}

Return only JSON with this shape:
{
  "taskBriefSnapshot": "the exact task brief snapshot used for this research",
  "courseDesignVersion": 3,
  "knowledgeBoundary": ${knowledgeBoundaryShape},
  "globalExplanation": {
    "theorySkeleton": "Chinese paragraph: the first-principles theoretical skeleton of the domain",
    "sourceBasis": "Chinese paragraph: which source links were used and why",
    "optimizationRationale": "Chinese paragraph: explicit ordering rationale — state the chosen topic sequence, why it beats the obvious alternative (e.g. the source skeleton order), and which optimization priority each decision serves",
    "risksAndValidation": "Chinese paragraph: what still needs diagnostic validation"
  },
  "sources": [
    {
      "url": "https://example.edu/course",
      "title": "source title",
      "reason": "short Chinese reason for adoption"
    }
  ],
  "keyTradeoffs": ["short Chinese tradeoff, each tagged with the optimization priority it serves: prerequisite correctness / goal match / cognitive load / authoritative course order / personalization"]
}

Research rules:
- Prefer famous university course designs first, then official documentation, textbooks, syllabi, and high-quality supplementary sources.
- Start from first principles: identify the basic objects, core questions, minimal prerequisite chain, generative concepts, tools/examples/boundaries, and orderings that would damage understanding if reversed.
- Use sources to challenge and correct the theoretical skeleton, not to average conflicting outlines.
- Apply the optimization priority in order when making any sequencing or tradeoff decision: prerequisite correctness first, then learner goal match, then cognitive load, then authoritative course order, then personalization for interest or style. This is a scoring requirement, not only a tie-breaker for conflicts.
- Every item in keyTradeoffs must name the optimization priority it serves (prerequisite correctness / goal match / cognitive load / authoritative course order / personalization) and state the concrete tradeoff.
- The optimizationRationale must give the ordering rationale: which sequence you chose, why it beats the obvious alternative (such as the source skeleton order), and how it respects the optimization priority above.
- Include source links and brief reasons only. Do not include long excerpts.
- Do not cite institutional homepages as course sources. Use specific course, syllabus, textbook, exam-outline, or official-document URLs. If a specific URL is unavailable, say so in risksAndValidation instead of inventing a source.
- Do not invent placeholder-looking URLs, fake book IDs, example domains, or guessed document pages.
- Do not provide stage-by-stage or node-by-node explanations here. Only provide the four global explanation paragraphs.
- Preserve uncertainty and list risks that should be checked by diagnostics.
- If live web search is unavailable in the model, say so in risksAndValidation and use only sources you can identify confidently.
`.trim();
}

export function buildCourseDesignRepairPrompt(input: {
  domain: {
    name: string;
    description?: string | null;
    currentLevel?: string | null;
    goal?: string | null;
    scope?: string | null;
    excludedScope?: string | null;
    depth?: string | null;
    outputType?: string | null;
    outputTarget?: string | null;
    taskBrief?: string | null;
  };
  draft: CourseDesignDraft;
  missing: string[];
}) {
  return `
Repair the course design research result so it passes the structural quality gate.
${curriculumBoundaryRules}

Domain data:
${JSON.stringify(input.domain, null, 2)}

Current draft:
${JSON.stringify(input.draft, null, 2)}

Missing or invalid fields:
${JSON.stringify(input.missing)}

Web search is enabled for this repair. Use it to replace missing or invalid evidence instead of merely rewriting sourceBasis.

Return only JSON with exactly this content shape (the server computes qualityGate separately):
{
  "taskBriefSnapshot": "the task brief used for research",
  "courseDesignVersion": 3,
  "knowledgeBoundary": ${knowledgeBoundaryShape},
  "globalExplanation": {
    "theorySkeleton": "Chinese paragraph",
    "sourceBasis": "Chinese paragraph that names the adopted sources and why",
    "optimizationRationale": "Chinese paragraph",
    "risksAndValidation": "Chinese paragraph"
  },
  "sources": [
    {
      "url": "concrete HTTPS URL for the real source page",
      "title": "source title",
      "reason": "short Chinese reason for adoption"
    }
  ],
  "keyTradeoffs": ["short Chinese tradeoff"]
}

Repair requirements:
- Fix every item listed in Missing or invalid fields. Do not preserve an empty or invalid field that the gate reported.
- When any source-related item is missing, perform web search and return 2-5 concrete HTTPS source objects in sources. Updating sourceBasis alone is not a repair.
- Source URLs must point to specific course, syllabus, textbook, exam-outline, or official-document pages, not institutional homepages, search result pages, placeholders, or guessed IDs.
- Prefer official documentation and recognizable university course pages that directly match the learner's scope.
- Keep valid parts of the draft unless they conflict with researched evidence.
- Do not invent source pages. If a trustworthy concrete page cannot be found, leave sources empty so the server keeps the result blocked.
- Do not include qualityGate, stages, modules, or learning nodes.
`.trim();
}

const parseGroundingInfo = (value: unknown): SourceGroundingInfo | null => {
  if (!isRecord(value)) return null;
  const relevanceValue = (value as Record<string, unknown>).relevance;
  let relevance: SourceGroundingRelevance | null = null;
  if (isRecord(relevanceValue)) {
    const rawScore =
      typeof relevanceValue.score === "number" ? relevanceValue.score : 0;
    relevance = {
      score: Math.max(0, Math.min(1, rawScore)),
      lowRelevance: relevanceValue.lowRelevance === true
    };
  } else if (relevanceValue !== undefined) {
    relevance = null;
  }
  return {
    ok: value.ok === true,
    status: typeof value.status === "number" ? value.status : null,
    title: optionalText(value.title),
    excerpt: optionalText(value.excerpt),
    relevance
  };
};

export const parseRouteQualityReport = (
  value: unknown
): RouteQualityReport | null => {
  if (!isRecord(value)) return null;
  const dimensions = asArray(value.dimensions)
    .map((dimensionValue) => {
      if (!isRecord(dimensionValue)) return null;
      const key = dimensionValue.key;
      if (
        typeof key !== "string" ||
        !routeQualityDimensionKeys.includes(key as RouteQualityDimensionKey)
      ) {
        return null;
      }
      const rawScore =
        typeof dimensionValue.score === "number" ? dimensionValue.score : 0;
      return {
        key: key as RouteQualityDimensionKey,
        score: Math.max(1, Math.min(5, Math.round(rawScore))),
        note: requiredText(dimensionValue.note, "暂无说明。")
      };
    })
    .filter(Boolean) as RouteQualityDimension[];
  if (dimensions.length === 0) return null;
  return {
    summary: requiredText(value.summary, "AI 未提供总体评价。"),
    significantIssues: value.significantIssues === true,
    dimensions
  };
};

export function validateCourseDesignDraft(value: unknown, requireBoundary = false): CourseDesignDraft {
  if (!isRecord(value)) {
    throw new AiTaskValidationError("Course design draft must be a JSON object.");
  }

  const explanationValue = isRecord(value.globalExplanation)
    ? value.globalExplanation
    : {};
  const globalExplanation = {
    theorySkeleton: requiredText(
      explanationValue.theorySkeleton,
      "该领域需要先从基本对象、核心问题和最小先修链建立理论骨架。"
    ),
    sourceBasis: requiredText(
      explanationValue.sourceBasis,
      "当前来源依据不足，需要补充大学课程、官方文档、教材或考纲链接。"
    ),
    optimizationRationale: requiredText(
      explanationValue.optimizationRationale,
      "排序应优先保证先修关系正确，再匹配用户目标、认知负担和权威课程顺序。"
    ),
    risksAndValidation: requiredText(
      explanationValue.risksAndValidation,
      "仍需通过诊断题检查用户当前水平、误区和迁移能力。"
    )
  };

  const sources = asArray(value.sources)
    .map((sourceValue) => {
      if (!isRecord(sourceValue)) return null;
      const url = optionalText(sourceValue.url);
      const reason = optionalText(sourceValue.reason);
      if (!url || !reason) return null;
      return {
        url,
        title: requiredText(sourceValue.title, url),
        reason,
        grounding: parseGroundingInfo(sourceValue.grounding)
      };
    })
    .filter(Boolean)
    .slice(0, 8) as CourseDesignSource[];

  const draftWithoutGate = {
    ...((requireBoundary || value.courseDesignVersion === 3) ? { courseDesignVersion: 3 as const } : {}),
    ...(value.knowledgeBoundary !== undefined ? { knowledgeBoundary: parseKnowledgeBoundary(value.knowledgeBoundary) } : {}),
    taskBriefSnapshot: requiredText(
      value.taskBriefSnapshot,
      "当前任务书尚未形成可用快照。"
    ),
    globalExplanation,
    sources,
    keyTradeoffs: textArray(value.keyTradeoffs).slice(0, 6)
  };

  return {
    ...draftWithoutGate,
    qualityGate: evaluateCourseDesignQuality(draftWithoutGate),
    qualityReport: parseRouteQualityReport(value.qualityReport)
  };
}

export type CourseDesignCritiqueResult = {
  report: RouteQualityReport;
  draft: CourseDesignDraft;
};

export function buildCourseDesignCritiquePrompt(input: {
  domain: {
    name: string;
    description?: string | null;
    currentLevel?: string | null;
    goal?: string | null;
    scope?: string | null;
    excludedScope?: string | null;
    depth?: string | null;
    outputType?: string | null;
    outputTarget?: string | null;
    taskBrief?: string | null;
  };
  draft: CourseDesignDraft;
  groundedSources: Array<{
    url: string;
    ok: boolean;
    status: number | null;
    title: string | null;
    excerpt: string | null;
    error?: string;
  }>;
}) {
  return `
You are a strict course-design critic. Review the course design draft below using the grounded source evidence, then return a quality report and a revised draft.
${curriculumBoundaryRules}
Preserve the course knowledgeBoundary, or revise it explicitly against the task and learner feedback. Never remove it. Foundation assumptions are not learner assessments.

Domain data:
${JSON.stringify(input.domain, null, 2)}

Current course design draft:
${JSON.stringify(input.draft, null, 2)}

Grounded source evidence fetched by the server (reachability and real page excerpts):
${JSON.stringify(input.groundedSources, null, 2)}

Score the draft on this fixed rubric, 1-5 each, with a short Chinese note:
- prerequisiteCorrectness: does the theory skeleton imply a correct minimal prerequisite chain, with no ordering that would damage understanding if reversed?
- goalMatch: does the design match the learner's goal, scope, excluded scope, level evidence, and expected output?
- cognitiveLoad: is the progression manageable, with generative concepts introduced before their applications?
- sourceQuality: are the sources reachable, concrete, relevant to this domain, and actually supporting the design? Unreachable or mismatched sources must be called out.
- checkability: can the learner's outcomes be verified through questions, outputs, or diagnostics?

Revision rules:
- Fix every weakness you identify, especially unreachable or irrelevant sources: replace them with concrete, relevant HTTPS sources using web search, or explicitly note in risksAndValidation why a source cannot be verified.
- Apply the optimization priority in order: prerequisite correctness first, then goal match, then cognitive load, then authoritative course order, then personalization.
- Check that every keyTradeoffs item names the optimization priority it serves (prerequisite correctness / goal match / cognitive load / authoritative course order / personalization); if any item omits its priority, revise it or call it out in the goalMatch or prerequisiteCorrectness note.
- Check that optimizationRationale states the ordering rationale (chosen sequence, why it beats the alternative, how it respects the optimization priority); if it only restates the tradeoff without explaining the sequence, flag it in the prerequisiteCorrectness or goalMatch note.
- Keep valid parts of the draft; do not rewrite for its own sake.
- Do not invent source pages or placeholder URLs. If no trustworthy page exists, say so in risksAndValidation.
- Do not include stages, modules, learning nodes, or qualityGate; the server computes the gate separately.
- Set significantIssues to true only when the revised draft still has material weaknesses the learner should know about.

Return only JSON with this shape:
{
  "report": {
    "summary": "2-4 Chinese sentences summarizing the critique",
    "significantIssues": false,
    "dimensions": [
      { "key": "prerequisiteCorrectness", "score": 4, "note": "short Chinese note" },
      { "key": "goalMatch", "score": 4, "note": "short Chinese note" },
      { "key": "cognitiveLoad", "score": 4, "note": "short Chinese note" },
      { "key": "sourceQuality", "score": 4, "note": "short Chinese note" },
      { "key": "checkability", "score": 4, "note": "short Chinese note" }
    ]
  },
  "draft": {
    "taskBriefSnapshot": "the task brief used for research",
    "courseDesignVersion": 3,
    "knowledgeBoundary": ${knowledgeBoundaryShape},
    "globalExplanation": {
      "theorySkeleton": "Chinese paragraph",
      "sourceBasis": "Chinese paragraph naming the adopted sources and why",
      "optimizationRationale": "Chinese paragraph",
      "risksAndValidation": "Chinese paragraph"
    },
    "sources": [
      { "url": "concrete HTTPS URL", "title": "source title", "reason": "short Chinese reason" }
    ],
    "keyTradeoffs": ["short Chinese tradeoff"]
  }
}
`.trim();
}

export function validateCourseDesignCritique(
  value: unknown, requireBoundary = false
): CourseDesignCritiqueResult {
  if (!isRecord(value)) {
    throw new AiTaskValidationError("Course design critique must be a JSON object.");
  }
  const report = parseRouteQualityReport(value.report);
  if (!report) {
    throw new AiTaskValidationError(
      "Course design critique must include a valid quality report."
    );
  }
  if (!("draft" in value)) {
    throw new AiTaskValidationError(
      "Course design critique must include a revised draft."
    );
  }
  return {
    report,
    draft: validateCourseDesignDraft(value.draft, requireBoundary)
  };
}

export type SourceRelevanceCheckJudgment = {
  url: string;
  score: number;
  lowRelevance: boolean;
  reason: string;
};

export type SourceRelevanceCheckResult = {
  judgments: SourceRelevanceCheckJudgment[];
};

export function buildSourceRelevanceCheckPrompt(input: {
  domain: {
    name: string;
    scope?: string | null;
    goal?: string | null;
  };
  sources: Array<{
    url: string;
    title: string | null;
    excerpt: string | null;
  }>;
}) {
  return `
You are a source-relevance reviewer for a personal learning system. For each grounded course source below, judge how relevant its real fetched content is to the learner's stated domain.

Learning domain:
${JSON.stringify(input.domain, null, 2)}

Grounded source evidence (server-fetched title and excerpt; reachability already verified):
${JSON.stringify(input.sources, null, 2)}

For every source in the list, return a relevance judgment:
- score: a number from 0 to 1 (0 = clearly unrelated, 1 = directly on-topic for this domain).
- lowRelevance: set true when the source is only tangentially related or off-topic for this learner's goal; false when it clearly supports the domain.
- reason: one short Chinese sentence explaining the judgment, citing the domain goal or the source's actual content.

Rules:
- Judge based only on the provided title and excerpt; do not invent content.
- Return exactly one judgment per source url; do not drop or add sources.
- Keep reason to one short Chinese sentence; do not include long excerpts.

Return only JSON with this shape:
{
  "judgments": [
    { "url": "https://example.edu/course", "score": 0.8, "lowRelevance": false, "reason": "短中文理由" }
  ]
}
`.trim();
}

export function validateSourceRelevanceCheck(
  value: unknown
): SourceRelevanceCheckResult {
  if (!isRecord(value)) {
    throw new AiTaskValidationError(
      "Source relevance check must be a JSON object."
    );
  }
  const judgments = asArray(value.judgments)
    .map((judgmentValue) => {
      if (!isRecord(judgmentValue)) return null;
      const url = optionalText(judgmentValue.url);
      if (!url) return null;
      const rawScore =
        typeof judgmentValue.score === "number" ? judgmentValue.score : 0;
      const score = Math.max(0, Math.min(1, rawScore));
      const explicitLow = judgmentValue.lowRelevance === true;
      return {
        url,
        score,
        lowRelevance: explicitLow || score < LOW_RELEVANCE_THRESHOLD,
        reason: requiredText(judgmentValue.reason, "AI 未提供相关性说明。")
      };
    })
    .filter(Boolean) as SourceRelevanceCheckJudgment[];
  if (judgments.length === 0) {
    throw new AiTaskValidationError(
      "Source relevance check must include at least one judgment."
    );
  }
  return { judgments };
}

export function buildRoadmapPrompt(domain: {
  name: string;
  description?: string | null;
  currentLevel?: string | null;
  goal?: string | null;
  scope?: string | null;
  excludedScope?: string | null;
  depth?: string | null;
  outputType?: string | null;
  outputTarget?: string | null;
  taskBrief?: string | null;
}, courseDesign?: CourseDesignDraft | null) {
  return `
Generate a structured learning roadmap draft for this learning domain.

Domain data:
${JSON.stringify(domain, null, 2)}

Confirmed course design direction:
${JSON.stringify(courseDesign || null, null, 2)}

Return only JSON with this shape:
{
  "title": "string",
  "status": "draft",
  "stages": [
    {
      "title": "string",
      "goal": "string",
      "modules": [
        {
          "title": "string",
          "goal": "string",
          "conceptReferences": [${conceptReferenceShape}],
      "items": [
            {
              "title": "string",
              "keyQuestion": "string",
              "objective": "string",
              "prerequisite": "string",
              "commonMistake": "string",
              "transferPrompt": "string",
              "status": "not_started"
            }
          ]
        }
      ]
    }
  ]
}

Requirements:
- Keep the roadmap feasible for a first learning loop.
- If a confirmed course design direction is provided, follow its theory skeleton, source basis, optimization rationale, and risk notes.
- Use stages -> modules -> knowledge items, not Markdown.
- Every item must include a key question and one checkable outcome in objective, plus prerequisite, common mistake, and transfer prompt.
- Include transfer prompts that train cross-knowledge and cross-discipline thinking.
- Do not invent fake facts. If scope is unclear, encode conservative assumptions in goals.
- This is a draft for user review, not a final authority.
`.trim();
}

export function buildRoadmapSkeletonPrompt(domain: {
  name: string;
  description?: string | null;
  currentLevel?: string | null;
  goal?: string | null;
  scope?: string | null;
  excludedScope?: string | null;
  depth?: string | null;
  outputType?: string | null;
  outputTarget?: string | null;
  taskBrief?: string | null;
}, courseDesign?: CourseDesignDraft | null) {
  return `
Generate only the global semantic skeleton for a structured learning roadmap.
${curriculumBoundaryRules}

HARD CONTRACT: return planningVersion=3 and contentCoverageVersion=1. Register concrete contentQuestions under each learningGoal. Every Stage MUST contain a non-empty moduleBlueprints array. Every Module blueprint MUST contain a stable key, title, goal (content scope), and non-empty keyQuestions references with stable keys and contentQuestionKey. The server resolves their text, requirements and dimensions and computes parent coverage. A Stage that only has coreTopics is invalid. Do not return Stage fields named modules or items; moduleBlueprints is the only allowed Module-level field in this pass.

Domain data:
${JSON.stringify(domain, null, 2)}

Confirmed course design direction:
${JSON.stringify(courseDesign || null, null, 2)}

Return only JSON with this shape:
{
  "planningVersion": 3,
  "contentCoverageVersion": 1,
  "learningGoals": [{"key":"goal-1","description":"a concrete Domain learning goal","contentQuestions":[{"key":"content-1","question":"one specific question the course must explain","contentRequirements":["the explanation/example/conditions the material must provide"],"dimensionKeys":["definition","boundaries"]}]}],
  "title": "string",
  "status": "draft",
  "stages": [
    {
      "key": "stable-short-key",
      "title": "string",
      "goal": "string",
      "problem": {"question":"representative whole problem of this stage","steps":["identify the question","reason or act using the concepts","interpret the result"]},
      "coreTopics": ["short topic names"],
      "prerequisiteStageTitles": ["exact title of prerequisite stages"],
      "prerequisiteStageKeys": ["exact key of prerequisite stages"],
      "moduleBlueprints": [
        {
          "key": "stable-module-key",
          "title": "string",
          "goal": "one learner-facing Module content scope",
          "keyQuestions": [
            {
              "key": "stable-planning-question-key",
              "contentQuestionKey": "content-1"
            }
          ]
        }
      ]
    }
  ]
}

Requirements:
- This first pass includes all course stages, Module directions, critical content questions and explicit prerequisites, without concept nodes or lesson bodies. Preserve the learner's goal and scope. Register a finite set of specific questions, not generic labels such as "understand" or "can use". Every goal has at least one content question; every registered question is arranged in a Module. Do not pad fixed counts.
- contentQuestions keys are unique across the whole course. A keyQuestions entry references exactly one registered contentQuestionKey, using its own unique stable planning-question key. Repeated use of a content question is allowed when useful, without duplicating the registration. Do not return Stage/Module/question goalKeys or checkableOutcome; the server computes them. Parent summaries cannot constrain the registry.
- contentRequirements describe what MATERIAL must explain, demonstrate, compare or delimit. They never require learner submissions, exam scores, AI grading, proof of mastery or a Stage learning-outcome review. Use only nine dimensionKeys: definition, motivation, use, significance, relations, role, mechanism, boundaries, selection. Choose relevant dimensions intentionally; not every question needs all nine.
- Thinking tasks may be skipped freely. Never make skipped thinking require diagnostic evidence or block learning or sedimentation. Personal self-explanations are saved and confirmed by the learner, without AI review.
- Return no more than 16 Stages. If the subject naturally has more sections, merge adjacent sections into coherent expandable Stages instead of exceeding this limit.
- Give every stage a unique, stable key that is not derived from its display title later.
- Give every Module direction and key question a unique stable key. Keys must not change when display text is edited later.
- Content questions must cover the Domain goal and scope through the selected theory skeleton and grounded sources. Include foundational objects or mechanisms, method-selection conditions, boundaries or misconceptions, and application where relevant. Flag scope and source gaps rather than inventing certainty.
- Keep each content question centered on one specific teaching problem and pair it with concrete material requirements. Split independent problems instead of joining them with multiple clauses.
- Do not satisfy quality by padding a fixed count. One focused content question is valid when it truly covers the Module scope; several are required for independent teaching problems. Definition, use and boundaries of the same concept may remain under one question with explicit material requirements.
- When a Module scope contains independent teaching problems, arrange each using registered content-question references. Check foundations, mechanisms, method-selection conditions, boundaries, misconceptions and application where relevant; do not replace material requirements with learner outcome assessments.
- Do not generate Learning Nodes, exercises, common mistakes, transfer prompts, node prerequisites, or detailed teaching content in this pass.
- Keep stages in prerequisite order so later batch requests can expand one stage at a time.
- If a confirmed course design direction is provided, follow its theory skeleton, source basis, optimization rationale, and risk notes.
- Preserve uncertainty. If scope is unclear, encode conservative assumptions in stage goals.
- This is a draft skeleton for later batch expansion, not the final detailed roadmap.
`.trim();
}

export function validateRoadmapSkeletonDraft(value: unknown): RoadmapSkeletonDraft {
  if(isRecord(value) && value.contentCoverageVersion !== undefined && value.contentCoverageVersion !== 1) throw new AiTaskValidationError("内容覆盖协议版本不支持。",[{code:"invalid_content_coverage_version",path:"contentCoverageVersion",message:"新内容覆盖契约必须使用版本1。"}]);
  if (!isRecord(value)) {
    throw new AiTaskValidationError("Roadmap skeleton must be a JSON object.");
  }

  const planningVersion = value.planningVersion === 3 ? 3 : undefined;
  const stages = asArray(value.stages).map((stageValue, stageIndex) => {
    if (!isRecord(stageValue)) {
      throw new AiTaskValidationError(`Skeleton stage ${stageIndex + 1} must be an object.`);
    }
    const hasGeneratedModules =
      "modules" in stageValue &&
      (!Array.isArray(stageValue.modules) || stageValue.modules.length > 0);
    const hasGeneratedItems =
      "items" in stageValue &&
      (!Array.isArray(stageValue.items) || stageValue.items.length > 0);
    if (hasGeneratedModules || hasGeneratedItems) {
      throw new AiTaskValidationError(
        `Skeleton stage ${stageIndex + 1} must not include generated modules or items.`
      );
    }

    const moduleBlueprints = asArray(stageValue.moduleBlueprints)
      .slice(0, 12)
      .map((moduleValue, moduleIndex): RoadmapModuleBlueprint => {
        if (!isRecord(moduleValue)) {
          throw new AiTaskValidationError(
            `Module blueprint ${moduleIndex + 1} in skeleton stage ${stageIndex + 1} must be an object.`
          );
        }
        const keyQuestions = asArray(moduleValue.keyQuestions)
          .slice(0, 24)
          .map((questionValue, questionIndex): RoadmapModuleKeyQuestion => {
            if (!isRecord(questionValue)) {
              throw new AiTaskValidationError(
                `Key question ${questionIndex + 1} in Module blueprint ${moduleIndex + 1} must be an object.`
              );
            }
            return {
              key: optionalText(questionValue.key) || "",
              ...(optionalText(questionValue.contentQuestionKey) ? {contentQuestionKey:optionalText(questionValue.contentQuestionKey)!} : {}),
              goalKeys: textArray(questionValue.goalKeys),
              question: optionalText(questionValue.question) || "",
              checkableOutcome:
                optionalText(questionValue.checkableOutcome) || ""
            };
          });
        return {
          key: optionalText(moduleValue.key) || "",
          title: optionalText(moduleValue.title) || "",
          goal: optionalText(moduleValue.goal) || "",
          goalKeys: textArray(moduleValue.goalKeys),
          keyQuestions
        };
      });

    return {
      key: requiredText(stageValue.key, `stage-${stageIndex + 1}`),
      title: requiredText(stageValue.title, `Stage ${stageIndex + 1}`),
      goal: optionalText(stageValue.goal),
      goalKeys: textArray(stageValue.goalKeys),
      problem: parseProblem(stageValue.problem),
      coreTopics: textArray(stageValue.coreTopics).slice(0, 12),
      prerequisiteStageTitles: textArray(stageValue.prerequisiteStageTitles).slice(0, 8),
      prerequisiteStageKeys: textArray(stageValue.prerequisiteStageKeys).slice(0, 8),
      ...(planningVersion === 3 ? { moduleBlueprints } : {})
    };
  });

  if (stages.length === 0) {
    throw new AiTaskValidationError("Roadmap skeleton must include at least one stage.");
  }

  if(planningVersion===3) {
    try { validateConceptGoals({learningGoals:parseGoals(value.learningGoals),stages,contentCoverageVersion:value.contentCoverageVersion === 1 ? 1 : undefined}); }
    catch(error) { throw new AiTaskValidationError(error instanceof Error ? error.message : "目标覆盖关系无效。", validationIssues(error)); }
  }
  const determinism = checkRoadmapSkeletonDeterminism({
    title: requiredText(value.title, "AI roadmap skeleton draft"),
    status: "draft",
    planningVersion,
    stages
  });
  if (determinism.errors.length > 0) {
    throw new AiTaskValidationError(
      `Roadmap skeleton failed determinism checks: ${determinism.errors
        .map((issue) => issue.message)
        .join(" ")}`
    );
  }

  const layered =
    planningVersion === 3
      ? checkLayeredRoadmapSkeleton({
          planningVersion: 3,
          title: requiredText(value.title, "AI roadmap skeleton draft"),
          status: "draft",
          stages: stages.map((stage) => ({
            ...stage,
            moduleBlueprints: stage.moduleBlueprints || []
          }))
        })
      : null;
  if (layered?.errors.length) {
    throw new AiTaskValidationError(
      `Layered roadmap skeleton failed coverage checks: ${layered.errors
        .map((issue) => issue.message)
        .join(" ")}`
    );
  }

  return {
    title: requiredText(value.title, "AI roadmap skeleton draft"),
    status: "draft",
    ...(value.contentCoverageVersion === 1 || parseGoals(value.learningGoals).some(goal=>goal.contentQuestions !== undefined) ? {contentCoverageVersion:1 as const} : {}),
    ...(planningVersion === 3 ? { planningVersion: 3 as const, learningGoals: parseGoals(value.learningGoals) } : {}),
    stages,
    determinismWarnings:
      determinism.warnings.length > 0 ? determinism.warnings : undefined,
    planningWarnings:
      layered && layered.warnings.length > 0 ? layered.warnings : undefined
  };
}

function parseMapDraftQualityFinding(
  value: unknown,
  fallbackCode: string
): MapDraftQualityFinding | null {
  if (!isRecord(value)) return null;
  const message = optionalText(value.message);
  if (!message) return null;
  return {
    code: requiredText(value.code, fallbackCode),
    targetKey: optionalText(value.targetKey),
    message,
    suggestion: optionalText(value.suggestion),
    ...(isRecord(value.evidence) ? { evidence: { draftExcerpt: requiredText(value.evidence.draftExcerpt, ""), requirement: requiredText(value.evidence.requirement, ""), impact: requiredText(value.evidence.impact, "") } } : {})
  };
}

export function validateMapDraftQualityReport(
  value: unknown
): MapDraftQualityReport {
  if (!isRecord(value)) {
    throw new AiTaskValidationError("Map Draft quality report must be an object.");
  }
  const blockingIssues = asArray(value.blockingIssues)
    .map((finding) => parseMapDraftQualityFinding(finding, "criticalIssue"))
    .filter((finding): finding is MapDraftQualityFinding => Boolean(finding));
  const warnings = asArray(value.warnings)
    .map((finding) => parseMapDraftQualityFinding(finding, "advisoryIssue"))
    .filter((finding): finding is MapDraftQualityFinding => Boolean(finding));
  return {
    ...(value.reviewPolicyVersion === 1 ? { reviewPolicyVersion: 1 as const } : {}),
    status: blockingIssues.length ? "blocked" : "passed",
    summary: requiredText(value.summary, "路线质量复审未提供摘要。"),
    blockingIssues,
    warnings
  };
}

export function buildRoadmapSkeletonCritiquePrompt(input: {
  domain: {
    name: string;
    description?: string | null;
    currentLevel?: string | null;
    goal?: string | null;
    scope?: string | null;
    excludedScope?: string | null;
    depth?: string | null;
    outputType?: string | null;
    outputTarget?: string | null;
    taskBrief?: string | null;
  };
  courseDesign: CourseDesignDraft;
  skeleton: RoadmapSkeletonDraft;
  deterministicIssues?: RoadmapPlanningIssue[];
}) {
  return `
Independently review this layered roadmap skeleton. Report findings only; do not rewrite the draft. Review concrete content-question coverage against scope and actual sources, unjustified prerequisites and whole-problem roles. Do not evaluate learner self-explanations or Stage learning outcomes. contentRequirements describe teaching materials, not learner submissions. Parent goalKeys are server-computed summaries. Do not demand one node per question or a fixed node/question density; one concept may answer multiple questions. Skipping thinking is free and never requires diagnostic evidence.

Domain data:
${JSON.stringify(input.domain, null, 2)}

Confirmed Course Design Direction with grounded source evidence:
${JSON.stringify(input.courseDesign, null, 2)}

Layered skeleton draft:
${JSON.stringify(input.skeleton, null, 2)}

Deterministic risk signals:
${JSON.stringify(input.deterministicIssues || [], null, 2)}

Return only JSON with this shape:
{
  "report": {
    "reviewPolicyVersion": 1,
    "summary": "short Chinese review summary",
    "blockingIssues": [
      {
        "code": "one of the serious codes below",
        "targetKey": "existing goal, content-question, Stage, Module, or planning-question key",
        "message": "specific critical defect",
        "suggestion": "specific repair",
        "evidence": {"draftExcerptIndex":0,"requirement":"existing violated requirement","impact":"concrete serious teaching consequence"}
      }
    ],
    "warnings": [
      {
        "code": "optionalEnrichment | densityBalance | alternativeOrdering",
        "targetKey": "exact key or null",
        "message": "non-blocking concern",
        "suggestion": "optional improvement"
      }
    ]
  }
}

Review rules:
- In contentCoverageVersion=1, review the concrete contentQuestions registry and its material requirements, not learner performance. goalKeys are computed summaries. Never demand Stage learning-outcome grading, review a personal self-explanation, or require diagnostic evidence when a learner skips thinking. Judge actual teaching coverage and sources, not goal-label repetition.
- Review scopeCoverage, Module boundaries, teaching coherence, prerequisiteCorrectness, goal alignment, cognitive load, and checkability against the confirmed Course Design Direction and grounded evidence.
- Warnings cover optional enrichment, density balance, or credible alternative ordering that does not make the route unsafe to confirm.
- Do not use a minimum question count. Grouped content can be decomposed when the Stage is expanded; do not reject a usable blueprint because it could be more detailed.
- Judge only the supplied skeleton. Do not return a revised draft and do not claim that a finding was repaired.
- Do not generate Learning Nodes or detailed Stage content.
${curriculumBoundaryRules}
When revising concept nodes, preserve learningUnit; new nodes use ${learningUnitShape}. Old readable nodes lacking this field are not by themselves serious content defects. Report-only review does not rewrite nodes.
${criticalReviewRules}
Valid target excerpt catalog (use targetKey + evidence.draftExcerptIndex; do not copy JSON syntax):
${JSON.stringify(criticalPlanningTargets(input.skeleton))}
`.trim();
}

export function buildRoadmapSkeletonRepairPrompt(
  input: Parameters<typeof buildRoadmapSkeletonCritiquePrompt>[0] & {
    previousReport: MapDraftQualityReport;
  }
) {
  return `
Repair this layered roadmap skeleton using the independent review. This call edits the draft and then reports only defects that remain in the returned draft.

Domain data:
${JSON.stringify(input.domain, null, 2)}

Confirmed Course Design Direction:
${JSON.stringify(input.courseDesign, null, 2)}

Current skeleton draft:
${JSON.stringify(input.skeleton, null, 2)}

Independent review to repair:
${JSON.stringify(input.previousReport, null, 2)}

Deterministic risk signals:
${JSON.stringify(input.deterministicIssues || [], null, 2)}

Return only JSON with this shape:
{
  "report": {
    "reviewPolicyVersion": 1,
    "summary": "final revised draft state",
    "blockingIssues": [],
    "warnings": []
  },
  "contentRevisions": [],
  "draft": { "planningVersion": 3, "contentCoverageVersion":1, "learningGoals": [{"key":"existing goal key","description":"unchanged goal description","contentQuestions":[{"key":"stable content key","question":"revised content question if needed","contentRequirements":["material requirement"],"dimensionKeys":["definition"]}]}], "title": "string", "status": "draft", "stages": [] }
}

Repair rules:
- Fix supported serious blockers without adding padding or content outside the confirmed scope. Optional warnings do not require repair.
- Preserve stable keys for unchanged semantic content. New Module directions or planning questions need new stable keys.
- Do not generate Learning Nodes or detailed Stage content.
- Re-evaluate the exact draft you return. blockingIssues must contain only defects still present in that returned draft; remove resolved findings.
- Preserve planningVersion=3 and contentCoverageVersion=1. Omit server-derived goalKeys. Preserve representative problems and stable keys. Do not grade learner self-explanations or mark the draft confirmed.
${contentRevisionRules}
${curriculumBoundaryRules}
When revising concept nodes, preserve learningUnit; new nodes use ${learningUnitShape}. Old readable nodes lacking this field are not by themselves serious content defects. Report-only review does not rewrite nodes.
${criticalReviewRules}
`.trim();
}

export function validateRoadmapSkeletonReview(value: unknown, draft?: RoadmapSkeletonDraft) {
  if (!isRecord(value)) {
    throw new AiTaskValidationError("Roadmap skeleton review must be an object.");
  }
  return validateCriticalPlanningReport(value.report, draft);
}

export function validateRoadmapSkeletonCritique(
  value: unknown,
  baseline?: RoadmapSkeletonDraft
): RoadmapSkeletonCritique {
  if (!isRecord(value)) {
    throw new AiTaskValidationError("Roadmap skeleton critique must be an object.");
  }
  const draft = validateRoadmapSkeletonDraft(value.draft);
  const contentRevisions = baseline ? validateContentRevisions(baseline.learningGoals, draft.learningGoals, value.contentRevisions) : [];
  if (draft.planningVersion !== 3) {
    throw new AiTaskValidationError(
      "Roadmap skeleton critique must preserve planningVersion=3."
    );
  }
  return {
    report: { ...validateCriticalPlanningReport(value.report, draft), ...(contentRevisions.length ? { contentRevisions } : {}) },
    draft
  };
}

export function buildMapDraftQualityReviewPrompt(input: {
  domain: Record<string, unknown>;
  courseDesign: CourseDesignDraft;
  draft: unknown;
  scope: "skeleton" | "stage" | "map";
  previousReport?: MapDraftQualityReport | null;
}) {
  return `
Independently review this persisted planningVersion=3 Map Draft. Report findings only; do not rewrite the draft.

Review scope: ${input.scope}

Domain data:
${JSON.stringify(input.domain, null, 2)}

Confirmed Course Design Direction with grounded source evidence:
${JSON.stringify(input.courseDesign, null, 2)}

Persisted Map Draft:
${JSON.stringify(input.draft, null, 2)}

Previous unresolved report (null on the first review):
${JSON.stringify(input.previousReport || null, null, 2)}

Return only JSON with this shape:
{
  "report": {
    "reviewPolicyVersion": 1,
    "summary": "short Chinese review summary",
    "blockingIssues": [
      {
        "code": "one of the serious codes below",
        "targetKey": "exact Stage, Module, planning-question, or Learning Node key",
        "message": "specific critical defect",
        "suggestion": "specific repair",
        "evidence": {"draftExcerptIndex":0,"requirement":"existing violated requirement","impact":"concrete serious teaching consequence"}
      }
    ],
    "warnings": []
  }
}

Review rules:
- For contentCoverageVersion=1, trace learningGoals/contentQuestions through Module contentQuestionKey references and concepts to concrete nine-dimension material requirements. goalKeys are server-computed summaries. Never demand Stage learning-outcome grading, review a personal self-explanation, or require diagnostic evidence when thinking is skipped. Judge teaching coverage and sources, not repeated goal labels or learner performance.
- Check scope coverage, Module boundaries, teaching coherence, prerequisite correctness, goal alignment, cognitive load, and checkability against the confirmed Course Design Direction.
- A planned Stage is complete at blueprint level when its Module blueprints, concrete content-question references, material requirements, and Stage prerequisites are present. Legacy checkableOutcome is a material-requirement summary in the new protocol, not a learner assessment. Never report stageCoverage merely because a planned Stage has no Learning Nodes. Apply Learning Node coverage checks only to expanded Stages.
- Every Learning Node must have a coherent explicit teaching scope. Related concepts, principles or methods may be taught together; assess their concrete meanings, conditions, differences and uses rather than concept count. A broad heading without actual teaching tasks is insufficient. Definition/use/selection questions for the SAME concept belong to one node via planningQuestionKeys; a concept may cover multiple questions. Detect synonym duplicates and reuse existing stable keys through conceptReferences. Every planned question must be covered by a concept or reference. Check content-question arrangements and each concept's role in the representative whole problem. For an old draft without a registry, retain its existing goalKeys consistency checks.
- Do not use a minimum Stage, Module, question, or Learning Node count. Split or add content only for distinct required outcomes; remove padding.
- Do not require splitting merely because a unit contains multiple concepts. Judge teaching sufficiency and prerequisite continuity from actual content and prior-to-use tasks, not node/question ratios.
- Judge only the supplied draft. Do not return a revised draft and do not claim that a finding was repaired.
${curriculumBoundaryRules}
When revising concept nodes, preserve learningUnit; new nodes use ${learningUnitShape}. Old readable nodes lacking this field are not by themselves serious content defects. Report-only review does not rewrite nodes.
${criticalReviewRules}
Valid target excerpt catalog (use targetKey + evidence.draftExcerptIndex; do not copy JSON syntax):
${JSON.stringify(criticalPlanningTargets(input.draft))}
`.trim();
}

export function buildMapDraftQualityRepairPrompt(
  input: Parameters<typeof buildMapDraftQualityReviewPrompt>[0] & {
    previousReport: MapDraftQualityReport;
  }
) {
  return `
Repair this persisted planningVersion=3 Map Draft using the independent semantic review. This call edits the draft and then reports only defects that remain in the returned draft.

Review scope: ${input.scope}

Domain data:
${JSON.stringify(input.domain, null, 2)}

Confirmed Course Design Direction:
${JSON.stringify(input.courseDesign, null, 2)}

Current Map Draft:
${JSON.stringify(input.draft, null, 2)}

Independent review to repair:
${JSON.stringify(input.previousReport, null, 2)}

Return only JSON with this shape:
{
  "report": {
    "reviewPolicyVersion": 1,
    "summary": "final revised draft state",
    "blockingIssues": [],
    "warnings": []
  },
  "contentRevisions": [],
  "draft": { "planningVersion": 3, "contentCoverageVersion":1, "learningGoals": [{"key":"existing goal key","description":"unchanged goal description","contentQuestions":[{"key":"stable content key","question":"revised question if needed","contentRequirements":["material requirement"],"dimensionKeys":["definition"]}]}], "title": "string", "status": "draft", "baseRevision": 0, "stages": [] }
}

Repair rules:
- A planned Stage is complete at blueprint level. Never add Learning Nodes merely to satisfy coverage; apply Learning Node coverage only to expanded Stages.
- Fix supported serious blockers. Keep optional improvements as warnings without repeatedly expanding the course.
- Preserve every Stage stable key and its current planned/expanded state. Never expand a planned Stage or collapse an expanded Stage during repair.
- Preserve stable keys for unchanged semantic content, keep baseRevision unchanged, and do not mark the draft confirmed.
- Preserve the course goal keys and descriptions. Parent goalKeys are server computed. For an old draft without a content registry, preserve its original legacy contract instead of inventing a registry.
- Re-evaluate the exact draft you return. blockingIssues must contain only defects still present in that returned draft; remove resolved findings.
${contentRevisionRules}
${curriculumBoundaryRules}
When revising concept nodes, preserve learningUnit; new nodes use ${learningUnitShape}. Old readable nodes lacking this field are not by themselves serious content defects. Report-only review does not rewrite nodes.
${criticalReviewRules}
`.trim();
}

export function buildRoadmapStageQualityRepairPrompt(
  input: Parameters<typeof buildMapDraftQualityRepairPrompt>[0] & {
    draft: RoadmapInput;
    stageKey: string;
  }
) {
  const stage = input.draft.stages?.find(entry => entry.key === input.stageKey);
  if (!stage || stage.status !== "expanded") {
    throw new Error("只能修复当前草稿中已展开的目标阶段。");
  }
  const editableStage = {
    key: stage.key, title: stage.title, goal: stage.goal, goalKeys: stage.goalKeys,
    problem: stage.problem, status: stage.status, rationale: stage.rationale,
    moduleDirections: stage.moduleDirections, moduleBlueprints: stage.moduleBlueprints,
    prerequisiteStageKeys: stage.prerequisiteStageKeys, modules: stage.modules
  };
  const otherStages = (input.draft.stages || []).filter(entry => entry.key !== input.stageKey).map(entry => ({
    key: entry.key, title: entry.title, goal: entry.goal, goalKeys: entry.goalKeys,
    problem: entry.problem, status: entry.status, prerequisiteStageKeys: entry.prerequisiteStageKeys,
    moduleBlueprints: entry.moduleBlueprints,
    concepts: (entry.modules || []).flatMap(module => (module.items || []).map(item => ({
      key: item.key, title: item.title, concept: item.concept, prerequisiteKeys: item.prerequisiteKeys
    })))
  }));
  return `
Repair ONLY the expanded Stage with key ${JSON.stringify(input.stageKey)} using the semantic review. The server merges this Stage into its current complete Map Draft and validates the whole map. Other Stages and course goals are read-only context.

Domain data:
${JSON.stringify(input.domain, null, 2)}

Confirmed Course Design Direction:
${JSON.stringify(input.courseDesign, null, 2)}

Read-only course goals (learningGoals):
${JSON.stringify(input.draft.learningGoals, null, 2)}

Read-only other Stages and known concepts:
${JSON.stringify(otherStages, null, 2)}

Current Stage to repair:
${JSON.stringify(editableStage, null, 2)}

Independent review to repair:
${JSON.stringify(input.previousReport, null, 2)}

Return ONLY JSON with these two top-level fields:
{
  "report": {"reviewPolicyVersion":1,"summary":"state of the merged map after this local repair","blockingIssues":[],"warnings":[]},
  "stage": {
    "key": ${JSON.stringify(stage.key)}, "title":"string", "goal":"string",
    "problem":{"question":"representative whole problem","steps":["problem-processing step"]},
    "status":"expanded", "rationale":"what changed and why",
    "moduleDirections":["direction"],
    "moduleBlueprints":[{
      "key":"stable module key", "title":"string", "goal":"content scope",
      "keyQuestions":[{"key":"stable planning question key","contentQuestionKey":"existing content question key"}]
    }],
    "prerequisiteStageKeys":["genuine prerequisite Stage key"],
    "modules":[{
      "title":"string", "goal":"string", "conceptReferences":[],
      "items":[{
        "key":"stable concept key", "title":"string", "keyQuestion":"string", "objective":"checkable outcome",
        "planningQuestionKeys":["current Stage question key"],
        "concept":{"name":"scoped teaching unit","aliases":[],"scope":"lesson boundary","problemRole":"whole-problem role","learningUnit":${learningUnitShape}},
        "prerequisite":"string", "commonMistake":"string", "transferPrompt":"string",
        "prerequisiteKeys":[], "status":"not_started"
      }]
    }]
  }
}

Repair rules:
- Never return draft, stages, learningGoals, planningVersion, contentCoverageVersion, baseRevision, database IDs or other map metadata. Course goals and contentQuestions are read-only, preserved by the server. Use existing contentQuestionKey references; the server computes goalKeys and resolves the question text, material requirements and dimensions. An old Stage without a registry must retain its original goalKeys/question/checkableOutcome fields instead.
- Return the complete repaired Stage, including problem, moduleBlueprints and modules. Preserve its key and expanded state. Preserve stable keys for unchanged concepts and questions; never duplicate a known concept.
- Change only this Stage. Fix supported serious blockers here; optional warnings do not require repair. Findings explicitly targeting unchanged other Stages must remain in report; do not claim they were repaired or hide them. A global problem may need a separate whole-map review.
- Keep learningGoals → Stage goalKeys → Module goalKeys → question goalKeys valid. Cover all Stage questions with coherent teaching units or conceptReferences. A reused concept uses ${conceptReferenceShape}; never edit its source node. contentContributions selects its part of the assigned questions, not every dimension of each question.
- Keep only genuine prerequisites; multiple roots and parallel concepts are valid. Presentation order or concept reuse is never a dependency.
- An introduction to a concept's later use is allowed. Do not require the learner to execute a later method before it is taught. Preserve the distinction between associations/whole-problem position and prerequisite mastery.
- Re-evaluate the merged map's remaining findings. Do not mark a draft confirmed, certify teaching correctness, or add content outside the confirmed scope.
${curriculumBoundaryRules}
When revising concept nodes, preserve learningUnit; new nodes use ${learningUnitShape}. Old readable nodes lacking this field are not by themselves serious content defects. Report-only review does not rewrite nodes.
${criticalReviewRules}
`.trim();
}

export function validateMapDraftQualityReview(value: unknown, draft?: RoadmapInput) {
  if (!isRecord(value)) {
    throw new AiTaskValidationError("Map Draft quality review must be an object.");
  }
  return validateCriticalPlanningReport(value.report, draft);
}

export function buildRoadmapStagePrompt(input: {
  domain: {
    name: string;
    description?: string | null;
    currentLevel?: string | null;
    goal?: string | null;
    scope?: string | null;
    excludedScope?: string | null;
    depth?: string | null;
    outputType?: string | null;
    outputTarget?: string | null;
    taskBrief?: string | null;
  };
  courseDesign?: CourseDesignDraft | null;
  skeleton: RoadmapSkeletonDraft;
  stage: RoadmapSkeletonStage;
  stageIndex: number;
  knownConcepts?: Array<{key:string;title:string;concept:unknown}>;
  learningContext?: Array<{
    title: string;
    status: string;
    userUnderstanding: string | null;
  }>;
}) {
  return `
Expand exactly one roadmap stage into modules and coherent scoped teaching units. Related concepts, principles or methods MAY be taught together; state what is taught, its conditions and differences. Several questions may map to one unit. Do not enforce one concept per node or split by teaching dimension. Whole-problem application uses the included knowledge and explicit prior-to-use teaching. Reuse known concepts via conceptReferences, never duplicate or silently edit their original nodes.
${curriculumBoundaryRules}

For contentCoverageVersion=1, the course contentQuestions registry and this Stage's keyQuestions arrangements are read-only. Address their concrete material requirements through planningQuestionKeys and learningUnit.version=2 contentContributions; select the exact original requirement indices and dimensions this node teaches. Split a shared question between nodes without requiring every node to teach all its dimensions. Do not grade learner self-explanations, create Stage outcome assessments, or require evidence when thinking is skipped. Parent goalKeys are server-computed summaries.

Domain data:
${JSON.stringify(input.domain, null, 2)}

Confirmed course design direction:
${JSON.stringify(input.courseDesign || null, null, 2)}

Global roadmap skeleton:
${JSON.stringify(input.skeleton, null, 2)}

Stage to expand:
${JSON.stringify({ index: input.stageIndex, ...input.stage }, null, 2)}

Known concepts (data; reuse their exact keys):
${JSON.stringify(input.knownConcepts || [], null, 2)}

Learner evidence from already visited nodes:
${JSON.stringify(input.learningContext || [], null, 2)}

Return only JSON with this shape:
{
  "key": "exact-stage-key-from-skeleton",
  "title": "string",
  "goal": "string",
  "status": "expanded",
  "rationale": "how this expansion preserves or deliberately adjusts the original direction",
  "moduleDirections": ["preserved or refined module directions"],
  "prerequisiteStageKeys": ["exact prerequisite stage keys"],
  "modules": [
    {
      "title": "string",
      "goal": "string",
      "conceptReferences": [],
      "items": [
        {
          "key": "stable-unique-node-key",
          "title": "string",
          "keyQuestion": "string",
          "objective": "string",
          "planningQuestionKeys": ["exact keys of one or more questions from moduleBlueprints"],
          "concept": {"name":"exact teaching unit name","aliases":[],"scope":"boundaries of THIS scoped lesson","problemRole":"what it contributes to the Stage whole problem","learningUnit":${learningUnitShape}},
          "prerequisite": "string",
          "commonMistake": "string",
          "transferPrompt": "string",
          "prerequisiteKeys": ["exact keys of prerequisite nodes"],
          "status": "not_started"
        }
      ]
    }
  ]
}

Requirements:
- Expand only the requested stage. Do not generate other stages.
- A reused concept is ${conceptReferenceShape} in conceptReferences (use [] when no content-question registry exists). Its source node is unchanged. Modules may contain only references when no new concepts are needed.
- Preserve the requested stage key and its prerequisiteStageKeys exactly.
- Preserve the skeleton's module directions unless learner evidence justifies a change. Explain every change in rationale; if unchanged, say why the original direction still fits.
- Each node teaches one coherent unit, optionally combining related concepts, and declares planningQuestionKeys (one or more existing keys). Cover all planned questions via nodes or conceptReferences. Explain all included knowledge at the agreed depth; concept count alone is not a defect. Reused references must name supplied known concept keys and current-stage question keys.
- Give every item a stable unique key. Encode only real prerequisite relationships in prerequisiteKeys; parallel roots are valid.
- Item prerequisiteKeys may reference returned node keys or supplied known concept keys, but only for a genuine necessary prerequisite. Reuse, presentation order, and Stage ordering alone never imply a dependency.
- Follow the skeleton's stage order, core topics, and prerequisiteStageTitles.
- Group or split content to support complete explanations and manageable prerequisite demands. Related concepts can share a node; no compulsory concept count, minimum node count or density ratio proves coverage.
- Every item must include a key question and a concrete teaching objective (what this concept helps explain or use), plus prerequisite, common mistake, and transfer prompt. Do not turn objective into a Stage achievement assessment or an AI review of personal understanding.
- Include transfer prompts that train cross-knowledge and cross-discipline thinking.
- Do not invent fake facts. If scope is unclear, encode conservative assumptions in goals and prerequisites.
- This stage is a draft for user review, not a final authority.
`.trim();
}

export function validateRoadmapStageDraft(value: unknown, requireLearningUnit = false): RoadmapStageInput {
  if (!isRecord(value)) {
    throw new AiTaskValidationError("Roadmap stage draft must be a JSON object.");
  }

  const roadmap = validateRoadmapDraft({
    title: "Stage wrapper",
    status: "draft",
    stages: [value]
  });
  const stage = roadmap.stages?.[0];
  if (!stage) {
    throw new AiTaskValidationError("Roadmap stage draft must include one stage.");
  }
  for (const stageModule of stage.modules || []) {
    if (requireLearningUnit && stageModule.conceptReferences?.some(ref => ref.contentContributions === undefined)) throw new AiTaskValidationError("新生成的复用概念需要显式 contentContributions 分工；无内容问题的旧协议使用空数组。");
    for (const item of stageModule.items || []) {
      if (requireLearningUnit && item.concept?.learningUnit?.version !== 2) throw new AiTaskValidationError(`节点 ${item.key || item.title} 需要 learningUnit.version=2：保存新增知识、默认基础、课内任务、代表例子、引用和 contentContributions。`);
      if(!item.concept?.name || !item.concept.scope || !item.concept.problemRole || !item.planningQuestionKeys?.length) {
        throw new AiTaskValidationError("每个节点须有教学单元名称、范围、完整问题中的作用和 planningQuestionKeys。");
      }
      if (!item.objective?.trim()) {
        throw new AiTaskValidationError(
          `Learning Node "${item.key || item.title || "unknown"}" must include a checkable outcome in objective.`
        );
      }
    }
  }
  return stage;
}

export function validateRoadmapDraft(value: unknown): RoadmapInput {
  if (!isRecord(value)) {
    throw new AiTaskValidationError("Roadmap draft must be a JSON object.");
  }

  const stages = asArray(value.stages).map((stageValue, stageIndex) => {
    if (!isRecord(stageValue)) {
      throw new AiTaskValidationError(`Stage ${stageIndex + 1} must be an object.`);
    }

    const modules = asArray(stageValue.modules).map((moduleValue, moduleIndex) => {
      if (!isRecord(moduleValue)) {
        throw new AiTaskValidationError(
          `Module ${moduleIndex + 1} in stage ${stageIndex + 1} must be an object.`
        );
      }

      const items = asArray(moduleValue.items).map((itemValue, itemIndex) => {
        if (!isRecord(itemValue)) {
          throw new AiTaskValidationError(
            `Item ${itemIndex + 1} in module ${moduleIndex + 1} must be an object.`
          );
        }

        return {
          key: requiredText(
            itemValue.key,
            `stage-${stageIndex + 1}-node-${moduleIndex + 1}-${itemIndex + 1}`
          ),
          title: requiredText(itemValue.title, `知识点 ${itemIndex + 1}`),
          keyQuestion: optionalText(itemValue.keyQuestion),
          objective: optionalText(itemValue.objective),
          prerequisite: optionalText(itemValue.prerequisite),
          commonMistake: optionalText(itemValue.commonMistake),
          transferPrompt: optionalText(itemValue.transferPrompt),
          prerequisiteKeys: textArray(itemValue.prerequisiteKeys),
          planningQuestionKeys: textArray(itemValue.planningQuestionKeys),
          concept: parseConcept(itemValue.concept),
          status: requiredText(itemValue.status, "not_started")
        };
      });

      if (items.length === 0 && !parseConceptReferences(moduleValue.conceptReferences).length) {
        throw new AiTaskValidationError(
          `Module ${moduleIndex + 1} in stage ${stageIndex + 1} has no items.`
        );
      }

      return {
        title: requiredText(moduleValue.title, `模块 ${moduleIndex + 1}`),
        goal: optionalText(moduleValue.goal),
        conceptReferences: parseConceptReferences(moduleValue.conceptReferences),
        items
      };
    });

    if (modules.length === 0) {
      throw new AiTaskValidationError(`Stage ${stageIndex + 1} has no modules.`);
    }

    const moduleBlueprints = asArray(stageValue.moduleBlueprints)
      .slice(0, 12)
      .map((moduleValue, moduleIndex): RoadmapModuleBlueprint => {
        if (!isRecord(moduleValue)) {
          throw new AiTaskValidationError(
            `Module blueprint ${moduleIndex + 1} in stage ${stageIndex + 1} must be an object.`
          );
        }
        return {
          key: optionalText(moduleValue.key) || "",
          title: optionalText(moduleValue.title) || "",
          goal: optionalText(moduleValue.goal) || "",
          goalKeys: textArray(moduleValue.goalKeys),
          keyQuestions: asArray(moduleValue.keyQuestions)
            .slice(0, 24)
            .map((questionValue, questionIndex) => {
              if (!isRecord(questionValue)) {
                throw new AiTaskValidationError(
                  `Key question ${questionIndex + 1} in Module blueprint ${moduleIndex + 1} must be an object.`
                );
              }
              return {
                key: optionalText(questionValue.key) || "",
                ...(optionalText(questionValue.contentQuestionKey) ? {contentQuestionKey:optionalText(questionValue.contentQuestionKey)!} : {}),
                goalKeys: textArray(questionValue.goalKeys),
                question: optionalText(questionValue.question) || "",
                checkableOutcome:
                  optionalText(questionValue.checkableOutcome) || ""
              };
            })
        };
      });

    return {
      key: requiredText(stageValue.key, `stage-${stageIndex + 1}`),
      title: requiredText(stageValue.title, `阶段 ${stageIndex + 1}`),
      goal: optionalText(stageValue.goal),
      goalKeys: textArray(stageValue.goalKeys),
      problem: parseProblem(stageValue.problem),
      status: stageValue.status === "planned" ? "planned" : "expanded",
      rationale: optionalText(stageValue.rationale),
      moduleDirections: textArray(stageValue.moduleDirections),
      ...(value.planningVersion === 3 ? { moduleBlueprints } : {}),
      prerequisiteStageKeys: textArray(stageValue.prerequisiteStageKeys),
      modules
    };
  });

  if (stages.length === 0) {
    throw new AiTaskValidationError("Roadmap draft must include at least one stage.");
  }

  return {
    title: requiredText(value.title, "AI 生成学习路线图草稿"),
    status: "draft",
    ...(value.contentCoverageVersion === 1 || parseGoals(value.learningGoals).some(goal=>goal.contentQuestions !== undefined) ? {contentCoverageVersion:1 as const} : {}),
    ...(value.planningVersion === 3 ? { planningVersion: 3 as const, learningGoals: parseGoals(value.learningGoals) } : {}),
    stages
  };
}

export function buildDiagnosticPrompt(
  domain: { name: string; goal?: string | null; taskBrief?: string | null },
  roadmapItems: Array<{ id: string; title: string; context: string }>
) {
  return `
Generate a diagnostic question draft for this learning domain.

Domain:
${JSON.stringify(domain, null, 2)}

Roadmap items:
${JSON.stringify(roadmapItems, null, 2)}

Return only JSON with this shape:
{
  "title": "string",
  "summary": "string",
  "questions": [
    {
      "prompt": "string",
      "questionType": "concept | application | contrast | transfer | misconception | boundary",
      "expectedAnswer": "string",
      "roadmapItemId": "one id from roadmap items"
    }
  ]
}

Requirements:
- Generate 5 to 8 questions.
- Each question must force the user to express their own understanding first.
- Include concept, application, misconception, and transfer coverage when possible.
- Use roadmapItemId only from the provided list.
- Do not provide questions that can be answered by yes/no only.
- This is a draft for user review.
`.trim();
}

export function validateDiagnosticDraft(
  value: unknown,
  allowedRoadmapItemIds: Set<string>
): DiagnosticSessionInput {
  if (!isRecord(value)) {
    throw new AiTaskValidationError("Diagnostic draft must be a JSON object.");
  }

  const questions = asArray(value.questions).map((questionValue, index) => {
    if (!isRecord(questionValue)) {
      throw new AiTaskValidationError(`Diagnostic question ${index + 1} must be an object.`);
    }

    const roadmapItemId = optionalText(questionValue.roadmapItemId);
    return {
      prompt: requiredText(questionValue.prompt, `诊断题 ${index + 1}`),
      questionType: requiredText(questionValue.questionType, "concept"),
      expectedAnswer: optionalText(questionValue.expectedAnswer),
      roadmapItemId:
        roadmapItemId && allowedRoadmapItemIds.has(roadmapItemId)
          ? roadmapItemId
          : null
    };
  });

  if (questions.length === 0) {
    throw new AiTaskValidationError(
      "Diagnostic draft must include at least one question."
    );
  }

  return {
    title: requiredText(value.title, "AI 生成诊断草稿"),
    status: "draft",
    summary: optionalText(value.summary),
    questions
  };
}

export type DiagnosticEvaluationDraft = {
  summary: string;
  strengths: string[];
  unclearParts: string[];
  inaccurateParts: string[];
  missingBoundaries: string[];
  misconceptionRisk: string | null;
  nextHint: string;
  suggestedResult: string;
  suggestedRoadmapStatus: string;
};

export function buildDiagnosticEvaluationPrompt(input: {
  domain: { name: string; goal?: string | null; taskBrief?: string | null };
  question: {
    prompt: string;
    questionType: string;
    expectedAnswer?: string | null;
  };
  answer: string;
  roadmapItem?: {
    title: string;
    keyQuestion?: string | null;
    objective?: string | null;
    prerequisite?: string | null;
    commonMistake?: string | null;
    transferPrompt?: string | null;
    status?: string | null;
  } | null;
}) {
  return `
Evaluate the user's diagnostic answer as an AI tutor.

Domain:
${JSON.stringify(input.domain, null, 2)}

Diagnostic question:
${JSON.stringify(input.question, null, 2)}

Related roadmap item:
${JSON.stringify(input.roadmapItem || null, null, 2)}

User answer:
${input.answer}

Return only JSON with this shape:
{
  "summary": "short tutor feedback in Chinese",
  "strengths": ["what is correct or useful"],
  "unclearParts": ["what is vague or underexplained"],
  "inaccurateParts": ["what is wrong or unsupported"],
  "missingBoundaries": ["missing conditions, examples, counterexamples, or limits"],
  "misconceptionRisk": "possible misconception or null",
  "nextHint": "one guiding prompt that pushes the user to think deeper, not a full answer",
  "suggestedResult": "solid | partial | misconception | needs_review",
  "suggestedRoadmapStatus": "can_recall | can_apply | needs_review"
}

Rules:
- Do not simply give the final answer.
- Compare against the expected answer, but do not treat it as the only valid wording.
- Explain evidence and boundaries.
- If the answer is weak, give a next hint rather than a complete solution.
- If the answer invents unsupported links, mark that clearly and preserve uncertainty.
`.trim();
}

export function validateDiagnosticEvaluation(
  value: unknown
): DiagnosticEvaluationDraft {
  if (!isRecord(value)) {
    throw new AiTaskValidationError("Diagnostic evaluation must be a JSON object.");
  }

  const result = requiredText(value.suggestedResult, "needs_review");
  const allowedResults = new Set([
    "solid",
    "partial",
    "misconception",
    "needs_review"
  ]);
  const status = requiredText(value.suggestedRoadmapStatus, "needs_review");
  const allowedStatuses = new Set(["can_recall", "can_apply", "needs_review"]);

  return {
    summary: requiredText(value.summary, "需要继续补充解释。"),
    strengths: textArray(value.strengths),
    unclearParts: textArray(value.unclearParts),
    inaccurateParts: textArray(value.inaccurateParts),
    missingBoundaries: textArray(value.missingBoundaries),
    misconceptionRisk: optionalText(value.misconceptionRisk),
    nextHint: requiredText(
      value.nextHint,
      "请用一个具体例子重新说明你的理解，并指出它的适用边界。"
    ),
    suggestedResult: allowedResults.has(result) ? result : "needs_review",
    suggestedRoadmapStatus: allowedStatuses.has(status) ? status : "needs_review"
  };
}

type RoadmapItemTutorContext = {
  domain: { name: string; goal?: string | null; taskBrief?: string | null };
  roadmapItem: {
    title: string;
    keyQuestion?: string | null;
    objective?: string | null;
    prerequisite?: string | null;
    commonMistake?: string | null;
    transferPrompt?: string | null;
    status?: string | null;
  };
  currentUnderstanding?: string | null;
  currentCoreEssence?: string | null;
};

export type LearningHintDraft = {
  hintLevel: number;
  hint: string;
  guidingQuestion: string;
  whyThisHelps: string;
  shouldRevealAnswer: boolean;
};

export function buildLearningHintPrompt(
  input: RoadmapItemTutorContext & {
    hintLevel: number;
    userQuestion?: string | null;
  }
) {
  return `
Generate a layered hint for a user learning one knowledge point.

Context:
${JSON.stringify(
  {
    domain: input.domain,
    roadmapItem: input.roadmapItem,
    currentUnderstanding: input.currentUnderstanding,
    currentCoreEssence: input.currentCoreEssence,
    userQuestion: input.userQuestion,
    hintLevel: input.hintLevel
  },
  null,
  2
)}

Return only JSON with this shape:
{
  "hintLevel": 1,
  "hint": "Chinese tutor hint",
  "guidingQuestion": "one question the user should answer next",
  "whyThisHelps": "why this hint moves thinking forward",
  "shouldRevealAnswer": false
}

Layering rules:
- Level 1: point to a thinking direction only.
- Level 2: connect to prerequisite or old knowledge.
- Level 3: give a partial structure or key step.
- Level 4: give a near-answer framework but still ask the user to fill it.
- Level 5: give the answer, then require the user to re-explain and transfer.
- Do not reveal more than the requested level.
- Preserve uncertainty and knowledge islands when evidence is weak.
`.trim();
}

export function validateLearningHint(value: unknown): LearningHintDraft {
  if (!isRecord(value)) {
    throw new AiTaskValidationError("Learning hint must be a JSON object.");
  }

  const rawLevel = Number(value.hintLevel);
  const hintLevel =
    Number.isFinite(rawLevel) && rawLevel >= 1 && rawLevel <= 5
      ? Math.round(rawLevel)
      : 1;

  return {
    hintLevel,
    hint: requiredText(value.hint, "先尝试说明这个知识点要解决的问题。"),
    guidingQuestion: requiredText(
      value.guidingQuestion,
      "你能用自己的话说出它的适用边界吗？"
    ),
    whyThisHelps: requiredText(
      value.whyThisHelps,
      "这个问题能帮助你把定义、例子和边界连接起来。"
    ),
    shouldRevealAnswer:
      typeof value.shouldRevealAnswer === "boolean"
        ? value.shouldRevealAnswer
        : hintLevel >= 5
  };
}

export type LearningFeedbackDraft = {
  summary: string;
  accurateParts: string[];
  vagueParts: string[];
  missingBoundaries: string[];
  transferCheck: string;
  nextRevisionPrompt: string;
  suggestedMasteryStatus: string;
  shouldRemainIsland: boolean;
  islandReason: string | null;
};

export function buildLearningFeedbackPrompt(
  input: RoadmapItemTutorContext & {
    userUnderstanding: string;
    coreEssence?: string | null;
  }
) {
  return `
Evaluate the user's current understanding of one knowledge point.

Context:
${JSON.stringify(
  {
    domain: input.domain,
    roadmapItem: input.roadmapItem,
    currentUnderstanding: input.currentUnderstanding,
    currentCoreEssence: input.currentCoreEssence,
    userUnderstanding: input.userUnderstanding,
    coreEssence: input.coreEssence
  },
  null,
  2
)}

Return only JSON with this shape:
{
  "summary": "short Chinese feedback",
  "accurateParts": ["accurate parts"],
  "vagueParts": ["vague or unsupported parts"],
  "missingBoundaries": ["missing conditions, counterexamples, or limits"],
  "transferCheck": "one transfer challenge the user should try",
  "nextRevisionPrompt": "one concrete prompt for revising their explanation",
  "suggestedMasteryStatus": "seen | can_recall | can_apply | can_transfer | needs_review | island",
  "shouldRemainIsland": false,
  "islandReason": "reason or null"
}

Rules:
- Do not mark mastery as high just because the user has seen an explanation.
- Require user wording, examples, boundaries, and transfer ability.
- If the connection to old knowledge is weak or unsupported, suggest keeping a knowledge island.
- Give feedback that helps the user revise, not a final polished answer to copy.
`.trim();
}

export function validateLearningFeedback(value: unknown): LearningFeedbackDraft {
  if (!isRecord(value)) {
    throw new AiTaskValidationError("Learning feedback must be a JSON object.");
  }

  const status = requiredText(value.suggestedMasteryStatus, "needs_review");
  const allowedStatuses = new Set([
    "seen",
    "can_recall",
    "can_apply",
    "can_transfer",
    "needs_review",
    "island"
  ]);
  const shouldRemainIsland =
    typeof value.shouldRemainIsland === "boolean"
      ? value.shouldRemainIsland
      : status === "island";

  return {
    summary: requiredText(value.summary, "这份理解还需要继续修订。"),
    accurateParts: textArray(value.accurateParts),
    vagueParts: textArray(value.vagueParts),
    missingBoundaries: textArray(value.missingBoundaries),
    transferCheck: requiredText(
      value.transferCheck,
      "请把这个知识点迁移到一个新例子中，并说明适用边界。"
    ),
    nextRevisionPrompt: requiredText(
      value.nextRevisionPrompt,
      "请补充一个例子、一个反例和一个容易误用的边界。"
    ),
    suggestedMasteryStatus: allowedStatuses.has(status)
      ? status
      : "needs_review",
    shouldRemainIsland,
    islandReason: optionalText(value.islandReason)
  };
}

export type RelationCandidateTarget = {
  id: string;
  text: string;
  canvasId: string;
  canvasName: string;
  coreEssence?: string | null;
  isWormholeTarget: boolean;
};

export type RelationCandidateDraft = {
  targetWordId: string;
  relationType: string;
  status: string;
  evidenceStrength: string;
  detail: string;
  userQuestion: string;
  applicability: string | null;
  misuseRisk: string | null;
  shouldCreateWormhole: boolean;
};

export function buildRelationCandidatePrompt(input: {
  source: {
    id: string;
    text: string;
    canvasId: string;
    canvasName: string;
    userUnderstanding?: string | null;
    coreEssence?: string | null;
    isIsland?: boolean | null;
    islandReason?: string | null;
  };
  targets: RelationCandidateTarget[];
  userQuestion?: string | null;
}) {
  return `
Suggest knowledge relation candidates for the source knowledge point.

Source:
${JSON.stringify(input.source, null, 2)}

Candidate targets:
${JSON.stringify(input.targets, null, 2)}

User question or intention:
${input.userQuestion || "No extra question."}

Return only JSON with this shape:
{
  "candidates": [
    {
      "targetWordId": "must be one id from candidate targets",
      "relationType": "prerequisite | cause | derive | analogy | contrast | category | application | counterexample | transfer | evidence | boundary | related | WORMHOLE",
      "status": "candidate | weak_evidence | wormhole_candidate | weak_wormhole",
      "evidenceStrength": "unknown | weak | medium | strong",
      "detail": "why the relation may exist, in Chinese",
      "userQuestion": "a question the user should answer before confirming",
      "applicability": "where this relation applies, or null",
      "misuseRisk": "how this relation could be overused or misleading, or null",
      "shouldCreateWormhole": false
    }
  ]
}

Rules:
- Pick at most 5 candidates.
- Use only targetWordId values from candidate targets.
- Do not invent facts or hidden target nodes.
- Prefer weak/candidate status unless the evidence is explicit in source and target text.
- For cross-canvas or wormhole targets, use relationType "WORMHOLE" only when the link crosses knowledge systems; otherwise use transfer/analogy/contrast/etc.
- Preserve knowledge islands when evidence is weak. A candidate can be useful without being confirmed.
- The AI proposes. The user must confirm before any relation is saved.
`.trim();
}

export function validateRelationCandidates(
  value: unknown,
  allowedTargetIds: Set<string>
): RelationCandidateDraft[] {
  if (!isRecord(value)) {
    throw new AiTaskValidationError("Relation candidates must be a JSON object.");
  }

  const allowedTypes = new Set([
    "prerequisite",
    "cause",
    "derive",
    "analogy",
    "contrast",
    "category",
    "application",
    "counterexample",
    "transfer",
    "evidence",
    "boundary",
    "related",
    "WORMHOLE"
  ]);
  const allowedStatuses = new Set([
    "candidate",
    "weak_evidence",
    "wormhole_candidate",
    "weak_wormhole"
  ]);
  const allowedEvidence = new Set(["unknown", "weak", "medium", "strong"]);

  return asArray(value.candidates)
    .map((candidateValue) => {
      if (!isRecord(candidateValue)) return null;
      const targetWordId = requiredText(candidateValue.targetWordId, "");
      if (!allowedTargetIds.has(targetWordId)) return null;

      const relationType = requiredText(candidateValue.relationType, "related");
      const status = requiredText(candidateValue.status, "candidate");
      const evidenceStrength = requiredText(
        candidateValue.evidenceStrength,
        "unknown"
      );
      const normalizedType = allowedTypes.has(relationType)
        ? relationType
        : "related";
      const normalizedStatus = allowedStatuses.has(status)
        ? status
        : normalizedType === "WORMHOLE"
          ? "wormhole_candidate"
          : "candidate";

      return {
        targetWordId,
        relationType: normalizedType,
        status: normalizedStatus,
        evidenceStrength: allowedEvidence.has(evidenceStrength)
          ? evidenceStrength
          : "unknown",
        detail: requiredText(candidateValue.detail, "AI 建议进一步验证这两个知识点的关系。"),
        userQuestion: requiredText(
          candidateValue.userQuestion,
          "你能用一个例子说明这两个知识点为什么相关，以及边界在哪里吗？"
        ),
        applicability: optionalText(candidateValue.applicability),
        misuseRisk: optionalText(candidateValue.misuseRisk),
        shouldCreateWormhole:
          typeof candidateValue.shouldCreateWormhole === "boolean"
            ? candidateValue.shouldCreateWormhole
            : normalizedType === "WORMHOLE"
      };
    })
    .filter(Boolean)
    .slice(0, 5) as RelationCandidateDraft[];
}

export type TransferChallengeDraft = {
  prompt: string;
  relatedWordIds: string[];
  relationFocus: string;
  expectedReasoningMoves: string[];
  boundaryCheck: string;
  misuseRisk: string | null;
  difficulty: string;
};

export type KnowledgeGraphCoreConceptDraft = {
  title: string;
  essence: string;
  knowledgePointIds: string[];
  whyItMatters: string;
};

export type KnowledgeGraphOrganizerDraft = {
  summary: string;
  coreConcepts: KnowledgeGraphCoreConceptDraft[];
  priorityGaps: string[];
};

export type RelationExplanationDraft = {
  summary: string;
  connectionLogic: string[];
  boundaryCheck: string;
  evidenceNote: string;
  misuseRisk: string | null;
};

export type IslandReactivationConnectionDraft = {
  targetWordId: string;
  relationType: string;
  reason: string;
  question: string;
};

export type IslandReactivationPlanDraft = {
  summary: string;
  missingEvidence: string[];
  candidateConnections: IslandReactivationConnectionDraft[];
  transferChallenge: string;
  keepAsIsland: boolean;
  nextAction: string;
};

export function buildIslandReactivationPrompt(input: {
  source: {
    id: string;
    text: string;
    canvasName: string;
    coreEssence?: string | null;
    userUnderstanding?: string | null;
    islandReason?: string | null;
    masteryStatus?: string | null;
  };
  existingRelations: Array<{
    relationType: string;
    status?: string | null;
    evidenceStrength?: string | null;
    otherWord: {
      id: string;
      text: string;
      canvasName: string;
      coreEssence?: string | null;
    };
  }>;
  candidateTargets: Array<{
    id: string;
    text: string;
    canvasName: string;
    coreEssence?: string | null;
  }>;
}) {
  return `
Reactivate one long-term knowledge island.

Island source:
${JSON.stringify(input.source, null, 2)}

Existing relations:
${JSON.stringify(input.existingRelations, null, 2)}

Candidate knowledge points for possible reconnection:
${JSON.stringify(input.candidateTargets, null, 2)}

Return only JSON with this shape:
{
  "summary": "short Chinese summary of the current island situation",
  "missingEvidence": ["what evidence, example, boundary, or prerequisite is still missing"],
  "candidateConnections": [
    {
      "targetWordId": "must be one id from candidateTargets",
      "relationType": "prerequisite | cause | derive | analogy | contrast | category | application | counterexample | transfer | evidence | boundary | related | WORMHOLE",
      "reason": "why this target may help reactivate the island",
      "question": "one question the user must answer before creating the relation"
    }
  ],
  "transferChallenge": "one Chinese transfer challenge for rechecking this island",
  "keepAsIsland": true,
  "nextAction": "one concrete next step for the user"
}

Rules:
- Use at most 3 candidateConnections.
- Use only targetWordId values from candidateTargets.
- Preserve uncertainty. If evidence is still weak, keepAsIsland should stay true.
- Do not pretend the island is already integrated.
- The transfer challenge must force the user to test boundary conditions or cross-knowledge movement.
`.trim();
}

export function validateIslandReactivationPlan(
  value: unknown,
  allowedTargetIds: Set<string>
): IslandReactivationPlanDraft {
  if (!isRecord(value)) {
    throw new AiTaskValidationError(
      "Island reactivation plan must be a JSON object."
    );
  }

  const allowedTypes = new Set([
    "prerequisite",
    "cause",
    "derive",
    "analogy",
    "contrast",
    "category",
    "application",
    "counterexample",
    "transfer",
    "evidence",
    "boundary",
    "related",
    "WORMHOLE"
  ]);

  return {
    summary: requiredText(
      value.summary,
      "这个知识点仍需要重新检查它与旧知识之间的连接证据。"
    ),
    missingEvidence: textArray(value.missingEvidence).slice(0, 5),
    candidateConnections: asArray(value.candidateConnections)
      .map((entry) => {
        if (!isRecord(entry)) return null;
        const targetWordId = requiredText(entry.targetWordId, "");
        if (!allowedTargetIds.has(targetWordId)) return null;
        const relationType = requiredText(entry.relationType, "related");
        return {
          targetWordId,
          relationType: allowedTypes.has(relationType) ? relationType : "related",
          reason: requiredText(
            entry.reason,
            "它可能提供一个可验证的连接方向，但还需要补证。"
          ),
          question: requiredText(
            entry.question,
            "你能说明两者在哪个条件下真的相关，在哪个条件下不相关吗？"
          )
        };
      })
      .filter(Boolean)
      .slice(0, 3) as IslandReactivationConnectionDraft[],
    transferChallenge: requiredText(
      value.transferChallenge,
      "请把这个知识点迁移到一个新场景，并指出什么时候仍应保留孤岛状态。"
    ),
    keepAsIsland:
      typeof value.keepAsIsland === "boolean" ? value.keepAsIsland : true,
    nextAction: requiredText(
      value.nextAction,
      "先补一个例子、一个反例和一个可验证连接，再决定是否解除孤岛。"
    )
  };
}

export type RelationReactivationPlanDraft = {
  summary: string;
  suggestedStatus: string;
  suggestedEvidenceStrength: string;
  suggestedDetail: string;
  evidenceChecks: string[];
  transferChallenge: string;
  misuseWarning: string;
  nextAction: string;
};

export function buildRelationReactivationPrompt(input: {
  relation: {
    id: string;
    relationType: string;
    status?: string | null;
    evidenceStrength?: string | null;
    detail?: string | null;
    applicability?: string | null;
    misuseRisk?: string | null;
  };
  fromWord: {
    id: string;
    text: string;
    canvasName: string;
    coreEssence?: string | null;
  };
  toWord: {
    id: string;
    text: string;
    canvasName: string;
    coreEssence?: string | null;
  };
}) {
  return `
Reactivate and re-check one weak knowledge relation.

Relation:
${JSON.stringify(input.relation, null, 2)}

From knowledge point:
${JSON.stringify(input.fromWord, null, 2)}

To knowledge point:
${JSON.stringify(input.toWord, null, 2)}

Return only JSON with this shape:
{
  "summary": "short Chinese summary of what is weak or risky here",
  "suggestedStatus": "candidate | weak_evidence | confirmed | rejected | wormhole_candidate | weak_wormhole | confirmed_wormhole | rejected_wormhole",
  "suggestedEvidenceStrength": "unknown | weak | medium | strong",
  "suggestedDetail": "a careful Chinese phrasing for the current best relation claim",
  "evidenceChecks": ["what the user should verify before trusting this relation"],
  "transferChallenge": "one Chinese transfer challenge that tests this relation",
  "misuseWarning": "how this relation or wormhole may be overused or misleading",
  "nextAction": "one concrete next step"
}

Rules:
- Preserve uncertainty when evidence is weak.
- Reject the relation if the current claim is misleading or unsupported.
- For wormholes, explicitly warn about cross-system misuse.
- The transfer challenge must test applicability and failure conditions, not just repeat the definition.
`.trim();
}

export function validateRelationReactivationPlan(
  value: unknown
): RelationReactivationPlanDraft {
  if (!isRecord(value)) {
    throw new AiTaskValidationError(
      "Relation reactivation plan must be a JSON object."
    );
  }

  const allowedStatuses = new Set([
    "candidate",
    "weak_evidence",
    "confirmed",
    "rejected",
    "wormhole_candidate",
    "weak_wormhole",
    "confirmed_wormhole",
    "rejected_wormhole"
  ]);
  const allowedEvidence = new Set(["unknown", "weak", "medium", "strong"]);
  const suggestedStatus = requiredText(value.suggestedStatus, "weak_evidence");
  const suggestedEvidenceStrength = requiredText(
    value.suggestedEvidenceStrength,
    "weak"
  );

  return {
    summary: requiredText(
      value.summary,
      "这条关系还需要重新核查适用条件、边界和反例。"
    ),
    suggestedStatus: allowedStatuses.has(suggestedStatus)
      ? suggestedStatus
      : "weak_evidence",
    suggestedEvidenceStrength: allowedEvidence.has(suggestedEvidenceStrength)
      ? suggestedEvidenceStrength
      : "weak",
    suggestedDetail: requiredText(
      value.suggestedDetail,
      "这条关系目前只能作为待验证的弱连接，不能直接当作稳定结论。"
    ),
    evidenceChecks: textArray(value.evidenceChecks).slice(0, 5),
    transferChallenge: requiredText(
      value.transferChallenge,
      "请构造一个新场景，验证这条关系什么时候成立，什么时候会失效。"
    ),
    misuseWarning: requiredText(
      value.misuseWarning,
      "如果忽略边界条件，这条关系可能被过度泛化。"
    ),
    nextAction: requiredText(
      value.nextAction,
      "先补充一个正例和一个反例，再决定是否确认这条关系。"
    )
  };
}

export type LongTermReviewInsightDraft = {
  summary: string;
  crossDomainTransferChallenges: Array<{
    focusWordId: string;
    prompt: string;
    relationFocus: string;
    boundaryCheck: string;
    misuseRisk: string | null;
    relatedWordIds: string[];
    whyNow: string;
  }>;
  wormholeMisuseAlerts: Array<{
    relationId: string;
    severity: "medium" | "high";
    warning: string;
    verifyQuestion: string;
    saferUse: string;
  }>;
  nextActions: string[];
};

export function buildLongTermReviewInsightPrompt(input: {
  domain: { id: string; name: string };
  summary: {
    overdueCount: number;
    dueTodayCount: number;
    upcomingCount: number;
    longTermIslandCount: number;
    weakRelationCount: number;
    nextActions: string[];
  };
  focusWords: Array<{
    id: string;
    text: string;
    masteryStatus?: string | null;
    isIsland?: boolean | null;
    islandReason?: string | null;
  }>;
  wormholes: Array<{
    relationId: string;
    status?: string | null;
    evidenceStrength?: string | null;
    detail?: string | null;
    applicability?: string | null;
    misuseRisk?: string | null;
    fromWord: {
      id: string;
      text: string;
      canvasName: string;
      coreEssence?: string | null;
    };
    toWord: {
      id: string;
      text: string;
      canvasName: string;
      coreEssence?: string | null;
    };
  }>;
  relatedWordPool: Array<{
    id: string;
    text: string;
    canvasName?: string | null;
  }>;
}) {
  return `
Generate one long-term learning pack for this knowledge domain.

Domain:
${JSON.stringify(input.domain, null, 2)}

Current long-term review summary:
${JSON.stringify(input.summary, null, 2)}

Focus words that need long-term reactivation:
${JSON.stringify(input.focusWords, null, 2)}

Current wormhole relations:
${JSON.stringify(input.wormholes, null, 2)}

Allowed related word pool:
${JSON.stringify(input.relatedWordPool, null, 2)}

Return only JSON with this shape:
{
  "summary": "short Chinese summary for this round of long-term learning",
  "crossDomainTransferChallenges": [
    {
      "focusWordId": "one id from focusWords",
      "prompt": "Chinese transfer challenge",
      "relationFocus": "what cross-domain relation or weak point this challenge tests",
      "boundaryCheck": "what limit or failure condition the user must check",
      "misuseRisk": "how this transfer may be misleading, or null",
      "relatedWordIds": ["ids from relatedWordPool"],
      "whyNow": "why this challenge should be done now"
    }
  ],
  "wormholeMisuseAlerts": [
    {
      "relationId": "one id from wormholes",
      "severity": "medium | high",
      "warning": "what misuse risk exists",
      "verifyQuestion": "what the user must verify before trusting this wormhole",
      "saferUse": "how to use it more carefully"
    }
  ],
  "nextActions": ["short Chinese actions"]
}

Rules:
- Generate 1 to 3 crossDomainTransferChallenges.
- Use only focusWordId values from focusWords.
- Use only relatedWordIds from relatedWordPool.
- Generate 0 to 4 wormholeMisuseAlerts. If no wormhole needs warning, return an empty array.
- Prefer cross-domain transfer when wormholes exist, but preserve uncertainty.
- For weak or candidate wormholes, emphasize verification and boundary checks.
- Do not give the answer to the challenge.
`.trim();
}

export function validateLongTermReviewInsight(
  value: unknown,
  allowedFocusWordIds: Set<string>,
  allowedRelatedWordIds: Set<string>,
  allowedWormholeRelationIds: Set<string>
): LongTermReviewInsightDraft {
  if (!isRecord(value)) {
    throw new AiTaskValidationError(
      "Long-term review insight must be a JSON object."
    );
  }

  return {
    summary: requiredText(
      value.summary,
      "本轮长期学习应优先处理跨学科迁移和高风险虫洞。"
    ),
    crossDomainTransferChallenges: asArray(value.crossDomainTransferChallenges)
      .map((entry) => {
        if (!isRecord(entry)) return null;
        const focusWordId = requiredText(entry.focusWordId, "");
        if (!allowedFocusWordIds.has(focusWordId)) return null;
        return {
          focusWordId,
          prompt: requiredText(
            entry.prompt,
            "请把该知识点迁移到一个跨领域新场景，并说明何时会失效。"
          ),
          relationFocus: requiredText(
            entry.relationFocus,
            "验证跨领域迁移是否真的成立。"
          ),
          boundaryCheck: requiredText(
            entry.boundaryCheck,
            "请补一个适用条件和一个失败反例。"
          ),
          misuseRisk: optionalText(entry.misuseRisk),
          relatedWordIds: textArray(entry.relatedWordIds)
            .filter((id) => allowedRelatedWordIds.has(id))
            .slice(0, 4),
          whyNow: requiredText(
            entry.whyNow,
            "它正处于长期复盘阶段，需要通过迁移重新验证。"
          )
        };
      })
      .filter(Boolean)
      .slice(0, 3) as LongTermReviewInsightDraft["crossDomainTransferChallenges"],
    wormholeMisuseAlerts: asArray(value.wormholeMisuseAlerts)
      .map((entry) => {
        if (!isRecord(entry)) return null;
        const relationId = requiredText(entry.relationId, "");
        if (!allowedWormholeRelationIds.has(relationId)) return null;
        const severity = requiredText(entry.severity, "medium");
        return {
          relationId,
          severity: severity === "high" ? "high" : "medium",
          warning: requiredText(
            entry.warning,
            "这个虫洞可能被过度泛化，需要先验证再使用。"
          ),
          verifyQuestion: requiredText(
            entry.verifyQuestion,
            "你能说明这个虫洞在哪些条件下成立，在哪些条件下失效吗？"
          ),
          saferUse: requiredText(
            entry.saferUse,
            "先把它当作候选连接，并配套边界说明。"
          )
        };
      })
      .filter(Boolean)
      .slice(0, 4) as LongTermReviewInsightDraft["wormholeMisuseAlerts"],
    nextActions: textArray(value.nextActions).slice(0, 5)
  };
}

export function buildTransferChallengePrompt(input: {
  source: {
    id: string;
    text: string;
    coreEssence?: string | null;
    userUnderstanding?: string | null;
  };
  relations: Array<{
    id: string;
    relationType: string;
    status?: string | null;
    evidenceStrength?: string | null;
    detail?: string | null;
    applicability?: string | null;
    misuseRisk?: string | null;
    otherWord: {
      id: string;
      text: string;
      canvasName: string;
      coreEssence?: string | null;
    };
  }>;
  userGoal?: string | null;
}) {
  return `
Generate one transfer challenge for reviewing a knowledge point.

Source knowledge point:
${JSON.stringify(input.source, null, 2)}

Available confirmed or candidate relations:
${JSON.stringify(input.relations, null, 2)}

User goal:
${input.userGoal || "No extra goal."}

Return only JSON with this shape:
{
  "prompt": "Chinese transfer challenge for the user to answer",
  "relatedWordIds": ["ids from relation.otherWord.id"],
  "relationFocus": "which relation or wormhole this challenge tests",
  "expectedReasoningMoves": ["what the user must reason through"],
  "boundaryCheck": "a condition, counterexample, or limit the user must check",
  "misuseRisk": "how this transfer can be misleading, or null",
  "difficulty": "easy | medium | hard"
}

Rules:
- Do not give the solution.
- The challenge must require the user to use the source knowledge point and at least one related point.
- Prefer testing weak/candidate relations with boundary checks instead of treating them as facts.
- If a wormhole or cross-domain relation exists, use it to train cross-system transfer.
- Preserve uncertainty: ask the user to verify when the evidence is weak.
`.trim();
}

export function buildKnowledgeGraphOrganizerPrompt(input: {
  domain: { id: string; name: string };
  nodes: Array<{
    id: string;
    title: string;
    type: string;
    status: string;
    isIsland: boolean;
    coreEssence?: string | null;
  }>;
  relations: Array<{
    id: string;
    fromKnowledgePointId: string;
    toKnowledgePointId: string;
    relationType: string;
    status?: string | null;
    evidenceStrength?: string | null;
    detail?: string | null;
  }>;
}) {
  return `
Organize the current knowledge graph into a concise learning summary.

Domain:
${JSON.stringify(input.domain, null, 2)}

Knowledge points:
${JSON.stringify(input.nodes, null, 2)}

Relations:
${JSON.stringify(input.relations, null, 2)}

Return only JSON with this shape:
{
  "summary": "short Chinese summary of the current knowledge structure",
  "coreConcepts": [
    {
      "title": "short Chinese concept cluster title",
      "essence": "why these points belong together",
      "knowledgePointIds": ["ids from nodes"],
      "whyItMatters": "how this cluster supports learning progress"
    }
  ],
  "priorityGaps": ["uncertain links, islands, or missing boundaries the user should still check"]
}

Rules:
- Use only knowledgePointIds from nodes.
- Return 1 to 6 coreConcepts.
- Preserve uncertainty: candidate relations and islands should remain uncertain.
- Do not invent facts not supported by the graph.
`.trim();
}

export function validateKnowledgeGraphOrganizer(
  value: unknown,
  allowedKnowledgePointIds: Set<string>
): KnowledgeGraphOrganizerDraft {
  if (!isRecord(value)) {
    throw new AiTaskValidationError(
      "Knowledge graph organizer must be a JSON object."
    );
  }

  const coreConcepts = asArray(value.coreConcepts)
    .filter(isRecord)
    .map((concept, index) => ({
      title: requiredText(concept.title, `Concept ${index + 1}`),
      essence: requiredText(concept.essence, "Explain the shared structure."),
      knowledgePointIds: textArray(concept.knowledgePointIds).filter((id) =>
        allowedKnowledgePointIds.has(id)
      ),
      whyItMatters: requiredText(
        concept.whyItMatters,
        "This cluster supports the next learning step."
      )
    }))
    .filter((concept) => concept.knowledgePointIds.length > 0)
    .slice(0, 6);

  return {
    summary: requiredText(
      value.summary,
      "The current graph still needs a clearer grouping of core concepts."
    ),
    coreConcepts,
    priorityGaps: textArray(value.priorityGaps).slice(0, 8)
  };
}

export function buildRelationExplanationPrompt(input: {
  relation: {
    id: string;
    relationType: string;
    status?: string | null;
    evidenceStrength?: string | null;
    detail?: string | null;
    applicability?: string | null;
    misuseRisk?: string | null;
  };
  fromNode: {
    id: string;
    text: string;
    canvasName?: string | null;
    coreEssence?: string | null;
  };
  toNode: {
    id: string;
    text: string;
    canvasName?: string | null;
    coreEssence?: string | null;
  };
}) {
  return `
Explain one knowledge-graph relation for the learner.

Relation:
${JSON.stringify(input.relation, null, 2)}

From node:
${JSON.stringify(input.fromNode, null, 2)}

To node:
${JSON.stringify(input.toNode, null, 2)}

Return only JSON with this shape:
{
  "summary": "short Chinese explanation of the relation",
  "connectionLogic": ["2 to 4 short Chinese reasoning steps"],
  "boundaryCheck": "one boundary or counterexample the learner must check",
  "evidenceNote": "how strong or weak the current evidence is",
  "misuseRisk": "how this relation may be overused or misleading, or null"
}

Rules:
- Respect the current relation status and evidenceStrength.
- If the relation is weak or candidate, explain uncertainty clearly.
- Do not present a candidate relation as settled fact.
`.trim();
}

export function validateRelationExplanation(
  value: unknown
): RelationExplanationDraft {
  if (!isRecord(value)) {
    throw new AiTaskValidationError("Relation explanation must be a JSON object.");
  }

  return {
    summary: requiredText(
      value.summary,
      "This relation still needs a clearer explanation."
    ),
    connectionLogic: textArray(value.connectionLogic).slice(0, 4),
    boundaryCheck: requiredText(
      value.boundaryCheck,
      "State one condition where this relation may fail."
    ),
    evidenceNote: requiredText(
      value.evidenceNote,
      "The current evidence is still incomplete."
    ),
    misuseRisk: optionalText(value.misuseRisk)
  };
}

export function validateTransferChallenge(
  value: unknown,
  allowedRelatedWordIds: Set<string>
): TransferChallengeDraft {
  if (!isRecord(value)) {
    throw new AiTaskValidationError("Transfer challenge must be a JSON object.");
  }

  const relatedWordIds = textArray(value.relatedWordIds).filter((id) =>
    allowedRelatedWordIds.has(id)
  );
  const difficulty = requiredText(value.difficulty, "medium");
  const allowedDifficulties = new Set(["easy", "medium", "hard"]);

  return {
    prompt: requiredText(
      value.prompt,
      "请选择一个相关知识点，说明当前知识点能否迁移过去，并写出适用边界。"
    ),
    relatedWordIds,
    relationFocus: requiredText(value.relationFocus, "验证知识点之间的迁移关系"),
    expectedReasoningMoves: textArray(value.expectedReasoningMoves),
    boundaryCheck: requiredText(
      value.boundaryCheck,
      "请给出一个适用条件和一个可能失败的反例。"
    ),
    misuseRisk: optionalText(value.misuseRisk),
    difficulty: allowedDifficulties.has(difficulty) ? difficulty : "medium"
  };
}
