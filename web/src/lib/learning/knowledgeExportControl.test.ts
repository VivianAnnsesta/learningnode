import nodeProcess from "node:process";
import { afterEach, describe, expect, it, vi } from "vitest";
import { knowledgeExportCaptureBudget, runKnowledgeExportOperation } from "./knowledgeExportControl";
import { KNOWLEDGE_EXPORT_TIMEOUT_MS } from "./knowledgeExportContracts";

const state = nodeProcess as typeof nodeProcess & { [key: symbol]: unknown };
afterEach(() => { vi.useRealTimers(); delete state[Symbol.for("englishnode.knowledgeExportOperation.v1")]; });
const gate = () => { let release!: () => void; const promise = new Promise<void>(resolve => { release = resolve; }); return { promise, release }; };

describe("导出原始预算与单活动生命周期", () => {
  it("JSON精确计量UTF8、转义、数组逗号和嵌套修订，边界完整或拒绝", () => {
    const snapshot = { records: [] as { revisions: { raw: string }[] }[], ids: [] as string[] }, budget = knowledgeExportCaptureBudget(snapshot, 1000);
    const record = { revisions: [] as { raw: string }[] }; budget.append(snapshot.records, record); budget.append(snapshot.ids, "😀"); budget.append(record.revisions, { raw: "\r\n\0é" }); budget.append(record.revisions, { raw: "第二项" });
    expect(budget.bytes).toBe(Buffer.byteLength(JSON.stringify(snapshot), "utf8"));
    const exact = { items: [] as string[] }, size = Buffer.byteLength(JSON.stringify({ items: ["é"] }));
    knowledgeExportCaptureBudget(exact, size).append(exact.items, "é"); expect(exact.items).toEqual(["é"]);
    const rejected = { items: [] as string[] }; expect(() => knowledgeExportCaptureBudget(rejected, size - 1).append(rejected.items, "é")).toThrow(expect.objectContaining({ status: 413 })); expect(rejected.items).toEqual([]);
  });

  it("取消响应后仍占slot，真实后台settle后才允许下一导出", async () => {
    const entered = gate(), finish = gate(), controller = new AbortController();
    const result = runKnowledgeExportOperation(async control => { entered.release(); await finish.promise; control.check(); return "late"; }, { signal: controller.signal });
    await entered.promise; const rejected = expect(result).rejects.toMatchObject({ status: 499 }); controller.abort(); await rejected;
    await expect(runKnowledgeExportOperation(async () => "wrong")).rejects.toMatchObject({ status: 503 });
    finish.release(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(await runKnowledgeExportOperation(async () => "next")).toBe("next");
  });

  it("绝对30秒超时不释放仍pending的工作，也不把超时伪装成数据库中断", async () => {
    vi.useFakeTimers(); const entered = gate(), finish = gate();
    const result = runKnowledgeExportOperation(async control => { entered.release(); await finish.promise; control.check(); return "late"; });
    await entered.promise; const rejected = expect(result).rejects.toMatchObject({ status: 504 }); await vi.advanceTimersByTimeAsync(KNOWLEDGE_EXPORT_TIMEOUT_MS); await rejected;
    await expect(runKnowledgeExportOperation(async () => "overlap")).rejects.toMatchObject({ status: 503 });
    finish.release(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(await runKnowledgeExportOperation(async () => "next")).toBe("next");
  });

  it("预先取消不运行工作，普通失败也清理slot且不同模块实例共用门", async () => {
    const controller = new AbortController(); controller.abort(); const operation = vi.fn(async () => "unused");
    await expect(runKnowledgeExportOperation(operation, { signal: controller.signal })).rejects.toMatchObject({ status: 499 }); expect(operation).not.toHaveBeenCalled();
    await expect(runKnowledgeExportOperation(async () => { throw new Error("original failure"); })).rejects.toThrow("original failure");
    const entered = gate(), finish = gate(), running = runKnowledgeExportOperation(async () => { entered.release(); await finish.promise; return "done"; }); await entered.promise;
    vi.resetModules(); const other = await import("./knowledgeExportControl"); expect(other.runKnowledgeExportOperation).not.toBe(runKnowledgeExportOperation);
    await expect(other.runKnowledgeExportOperation(async () => "overlap")).rejects.toMatchObject({ status: 503 }); finish.release(); expect(await running).toBe("done"); expect(await other.runKnowledgeExportOperation(async () => "next")).toBe("next");
  });
});
