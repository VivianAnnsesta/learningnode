import { beforeEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "./route";

const confirmTaskBriefMock = vi.hoisted(() => vi.fn());

vi.mock("../../../../../lib/learning/domainService", () => ({
  confirmTaskBrief: confirmTaskBriefMock
}));

describe("PATCH /api/domains/:id/task-brief", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("confirms the persisted task brief", async () => {
    const domain = {
      id: "domain-1",
      taskBrief: "A persisted brief",
      taskBriefConfirmedAt: "2026-07-19T04:00:00.000Z"
    };
    confirmTaskBriefMock.mockResolvedValue(domain);

    const response = await PATCH(new Request("http://localhost"), {
      params: Promise.resolve({ id: "domain-1" })
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ domain });
    expect(confirmTaskBriefMock).toHaveBeenCalledWith("domain-1");
  });

  it("returns a stable client error for an invalid confirmation", async () => {
    confirmTaskBriefMock.mockRejectedValue(
      new Error("请先保存任务书，再确认。")
    );

    const response = await PATCH(new Request("http://localhost"), {
      params: Promise.resolve({ id: "domain-1" })
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "请先保存任务书，再确认。"
    });
  });

  it("returns not found for a missing domain", async () => {
    confirmTaskBriefMock.mockRejectedValue(new Error("学习领域不存在"));

    const response = await PATCH(new Request("http://localhost"), {
      params: Promise.resolve({ id: "missing" })
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "学习领域不存在"
    });
  });
});
