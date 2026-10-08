import { describe, expect, it } from "vitest";
import {
  buildReviewSchedule,
  getReviewBucket,
  resolveReviewIntervalDays
} from "./reviewSchedule";

describe("reviewSchedule", () => {
  it("uses base intervals for newly learned statuses", () => {
    expect(resolveReviewIntervalDays({ masteryStatus: "seen" })).toBe(1);
    expect(resolveReviewIntervalDays({ masteryStatus: "can_recall" })).toBe(3);
    expect(resolveReviewIntervalDays({ masteryStatus: "integrated" })).toBe(30);
  });

  it("expands intervals for stable advanced mastery", () => {
    expect(
      resolveReviewIntervalDays({
        masteryStatus: "can_apply",
        previousIntervalDays: 7
      })
    ).toBe(11);
    expect(
      resolveReviewIntervalDays({
        masteryStatus: "integrated",
        previousIntervalDays: 50
      })
    ).toBe(60);
  });

  it("keeps islands on a short reactivation cadence", () => {
    const schedule = buildReviewSchedule({
      masteryStatus: "can_transfer",
      isIsland: true,
      previousIntervalDays: 14,
      now: new Date("2026-06-22T00:00:00.000Z")
    });

    expect(schedule.reviewIntervalDays).toBe(5);
    expect(schedule.nextReviewAt.toISOString()).toBe("2026-06-27T00:00:00.000Z");
  });

  it("categorizes review buckets around the current day", () => {
    const now = new Date(2026, 5, 22, 8, 0, 0);
    expect(getReviewBucket(new Date(2026, 5, 21, 23, 0, 0), now)).toBe(
      "overdue"
    );
    expect(getReviewBucket(new Date(2026, 5, 22, 20, 0, 0), now)).toBe(
      "due_today"
    );
    expect(getReviewBucket(new Date(2026, 5, 25, 20, 0, 0), now)).toBe(
      "upcoming"
    );
    expect(getReviewBucket(new Date(2026, 6, 5, 20, 0, 0), now)).toBe("future");
  });
});
