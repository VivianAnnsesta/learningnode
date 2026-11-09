import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { planningRequestSelect, planningRequestFingerprint, StalePlanningRequestError } from "./planningRequestSnapshot";
import {
  validateCourseDesignDraft,
  type CourseDesignDraft
} from "../ai/tasks";

type CourseDesignDomain = {
  name?: string | null;
  goal?: string | null;
  scope?: string | null;
  excludedScope?: string | null;
  depth?: string | null;
  currentLevel?: string | null;
  outputType?: string | null;
  outputTarget?: string | null;
  description?: string | null;
  taskBrief?: string | null;
};

const courseDesignStateSelect = {
  courseDesignDraft: true,
  courseDesignStatus: true,
  courseDesignRepairCount: true,
  courseDesignConfirmedAt: true,
  courseDesignAiCallLogId: true
} satisfies Prisma.DomainSelect;

type CourseDesignStateRecord = Prisma.DomainGetPayload<{
  select: typeof courseDesignStateSelect;
}>;

export interface CourseDesignStateDto {
  draft: CourseDesignDraft | null;
  status: string;
  repairCount: number;
  confirmedAt: Date | null;
  aiCallLogId: string | null;
}

const hasText = (value?: string | null) => Boolean(value?.trim());

export function getMissingCourseResearchInputs(domain: CourseDesignDomain) {
  const missing: string[] = [];

  if (!hasText(domain.name)) missing.push("学习领域");
  if (!hasText(domain.goal)) missing.push("学习目标");
  return missing;
}

export function assertCourseResearchInputs(domain: CourseDesignDomain) {
  const missing = getMissingCourseResearchInputs(domain);
  if (missing.length > 0) {
    throw new Error(`课程研究前仍缺少必要信息：${missing.join("、")}。`);
  }
}

function toCourseDesignStateDto(
  domain: CourseDesignStateRecord
): CourseDesignStateDto {
  const saved = domain.courseDesignDraft ? JSON.parse(domain.courseDesignDraft) as CourseDesignDraft : null;
  const draft = saved
    ? { ...validateCourseDesignDraft(saved), ...(saved.knowledgeReview ? { knowledgeReview: saved.knowledgeReview } : {}) }
    : null;

  return {
    draft,
    status: domain.courseDesignStatus,
    repairCount: domain.courseDesignRepairCount,
    confirmedAt: domain.courseDesignConfirmedAt,
    aiCallLogId: domain.courseDesignAiCallLogId
  };
}

export async function saveCourseDesignDraft(
  domainId: string,
  input: {
    draft: CourseDesignDraft;
    aiCallLogId?: string | null;
    repairCount?: number;
    expectedPlanningFingerprint?: string;
  }
): Promise<CourseDesignStateDto> {
  const repairCount = Math.max(0, Math.floor(input.repairCount || 0));

  const data = {
    courseDesignDraft: JSON.stringify(input.draft),
    courseDesignStatus: input.draft.qualityGate.passed ? "draft" : "incomplete",
    courseDesignRepairCount: repairCount,
    courseDesignConfirmedAt: null,
    courseDesignAiCallLogId: input.aiCallLogId || null
  };

  return prisma.$transaction(async (tx) => {
    // Read and write in one SQLite transaction: stale input/candidate cannot be revived,
    // including by the fallback path or another request with identical learner input.
    if (input.expectedPlanningFingerprint !== undefined) {
      const current = await tx.domain.findUnique({ where: { id: domainId }, select: planningRequestSelect });
      if (!current || planningRequestFingerprint(current) !== input.expectedPlanningFingerprint) throw new StalePlanningRequestError();
    }
    const domain = await tx.domain.update({
      where: { id: domainId },
      data,
      select: courseDesignStateSelect
    });

    return toCourseDesignStateDto(domain);
  });
}

export async function getCourseDesignState(
  domainId: string
): Promise<CourseDesignStateDto> {
  const domain = await prisma.domain.findUnique({
    where: { id: domainId },
    select: courseDesignStateSelect
  });

  if (!domain) {
    throw new Error("学习领域不存在");
  }

  return toCourseDesignStateDto(domain);
}

export async function confirmCourseDesign(
  domainId: string
): Promise<CourseDesignStateDto> {
  const state = await getCourseDesignState(domainId);

  if (!state.draft) {
    throw new Error("请先生成课程设计方向。");
  }
  if (!state.draft.qualityGate.passed) {
    throw new Error("课程设计方向未通过质量门，不能确认。");
  }
  if (state.draft.knowledgeReview?.verdict === "confirmed_error") throw new Error("课程有尚未纠正的明确知识错误，请先修订。");

  const data = {
      courseDesignStatus: "confirmed",
      courseDesignConfirmedAt: new Date()
  };

  await prisma.$transaction(async (tx) => {
    await tx.domain.update({
      where: { id: domainId },
      data
    });
    await tx.aiCallLog.create({
      data: {
        domainId,
        canvasId: domainId,
        taskType: "course_design_research",
        provider: "user",
        status: "success",
        inputSummary: "Course design direction confirmed by user.",
        outputSummary: "Course design is now eligible for roadmap generation."
      }
    });
  });

  return getCourseDesignState(domainId);
}

export async function getConfirmedCourseDesign(domainId: string) {
  const state = await getCourseDesignState(domainId);
  if (state.status !== "confirmed" || !state.draft) {
    throw new Error("请先确认课程设计方向，再生成或确认领域地图。");
  }
  if (!state.draft.qualityGate.passed) {
    throw new Error("课程设计方向未通过质量门，不能生成领域地图。");
  }
  if (state.draft.knowledgeReview?.verdict === "confirmed_error") throw new Error("课程有尚未纠正的明确知识错误，请先修订。");
  return state.draft;
}
