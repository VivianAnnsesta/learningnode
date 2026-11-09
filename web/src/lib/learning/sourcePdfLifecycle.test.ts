import { beforeEach, describe, expect, it, vi } from "vitest";
import { extractPdfText } from "./sourceGroundingService";

const pdf = vi.hoisted(() => ({ getDocument: vi.fn() }));
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({ getDocument: pdf.getDocument }));

beforeEach(() => { pdf.getDocument.mockReset(); });

describe("PDF loading-task cleanup (mock lifecycle only)", () => {
  it("destroys the loading task when document loading rejects", async () => {
    const failure = new Error("document loading failed"), destroy = vi.fn().mockResolvedValue(undefined);
    pdf.getDocument.mockReturnValue({ get promise() { return Promise.reject(failure); }, destroy });

    await expect(extractPdfText(new Uint8Array([1]), 1200)).rejects.toBe(failure);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("destroys the loading task when page text extraction rejects", async () => {
    const failure = new Error("page text failed"), destroy = vi.fn().mockResolvedValue(undefined);
    const document = { numPages: 1, getMetadata: vi.fn().mockResolvedValue({ info: {} }), getPage: vi.fn().mockResolvedValue({ getTextContent: vi.fn().mockRejectedValue(failure) }) };
    pdf.getDocument.mockReturnValue({ promise: Promise.resolve(document), destroy });

    await expect(extractPdfText(new Uint8Array([1]), 1200)).rejects.toBe(failure);
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("destroys the loading task after successful extraction", async () => {
    const destroy = vi.fn().mockResolvedValue(undefined);
    const document = { numPages: 1, getMetadata: vi.fn().mockResolvedValue({ info: { Title: "Example" } }), getPage: vi.fn().mockResolvedValue({ getTextContent: vi.fn().mockResolvedValue({ items: [{ str: "Actual text" }] }) }) };
    pdf.getDocument.mockReturnValue({ promise: Promise.resolve(document), destroy });

    const result = await extractPdfText(new Uint8Array([1]), 1200);
    expect(result).toEqual({ title: "Example", excerpt: "Actual text", fragments: [{ location: "PDF 第 1 页，字符 1", text: "Actual text" }] });
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
