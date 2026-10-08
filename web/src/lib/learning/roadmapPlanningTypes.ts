import type { DimensionKey } from "./teachingDimensions";

export type CourseContentQuestion = {
  key: string;
  question: string;
  contentRequirements: string[];
  dimensionKeys: DimensionKey[];
  requirementIndices?: number[];
  contribution?: string;
};

export type RoadmapModuleKeyQuestion = {
  contentQuestionKey?: string;
  contentRequirements?: string[];
  dimensionKeys?: DimensionKey[];
  goalKeys?: string[];
  key: string;
  question: string;
  checkableOutcome: string;
};

export type RoadmapModuleBlueprint = {
  goalKeys?: string[];
  key: string;
  title: string;
  goal: string;
  keyQuestions: RoadmapModuleKeyQuestion[];
};

export type LearningGoal = { key: string; description: string; contentQuestions?: CourseContentQuestion[] };
export type StageProblem = { question: string; steps: string[] };
export type KnowledgeBoundary = { version: 1; assumedKnowledge: string[]; newKnowledge: string[] };
export type ContentContribution = {
  contentQuestionKey: string;
  requirementIndices: number[];
  dimensionKeys: DimensionKey[];
  contribution: string;
};
export type ConceptLearningUnit = {
  version: 1 | 2;
  newKnowledge: string;
  assumedKnowledge: string[];
  teachingTasks: string[];
  example: string;
  references: { key: string; purpose: string }[];
  contentContributions?: ContentContribution[];
};
export type ConceptProfile = { name: string; aliases: string[]; scope: string; problemRole: string; learningUnit?: ConceptLearningUnit };
export type ConceptReference = { key: string; planningQuestionKeys: string[]; problemRole: string; contentContributions?: ContentContribution[] };

export type ContentMaterialPosition = {
  contentQuestionKey: string; nodeId: string; nodeKey: string; nodeTitle: string;
  sessionId: string; lessonVersion: number; segmentId: string; segmentKey: string;
  materialVersion: number; stepKey: string; dimensionKeys: DimensionKey[];
  requirementIndices?: number[];
  basis: string; sourceIds: string[];
  contribution?: string;
};
export type CourseContentCoverage = CourseContentQuestion & {
  goalKey: string;
  status: "planned" | "material_ready" | "needs_supplement";
  missingDimensionKeys: DimensionKey[];
  missingRequirementIndices: number[];
  unassignedRequirementIndices: number[];
  unassignedDimensionKeys: DimensionKey[];
  missingContributionConceptKeys: string[];
  pendingConceptKeys: string[];
  unexpandedAssignments: {stageKey:string;moduleKey:string;planningQuestionKey:string}[];
  assignments: {stageKey:string;moduleKey:string;planningQuestionKey:string;concepts:{key:string;id:string;title:string;reused:boolean;contribution?:Omit<ContentContribution, "contentQuestionKey">}[]}[];
  materials: ContentMaterialPosition[];
};
