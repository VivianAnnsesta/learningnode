import { beforeEach, describe, expect, it, vi } from "vitest";
import { getPlanningLog, listPlanningLogs } from "./planningLogService";
import { planningLogTasks } from "./planningLogTypes";

const mocks = vi.hoisted(() => ({ domain: vi.fn(), findFirst: vi.fn(), findMany: vi.fn() }));
vi.mock("../prisma", () => ({ prisma: { domain: { findUnique: mocks.domain }, aiCallLog: { findFirst: mocks.findFirst, findMany: mocks.findMany } } }));

describe("planning log read boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.domain.mockResolvedValue({ id: "domain-1" });
    mocks.findFirst.mockResolvedValue(null);
    mocks.findMany.mockResolvedValue([]);
  });
  it("restricts all reads to domain planning tasks and leaves hidden teaching material inaccessible", async () => {
    await listPlanningLogs("domain-1");
    const query = mocks.findMany.mock.calls[0][0];
    expect(query.where).toEqual({ taskType: { in: [...planningLogTasks] }, OR: [{ domainId: "domain-1" }, { domainId: null, canvasId: "domain-1" }] });
    expect(query.select.rawOutput).toBeUndefined();
    expect(query.where.taskType.in).not.toContain("node_segment_preparation");
    expect(query.where.taskType.in).not.toContain("node_lesson_feedback");
    await expect(getPlanningLog("domain-1", "another-domain-or-teaching-log")).rejects.toMatchObject({ status: 404 });
    expect(mocks.findFirst.mock.calls[0][0].where).toMatchObject({ id: "another-domain-or-teaching-log", ...query.where });
  });
  it("rejects a foreign cursor before reading the next page", async () => {
    await expect(listPlanningLogs("domain-1", { cursor: "foreign-log" })).rejects.toMatchObject({ status: 404 });
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
  it("returns bounded summaries with a scoped pagination cursor", async () => {
    const row = { id: "log-1", createdAt: new Date(), finishedAt: null };
    mocks.findMany.mockResolvedValue([row, { ...row, id: "log-2" }]);
    const page = await listPlanningLogs("domain-1", { limit: 1 });
    expect(page.logs).toHaveLength(1);
    expect(page.nextCursor).toBe("log-1");
    await expect(listPlanningLogs("domain-1", { limit: 51 })).rejects.toMatchObject({ status: 400 });
  });
});
