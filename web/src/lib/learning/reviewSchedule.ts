const DAY_IN_MS = 24 * 60 * 60 * 1000;

const baseIntervals: Record<string, number> = {
  seen: 1,
  can_recall: 3,
  can_apply: 7,
  can_transfer: 14,
  integrated: 30,
  needs_review: 1,
  island: 5
};

export type ReviewScheduleInput = {
  masteryStatus?: string | null;
  isIsland?: boolean | null;
  previousIntervalDays?: number | null;
  now?: Date;
};

export type ReviewScheduleResult = {
  lastReviewedAt: Date;
  nextReviewAt: Date;
  reviewIntervalDays: number;
  schedulingReason: string;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export function resolveReviewIntervalDays({
  masteryStatus,
  isIsland,
  previousIntervalDays
}: Omit<ReviewScheduleInput, "now">) {
  if (isIsland) {
    return 5;
  }

  const normalizedStatus = masteryStatus?.trim() || "seen";
  const baseInterval = baseIntervals[normalizedStatus] || 3;

  if (
    previousIntervalDays &&
    ["can_apply", "can_transfer", "integrated"].includes(normalizedStatus)
  ) {
    return clamp(Math.round(previousIntervalDays * 1.5), baseInterval, 60);
  }

  return baseInterval;
}

export function buildReviewSchedule(
  input: ReviewScheduleInput
): ReviewScheduleResult {
  const now = input.now || new Date();
  const reviewIntervalDays = resolveReviewIntervalDays(input);
  const nextReviewAt = new Date(now.getTime() + reviewIntervalDays * DAY_IN_MS);

  let schedulingReason = `按当前掌握状态安排 ${reviewIntervalDays} 天后复盘。`;
  if (input.isIsland) {
    schedulingReason = "当前仍为知识孤岛，5 天后重新激活并检查可连接性。";
  } else if ((input.masteryStatus || "").trim() === "needs_review") {
    schedulingReason = "当前仍需复盘，明天优先重新检查。";
  } else if (
    input.previousIntervalDays &&
    reviewIntervalDays > input.previousIntervalDays
  ) {
    schedulingReason = `本次复盘稳定，复盘间隔扩展到 ${reviewIntervalDays} 天。`;
  }

  return {
    lastReviewedAt: now,
    nextReviewAt,
    reviewIntervalDays,
    schedulingReason
  };
}

export function isReviewDue(value?: Date | string | null, now = new Date()) {
  if (!value) return false;
  const nextReviewAt = value instanceof Date ? value : new Date(value);
  return nextReviewAt.getTime() <= now.getTime();
}

export function getDaysSince(value?: Date | string | null, now = new Date()) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Math.max(0, Math.floor((now.getTime() - date.getTime()) / DAY_IN_MS));
}

export function getReviewBucket(
  value?: Date | string | null,
  now = new Date()
): "overdue" | "due_today" | "upcoming" | "future" | "unscheduled" {
  if (!value) return "unscheduled";

  const target = value instanceof Date ? value : new Date(value);
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday.getTime() + DAY_IN_MS);
  const endOfHorizon = new Date(startOfToday.getTime() + 7 * DAY_IN_MS);

  if (target.getTime() < startOfToday.getTime()) return "overdue";
  if (target.getTime() < startOfTomorrow.getTime()) return "due_today";
  if (target.getTime() <= endOfHorizon.getTime()) return "upcoming";
  return "future";
}
