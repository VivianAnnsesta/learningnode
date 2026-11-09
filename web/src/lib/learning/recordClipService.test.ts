import nodeProcess from "node:process";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { previewRecordClip, resolveRecordClipSource } from "./recordClipService";
import { RecordClipPublicHtmlError } from "../security/recordClipPublicHtml";
import { RECORD_CLIP_RECEIPT_TTL_MS, RECORD_CLIP_STORE_ENTRIES, type RecordClipPreview } from "./recordClipContracts";

const deps = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock("../security/recordClipPublicHtml", async original => ({ ...await original<typeof import("../security/recordClipPublicHtml")>(), fetchRecordClipPublicHtml: deps.fetch }));
const processState = nodeProcess as typeof nodeProcess & { [key: symbol]: unknown };
const clearStore = () => { delete processState[Symbol.for("englishnode.recordClipStore.v1")]; };
const capture = () => ({ requestedUrl: "https://example.com/requested", finalUrl: "https://example.com/final", title: "服务器标题", text: "第一段原文。\r\n\r\n第二段原文。\n\n重复原文。", capturedAt: new Date().toISOString(), truncated: false, limitations: ["只提取公开HTML的可读文字，内容未核实。"] });
const pasted = (text = "第一段原文。\r\n\r\n第二段原文。\n\n重复原文。") => previewRecordClip({ mode: "pasted", title: "本人选文", text, url: "https://example.com/declared" });
const source = (preview: RecordClipPreview, fragmentIds = [preview.fragments[0].id]) => ({ kind: "clip", snapshotKey: preview.snapshotKey, receiptId: preview.receiptId, fragmentIds });

describe("剪藏临时凭据纯服务边界", () => {
  beforeEach(() => { clearStore(); deps.fetch.mockReset(); });
  afterEach(() => { clearStore(); vi.useRealTimers(); });

  it("本人选文保持CRLF/选片位置，声明URL不被当成网页取得，返回值不能篡改store", async () => {
    const { preview } = await pasted(); const original = structuredClone(preview), descriptor = source(preview);
    expect(preview.obtained).toBe(false); expect(preview.finalUrl).toBeNull(); expect(preview.requestedUrl).toBe("https://example.com/declared"); expect(preview.extractionVersion).toBe("pasted-text-v1");
    expect(preview.limitations.join(" ")).toContain("收到"); expect(deps.fetch).not.toHaveBeenCalled();
    preview.title = "伪造标题"; preview.fragments[0].text = "恶意替换";
    const saved = resolveRecordClipSource(descriptor); expect(saved.title).toBe(original.title); expect(saved.fragments[0]).toEqual(original.fragments[0]);
    expect(saved).not.toHaveProperty("receiptId"); expect(saved).not.toHaveProperty("text"); expect(saved).not.toHaveProperty("expiresAt");
  });

  it("网页身份/重定向/取得时间全部取服务端，重读产生新receipt与固定捕获", async () => {
    deps.fetch.mockImplementation(async () => capture());
    const a = (await previewRecordClip({ mode: "web", url: "https://example.com/requested" })).preview;
    const b = (await previewRecordClip({ mode: "web", url: "https://example.com/requested" })).preview;
    expect(a).toMatchObject({ obtained: true, mode: "web", title: "服务器标题", finalUrl: "https://example.com/final", extractionVersion: "html-text-v1" }); expect(a.receiptId).not.toBe(b.receiptId);
    expect(resolveRecordClipSource(source(a)).capturedAt).toBe(a.capturedAt); expect(deps.fetch).toHaveBeenCalledTimes(2);
  });

  it("预览请求白名单拒绝伪造取得、捕获时间和未知元数据", async () => {
    for (const value of [{ mode: "web", url: "https://example.com", obtained: true }, { mode: "pasted", text: "选文", capturedAt: new Date().toISOString() }, { mode: "pasted", text: "选文", finalUrl: "https://example.com" }, { mode: "web", url: "http://example.com" }, { mode: "pasted", text: "" }, { mode: "pasted", text: "x".repeat(32001) }]) await expect(previewRecordClip(value)).rejects.toMatchObject({ status: 400 });
    expect(deps.fetch).not.toHaveBeenCalled();
  });

  it("只映射受信transport错误类，不透任意status或内部错误消息", async () => {
    for (const [code, status] of [["BLOCKED_ADDRESS", 400], ["TOO_LARGE", 413], ["UNSUPPORTED_MEDIA", 415], ["EMPTY_TEXT", 422], ["UPSTREAM", 502], ["BUSY", 503], ["TIMEOUT", 504], ["ABORTED", 499]] as const) {
      deps.fetch.mockRejectedValueOnce(new RecordClipPublicHtmlError(code)); await expect(previewRecordClip({ mode: "web", url: "https://example.com" })).rejects.toMatchObject({ status });
    }
    deps.fetch.mockRejectedValueOnce(Object.assign(new Error("private transport detail"), { status: 201 }));
    await expect(previewRecordClip({ mode: "web", url: "https://example.com" })).rejects.toMatchObject({ status: 502, message: "公开网页取得失败，请重试或明确选择本人提供文字。" });
  });

  it("取消前不取得，取得返回后取消也不签发可用捕获", async () => {
    const controller = new AbortController(); controller.abort();
    await expect(previewRecordClip({ mode: "web", url: "https://example.com" }, { signal: controller.signal })).rejects.toMatchObject({ status: 499 }); expect(deps.fetch).not.toHaveBeenCalled();
    const late = new AbortController(); deps.fetch.mockImplementationOnce(async () => { late.abort(); return capture(); });
    await expect(previewRecordClip({ mode: "web", url: "https://example.com" }, { signal: late.signal })).rejects.toMatchObject({ status: 499 }); expect(processState[Symbol.for("englishnode.recordClipStore.v1")]).toBeUndefined();
  });

  it("绝对15分钟到界即失效，读取/保存解析均不续期", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-09T12:00:00Z"));
    const { preview } = await pasted(); const descriptor = source(preview);
    vi.setSystemTime(new Date(Date.parse(preview.expiresAt) - 1)); expect(resolveRecordClipSource(descriptor).snapshotKey).toBe(preview.snapshotKey);
    vi.setSystemTime(new Date(Date.parse(preview.expiresAt))); expect(() => resolveRecordClipSource(descriptor)).toThrow(expect.objectContaining({ status: 410 }));
    expect(Date.parse(preview.expiresAt) - Date.parse(preview.capturedAt)).toBe(RECORD_CLIP_RECEIPT_TTL_MS);
  });

  it("正确receipt配伪造key或片段仍400，不消费原捕获，未知receipt410", async () => {
    const a = (await pasted("原文A")).preview, b = (await pasted("原文B")).preview;
    expect(() => resolveRecordClipSource({ ...source(a), snapshotKey: b.snapshotKey })).toThrow(expect.objectContaining({ status: 400 }));
    expect(() => resolveRecordClipSource({ ...source(a), fragmentIds: [b.fragments[0].id] })).toThrow(expect.objectContaining({ status: 400 }));
    expect(() => resolveRecordClipSource({ ...source(a), receiptId: "z".repeat(43) })).toThrow(expect.objectContaining({ status: 410 }));
    expect(resolveRecordClipSource(source(a)).fragments[0]).toEqual(a.fragments[0]);
  });

  it("64项容量支持30个来源，溢出只淘汰最早捕获，不被读取晋升", async () => {
    const previews: RecordClipPreview[] = [];
    for (let i = 0; i < RECORD_CLIP_STORE_ENTRIES; i++) previews.push((await pasted(`选文${i}`)).preview);
    for (const preview of previews.slice(0, 30)) expect(resolveRecordClipSource(source(preview)).snapshotKey).toBe(preview.snapshotKey);
    await pasted("第65份"); expect(() => resolveRecordClipSource(source(previews[0]))).toThrow(expect.objectContaining({ status: 410 }));
    expect(resolveRecordClipSource(source(previews[1])).snapshotKey).toBe(previews[1].snapshotKey);
  });

  it("完整JSON超过256KiB失败413且不挤掉可用旧捕获", async () => {
    const good = (await pasted("旧捕获")).preview;
    await expect(pasted("\0".repeat(32000))).rejects.toMatchObject({ status: 413 }); expect(resolveRecordClipSource(source(good)).title).toBe(good.title);
  });

  it("重新加载不同模块实例仍通过node:process共用凭据，解析结果复制后不污染原文", async () => {
    const { preview } = await pasted(); vi.resetModules(); const other = await import("./recordClipService");
    expect(other.resolveRecordClipSource).not.toBe(resolveRecordClipSource);
    const result = other.resolveRecordClipSource(source(preview)); result.fragments[0].text = "改动返回结果";
    expect(resolveRecordClipSource(source(preview)).fragments[0].text).toBe(preview.fragments[0].text);
  });
});
