export const knowledgeNodeStatuses = [
  "not_started",
  "seen",
  "can_recall",
  "can_apply",
  "can_transfer",
  "integrated",
  "island",
  "needs_review"
] as const;

export type KnowledgeNodeStatus = (typeof knowledgeNodeStatuses)[number];

export const highMasteryStatuses = [
  "can_apply",
  "can_transfer",
  "integrated"
] as const;

export const isHighMasteryStatus = (
  value: string | null | undefined
): value is (typeof highMasteryStatuses)[number] =>
  highMasteryStatuses.includes(
    value?.trim() as (typeof highMasteryStatuses)[number]
  );

export const knowledgeRelationStatuses = [
  "candidate",
  "weak_evidence",
  "confirmed",
  "rejected",
  "wormhole_candidate",
  "weak_wormhole",
  "confirmed_wormhole",
  "rejected_wormhole"
] as const;

export type KnowledgeRelationStatus =
  (typeof knowledgeRelationStatuses)[number];

export const evidenceStrengths = [
  "unknown",
  "weak",
  "medium",
  "strong"
] as const;

export type EvidenceStrength = (typeof evidenceStrengths)[number];

export const relationKinds = [
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
] as const;

export type RelationKind = (typeof relationKinds)[number];

export const aiTaskTypes = [
  "domain_research",
  "task_brief_generation",
  "course_design_research",
  "course_design_repair",
  "course_design_regeneration",
  "roadmap_skeleton_generation",
  "roadmap_stage_generation",
  "roadmap_generation",
  "diagnostic_question_generation",
  "answer_evaluation",
  "hint_generation",
  "concept_explanation",
  "practice_generation",
  "relation_candidate_generation",
  "knowledge_graph_organization",
  "relation_explanation",
  "wormhole_candidate_generation",
  "transfer_challenge_generation",
  "review_feedback_generation",
  "reactivation_plan_generation",
  "long_term_review_generation",
  "provider_test"
] as const;

export type AiTaskType = (typeof aiTaskTypes)[number];

export const hintLevels = [1, 2, 3, 4, 5] as const;

export type HintLevel = (typeof hintLevels)[number];

export const domainStatuses = [
  "active",
  "paused",
  "completed",
  "archived"
] as const;

export type DomainStatus = (typeof domainStatuses)[number];

export const knowledgeNodeStatusLabels: Record<KnowledgeNodeStatus, string> = {
  not_started: "未开始",
  seen: "已接触",
  can_recall: "能回忆",
  can_apply: "能应用",
  can_transfer: "能迁移",
  integrated: "已融入体系",
  island: "知识孤岛",
  needs_review: "需要复习"
};

export const knowledgeRelationStatusLabels: Record<
  KnowledgeRelationStatus,
  string
> = {
  candidate: "候选关系",
  weak_evidence: "弱证据关系",
  confirmed: "已确认关系",
  rejected: "已否定关系",
  wormhole_candidate: "候选虫洞",
  weak_wormhole: "弱证据虫洞",
  confirmed_wormhole: "已确认虫洞",
  rejected_wormhole: "已否定虫洞"
};

export const evidenceStrengthLabels: Record<EvidenceStrength, string> = {
  unknown: "未知",
  weak: "弱",
  medium: "中",
  strong: "强"
};

export const diagnosticQuestionTypes = [
  "concept",
  "explanation",
  "application",
  "contrast",
  "transfer",
  "misconception",
  "boundary"
] as const;

export type DiagnosticQuestionType = (typeof diagnosticQuestionTypes)[number];

export const diagnosticQuestionTypeLabels: Record<
  DiagnosticQuestionType,
  string
> = {
  concept: "概念题",
  explanation: "解释题",
  application: "应用题",
  contrast: "对比题",
  transfer: "迁移题",
  misconception: "误区识别题",
  boundary: "边界判断题"
};

export const diagnosticAnswerResults = [
  "unreviewed",
  "solid",
  "partial",
  "misconception",
  "needs_review"
] as const;

export type DiagnosticAnswerResult = (typeof diagnosticAnswerResults)[number];

export const diagnosticAnswerResultLabels: Record<
  DiagnosticAnswerResult,
  string
> = {
  unreviewed: "待评价",
  solid: "较扎实",
  partial: "部分掌握",
  misconception: "存在误解",
  needs_review: "需要复习"
};

export const learningNodeStatuses = [
  "locked",
  "available",
  "next",
  "in_progress",
  "completed",
  "mastered",
  "needs_review",
  "suggested",
  "skipped"
] as const;

export type LearningNodeStatus = (typeof learningNodeStatuses)[number];

export const learningNodeTypes = [
  "knowledge",
  "practice",
  "diagnostic",
  "review",
  "challenge",
  "remedial",
  "milestone"
] as const;

export type LearningNodeType = (typeof learningNodeTypes)[number];

export const learningNodeStatusLabels: Record<LearningNodeStatus, string> = {
  locked: "未解锁",
  available: "可学习",
  next: "下一步",
  in_progress: "学习中",
  completed: "已完成",
  mastered: "已掌握",
  needs_review: "待复习",
  suggested: "建议加入",
  skipped: "已跳过"
};

export const learningNodeTypeLabels: Record<LearningNodeType, string> = {
  knowledge: "知识点",
  practice: "练习",
  diagnostic: "诊断",
  review: "复盘",
  challenge: "挑战",
  remedial: "补救",
  milestone: "里程碑"
};

export const routeSuggestionLevels = ["L1", "L2", "L3"] as const;

export type RouteSuggestionLevel = (typeof routeSuggestionLevels)[number];

export type RouteSuggestionStatus = "candidate" | "accepted" | "rejected";

export const routeSuggestionStatusLabels: Record<RouteSuggestionStatus, string> =
  {
    candidate: "待确认",
    accepted: "已接受",
    rejected: "已拒绝"
  };

export const domainStatusLabels: Record<DomainStatus, string> = {
  active: "进行中",
  paused: "已暂停",
  completed: "已完成",
  archived: "已归档"
};

export type LearningProgress = {
  totalNodes: number;
  completedNodes: number;
  masteredNodes: number;
  needsReviewNodes: number;
  percent: number;
};

export type DomainMapUnit = {
  goalKeys?: string[];
  problem?: import("./roadmapPlanningTypes").StageProblem;
  conceptModules?: {title:string;goal?:string|null;conceptReferences: import("./roadmapPlanningTypes").ConceptReference[]}[];
  id: string;
  key: string;
  title: string;
  goal: string | null;
  status: "planned" | "expanded";
  rationale: string | null;
  moduleDirections: string[];
  moduleBlueprints: import("./roadmapPlanningTypes").RoadmapModuleBlueprint[];
  prerequisiteStageKeys: string[];
  orderIndex: number;
  progress: LearningProgress;
};

export type DomainMapNode = {
  concept?: import("./roadmapPlanningTypes").ConceptProfile;
  planningQuestionKeys?: string[];
  id: string;
  key: string;
  domainId: string;
  unitId: string;
  unitTitle: string;
  moduleId: string;
  moduleTitle: string;
  title: string;
  type: LearningNodeType;
  status: LearningNodeStatus;
  objective: string | null;
  keyQuestion: string | null;
  prerequisite: string | null;
  commonMistake: string | null;
  transferPrompt: string | null;
  planningQuestionKey: string | null;
  dependencyIds: string[];
  prerequisiteKeys: string[];
  unmetDependencyIds: string[];
  orderIndex: number;
  linkedKnowledgePointId: string | null;
};

export type DomainMap = {
  contentCoverageVersion?: 1;
  contentCoverage?: import("./roadmapPlanningTypes").CourseContentCoverage[];
  learningGoals?: import("./roadmapPlanningTypes").LearningGoal[];
  domain: {
    id: string;
    name: string;
    description: string | null;
    currentLevel: string | null;
    goal: string | null;
    scope: string | null;
    excludedScope: string | null;
    depth: string | null;
    outputType: string | null;
    outputTarget: string | null;
    taskBrief: string | null;
    status: string;
  };
  roadmap: {
    id: string;
    title: string;
    status: string;
    mapRevision: number;
    hasPlannedStages: boolean;
  } | null;
  units: DomainMapUnit[];
  nodes: DomainMapNode[];
  progress: LearningProgress;
};

export type RouteSuggestion = {
  id: string;
  domainId: string;
  sourceNodeId: string;
  level: RouteSuggestionLevel;
  title: string;
  rationale: string;
  changesMap: boolean;
  status: RouteSuggestionStatus;
  payload: Record<string, unknown>;
};

export function getKnowledgeNodeStatusLabel(status?: string | null) {
  if (!status) return "未知";
  return knowledgeNodeStatusLabels[status as KnowledgeNodeStatus] || status;
}

export function getKnowledgeRelationStatusLabel(status?: string | null) {
  if (!status) return "未知";
  return (
    knowledgeRelationStatusLabels[status as KnowledgeRelationStatus] || status
  );
}

export function getEvidenceStrengthLabel(strength?: string | null) {
  if (!strength) return "未知";
  return evidenceStrengthLabels[strength as EvidenceStrength] || strength;
}

export function getRelationKindLabel(kind?: string | null) {
  if (!kind) return "相关";
  const labels: Record<string, string> = {
    prerequisite: "前置关系",
    cause: "因果",
    derive: "推导",
    analogy: "类比",
    contrast: "对比",
    category: "分类",
    application: "应用",
    counterexample: "反例",
    transfer: "迁移",
    evidence: "证据",
    boundary: "边界",
    related: "相关",
    WORMHOLE: "虫洞"
  };
  return labels[kind] || kind;
}

export function getLearningNodeStatusLabel(status?: string | null) {
  if (!status) return "未知";
  return learningNodeStatusLabels[status as LearningNodeStatus] || status;
}

export function getLearningNodeTypeLabel(type?: string | null) {
  if (!type) return "未知类型";
  return learningNodeTypeLabels[type as LearningNodeType] || type;
}

export function getRouteSuggestionStatusLabel(status?: string | null) {
  if (!status) return "未知";
  return routeSuggestionStatusLabels[status as RouteSuggestionStatus] || status;
}

export function getDomainStatusLabel(status?: string | null) {
  if (!status) return "未知";
  return domainStatusLabels[status as DomainStatus] || status;
}
