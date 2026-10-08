import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { domainStatuses, type DomainStatus } from "./types";

export type LearningDomainInput = {
  name?: string;
  description?: string | null;
  currentLevel?: string | null;
  goal?: string | null;
  scope?: string | null;
  excludedScope?: string | null;
  depth?: string | null;
  outputType?: string | null;
  outputTarget?: string | null;
  taskBrief?: string | null;
  status?: string | null;
};

const learningDomainSelect = {
  id: true,
  name: true,
  description: true,
  currentLevel: true,
  goal: true,
  scope: true,
  excludedScope: true,
  depth: true,
  outputType: true,
  outputTarget: true,
  taskBrief: true,
  entryGuideJson: true,
  taskBriefConfirmedAt: true,
  roadmapTitle: true,
  roadmapStatus: true,
  courseDesignStatus: true,
  courseDesignRepairCount: true,
  courseDesignConfirmedAt: true,
  courseDesignAiCallLogId: true,
  status: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.DomainSelect;

type LearningDomainRecord = Prisma.DomainGetPayload<{
  select: typeof learningDomainSelect;
}>;

export interface LearningDomainDto {
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
  entryGuide: {draft: import("../ai/tasks").TaskBriefDraft;aiCallLogId:string} | null;
  taskBriefConfirmedAt: Date | null;
  roadmapTitle: string | null;
  roadmapStatus: string;
  courseDesignStatus: string;
  courseDesignRepairCount: number;
  courseDesignConfirmedAt: Date | null;
  courseDesignAiCallLogId: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

const normalizeOptional = (value?: string | null) => {
  const next = value?.trim();
  return next ? next : null;
};

const normalizeStatus = (value?: string | null): DomainStatus | undefined => {
  const next = value?.trim();
  if (!next) return undefined;
  return domainStatuses.includes(next as DomainStatus)
    ? (next as DomainStatus)
    : undefined;
};

const courseResearchInputKeys = [
  "name",
  "description",
  "currentLevel",
  "goal",
  "scope",
  "excludedScope",
  "depth",
  "outputType",
  "outputTarget",
  "taskBrief"
] as const;

function toLearningDomainDto(domain: LearningDomainRecord): LearningDomainDto {
  return {
    id: domain.id,
    name: domain.name,
    description: domain.description,
    currentLevel: domain.currentLevel,
    goal: domain.goal,
    scope: domain.scope,
    excludedScope: domain.excludedScope,
    depth: domain.depth,
    outputType: domain.outputType,
    outputTarget: domain.outputTarget,
    taskBrief: domain.taskBrief,
    entryGuide: domain.entryGuideJson ? JSON.parse(domain.entryGuideJson) : null,
    taskBriefConfirmedAt: domain.taskBriefConfirmedAt,
    roadmapTitle: domain.roadmapTitle,
    roadmapStatus: domain.roadmapStatus,
    courseDesignStatus: domain.courseDesignStatus,
    courseDesignRepairCount: domain.courseDesignRepairCount,
    courseDesignConfirmedAt: domain.courseDesignConfirmedAt,
    courseDesignAiCallLogId: domain.courseDesignAiCallLogId,
    status: domain.status,
    createdAt: domain.createdAt,
    updatedAt: domain.updatedAt
  };
}

export async function listLearningDomains(): Promise<LearningDomainDto[]> {
  const domains = await prisma.domain.findMany({
    orderBy: { updatedAt: "desc" },
    select: learningDomainSelect
  });

  return domains.map(toLearningDomainDto);
}

export async function getLearningDomain(
  id: string
): Promise<LearningDomainDto | null> {
  const domain = await prisma.domain.findUnique({
    where: { id },
    select: learningDomainSelect
  });

  return domain ? toLearningDomainDto(domain) : null;
}

export async function createLearningDomain(
  input: LearningDomainInput
): Promise<LearningDomainDto> {
  const name = input.name?.trim();
  if (!name) {
    throw new Error("学习领域名称不能为空");
  }

  const status = normalizeStatus(input.status) ?? "active";

  return prisma.$transaction(async (tx) => {
    const domain = await tx.domain.create({
      data: {
        name,
        description: normalizeOptional(input.description),
        currentLevel: normalizeOptional(input.currentLevel),
        goal: normalizeOptional(input.goal),
        scope: normalizeOptional(input.scope),
        excludedScope: normalizeOptional(input.excludedScope),
        depth: normalizeOptional(input.depth),
        outputType: normalizeOptional(input.outputType),
        outputTarget: normalizeOptional(input.outputTarget),
        taskBrief: normalizeOptional(input.taskBrief),
        status
      },
      select: learningDomainSelect
    });
    return toLearningDomainDto(domain);
  });
}

export async function updateLearningDomain(
  id: string,
  input: LearningDomainInput
): Promise<LearningDomainDto> {
  const data: Prisma.DomainUpdateInput = {};

  if (input.name !== undefined) {
    const name = input.name?.trim();
    if (!name) {
      throw new Error("学习领域名称不能为空");
    }
    data.name = name;
  }

  if (input.description !== undefined) {
    data.description = normalizeOptional(input.description);
  }
  if (input.currentLevel !== undefined) {
    data.currentLevel = normalizeOptional(input.currentLevel);
  }
  if (input.goal !== undefined) data.goal = normalizeOptional(input.goal);
  if (input.scope !== undefined) data.scope = normalizeOptional(input.scope);
  if (input.excludedScope !== undefined) {
    data.excludedScope = normalizeOptional(input.excludedScope);
  }
  if (input.depth !== undefined) data.depth = normalizeOptional(input.depth);
  if (input.outputType !== undefined) {
    data.outputType = normalizeOptional(input.outputType);
  }
  if (input.outputTarget !== undefined) {
    data.outputTarget = normalizeOptional(input.outputTarget);
  }
  if (input.taskBrief !== undefined) {
    data.taskBrief = normalizeOptional(input.taskBrief);
  }
  if (input.status !== undefined) {
    const status = normalizeStatus(input.status);
    if (!status) {
      throw new Error("无效的学习领域状态");
    }
    data.status = status;
  }

  if (Object.keys(data).length === 0) {
    throw new Error("未提供可更新字段");
  }

  return prisma.$transaction(async (tx) => {
    const suppliedResearchInputKeys = courseResearchInputKeys.filter(
      (key) => input[key] !== undefined
    );
    const previous = suppliedResearchInputKeys.length
      ? await tx.domain.findUnique({
          where: { id },
          select: {
            name: true,
            description: true,
            currentLevel: true,
            goal: true,
            scope: true,
            excludedScope: true,
            depth: true,
            outputType: true,
            outputTarget: true,
            taskBrief: true,
            courseDesignDraft: true,
            roadmapDraftJson: true,
            mapRevision: true
          }
        })
      : null;
    const planningInputsChanged = suppliedResearchInputKeys.some((key) => {
      const previousValue = previous?.[key];
      const nextValue = input[key];
      return normalizeOptional(previousValue) !== normalizeOptional(nextValue);
    });
    const hasCourseDesignArtifact = Boolean(previous?.courseDesignDraft);
    const hasMapArtifact = Boolean(
      previous?.roadmapDraftJson || (previous?.mapRevision || 0) > 0
    );
    const hasPlanningArtifacts = hasCourseDesignArtifact || hasMapArtifact;

    const updated = await tx.domain.update({
      where: { id },
      data: planningInputsChanged
        ? {
            ...data,
            taskBriefConfirmedAt: null,
            ...(hasCourseDesignArtifact
              ? {
                  courseDesignStatus: "needs_review",
                  courseDesignConfirmedAt: null
                }
              : {}),
            ...(hasMapArtifact
              ? {
                  roadmapStatus: "needs_review"
                }
              : {})
          }
        : data,
      select: learningDomainSelect
    });

    if (!planningInputsChanged || !hasPlanningArtifacts) {
      return toLearningDomainDto(updated);
    }

    if (hasMapArtifact) {
      await tx.learningNode.updateMany({
        where: {
          domainId: id,
          status: {
            notIn: ["completed", "mastered", "skipped"]
          }
        },
        data: { status: "needs_review" }
      });
    }

    const invalidatedArtifacts = [
      hasCourseDesignArtifact ? "course design" : null,
      hasMapArtifact ? "domain map" : null
    ].filter(Boolean);

    await tx.aiCallLog.create({
      data: {
        domainId: id,
        taskType: hasMapArtifact ? "roadmap_generation" : "course_research",
        provider: "user",
        status: "success",
        inputSummary: "Course research inputs changed after planning artifacts were created.",
        outputSummary: `Existing ${invalidatedArtifacts.join(" and ")} marked as needs_review.`
      }
    });

    return toLearningDomainDto(updated);
  });
}

export async function confirmTaskBrief(id: string): Promise<LearningDomainDto> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.domain.findUnique({
      where: { id },
      select: { taskBrief: true }
    });

    if (!existing) {
      throw new Error("学习领域不存在");
    }
    if (!existing.taskBrief?.trim()) {
      throw new Error("请先保存任务书，再确认。");
    }

    const domain = await tx.domain.update({
      where: { id },
      data: { taskBriefConfirmedAt: new Date() },
      select: learningDomainSelect
    });
    return toLearningDomainDto(domain);
  });
}

export async function deleteLearningDomain(id: string) {
  await prisma.$transaction(async (tx) => {
    await tx.domain.delete({ where: { id } });
  });
}
