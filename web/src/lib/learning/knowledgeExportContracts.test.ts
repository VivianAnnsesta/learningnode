import { describe, expect, it } from "vitest";
import { defaultKnowledgeViewConfig } from "./knowledgeViewContracts";
import { KNOWLEDGE_EXPORT_MAX_BYTES, KNOWLEDGE_EXPORT_MAX_FILES, knowledgeExportEffectiveFilters, knowledgeExportFilename, knowledgeExportHeaders, parseKnowledgeExportDownloadHeaders, parseKnowledgeExportRequest, type KnowledgeExportArchive } from "./knowledgeExportContracts";

const base = () => ({ scope: { mode: "view" as const, filters: defaultKnowledgeViewConfig().filters, observedDateWindow: null }, includeHistory: true });
const archive = (): KnowledgeExportArchive => ({ bytes: new Uint8Array(200), filename: knowledgeExportFilename("2026-11-09T17:30:00.123Z"), sha256: "a".repeat(64), recordCount: 1, revisionCount: 1, fileCount: 3 });

describe("explicit export scope", () => {
  it("represents all matching records without page or visible-field state", () => {
    const request = base(); request.scope.filters.q = "ＡＩ\\原文🙂"; request.scope.filters.domainId = "domain-x";
    expect(parseKnowledgeExportRequest(request)).toEqual(request);
    expect(knowledgeExportEffectiveFilters(parseKnowledgeExportRequest(request))).toEqual(request.scope.filters);
    expect(request.scope.filters.q).toBe("ＡＩ\\原文🙂");
  });
  it("requires an explicit history choice and allows opaque safe record identities", () => {
    expect(parseKnowledgeExportRequest({ scope: { mode: "record", pointId: "记录:原身份/🙂" }, includeHistory: false })).toEqual({ scope: { mode: "record", pointId: "记录:原身份/🙂" }, includeHistory: false });
    expect(knowledgeExportEffectiveFilters(parseKnowledgeExportRequest({ scope: { mode: "record", pointId: "one" }, includeHistory: true }))).toBeNull();
  });
  it.each([
    { value: undefined }, { value: [] }, { value: {} }, { value: { scope: base().scope } },
    { value: { ...base(), includeHistory: "true" } }, { value: { ...base(), includeHistory: null } },
    { value: { ...base(), offset: 50 } }, { value: { ...base(), scope: { ...base().scope, calendarMonth: "2026-11" } } },
    { value: { ...base(), scope: { ...base().scope, displayFields: ["summary"] } } },
    { value: { ...base(), scope: { mode: "view", filters: {}, observedDateWindow: null } } },
    { value: { ...base(), scope: { mode: "view", filters: { ...base().scope.filters, offset: 0 }, observedDateWindow: null } } },
    { value: { ...base(), scope: { mode: "view", filters: { ...base().scope.filters, date: {} }, observedDateWindow: null } } },
    { value: { scope: { mode: "record", pointId: "" }, includeHistory: false } },
    { value: { scope: { mode: "record", pointId: " one " }, includeHistory: false } },
    { value: { scope: { mode: "record", pointId: "one\n" }, includeHistory: false } },
    { value: { scope: { mode: "record", pointId: "one", filters: {} }, includeHistory: true } },
    { value: { scope: { mode: "unknown" }, includeHistory: true } }
  ])("rejects missing, mixed or widening scope $value", ({ value }) => expect(() => parseKnowledgeExportRequest(value)).toThrow());
});

describe("displayed civil date window", () => {
  it("freezes a relative window even if the export is prepared after midnight", () => {
    const value = base();
    const filters = { ...value.scope.filters, date: { mode: "last_days" as const, field: "created" as const, timeZone: "America/Los_Angeles", days: 7 } };
    const window = { field: "created" as const, timeZone: "America/Los_Angeles", from: "2026-03-03", to: "2026-03-09" };
    const parsed = parseKnowledgeExportRequest({ scope: { mode: "view", filters, observedDateWindow: window }, includeHistory: true });
    expect(knowledgeExportEffectiveFilters(parsed)?.date).toEqual({ mode: "range", field: "created", timeZone: "America/Los_Angeles", from: "2026-03-03", to: "2026-03-09" });
    expect(filters.date.mode).toBe("last_days"); expect(parsed.scope.mode === "view" && parsed.scope.filters.date.mode).toBe("last_days");
  });
  it("keeps the year-one clamp and leap-day civil spans", () => {
    for (const [from, to, days] of [["0001-01-01", "0001-01-03", 7], ["2024-02-28", "2024-03-01", 3], ["9999-12-31", "9999-12-31", 1]] as const) {
      const filters = { ...base().scope.filters, date: { mode: "last_days" as const, field: "recorded" as const, timeZone: "UTC", days } };
      const request = parseKnowledgeExportRequest({ scope: { mode: "view", filters, observedDateWindow: { field: "recorded", timeZone: "UTC", from, to } }, includeHistory: false });
      expect(knowledgeExportEffectiveFilters(request)?.date).toEqual({ mode: "range", field: "recorded", timeZone: "UTC", from, to });
    }
  });
  it("retains an open explicit boundary rather than filling it from today", () => {
    const filters = { ...base().scope.filters, date: { mode: "range" as const, field: "updated" as const, timeZone: "UTC", from: "2026-01-01" } };
    const parsed = parseKnowledgeExportRequest({ scope: { mode: "view", filters, observedDateWindow: { field: "updated", timeZone: "UTC", from: "2026-01-01", to: null } }, includeHistory: false });
    expect(knowledgeExportEffectiveFilters(parsed)?.date).toEqual(filters.date);
  });
  it.each([
    { window: null }, { window: { field: "updated", timeZone: "UTC", from: "2026-11-03", to: "2026-11-09" } },
    { window: { field: "created", timeZone: "Asia/Tokyo", from: "2026-11-03", to: "2026-11-09" } },
    { window: { field: "created", timeZone: "UTC", from: "2026-11-02", to: "2026-11-09" } },
    { window: { field: "created", timeZone: "UTC", from: null, to: "2026-11-09" } },
    { window: { field: "created", timeZone: "UTC", from: "2026-02-30", to: "2026-03-06" } },
    { window: { field: "created", timeZone: "UTC", from: "0000-01-01", to: "0000-01-07" } },
    { window: { field: "created", timeZone: "UTC", from: "2026-11-09", to: "2026-11-03" } },
    { window: { field: "created", timeZone: "UTC", from: "2026-11-03", to: "2026-11-09", days: 7 } }
  ])("refuses a missing or mismatched applied window $window", ({ window }) => {
    const filters = { ...base().scope.filters, date: { mode: "last_days", field: "created", timeZone: "UTC", days: 7 } };
    expect(() => parseKnowledgeExportRequest({ scope: { mode: "view", filters, observedDateWindow: window }, includeHistory: false })).toThrow();
  });
  it("does not let observed windows add or change an all/range filter", () => {
    expect(() => parseKnowledgeExportRequest({ ...base(), scope: { ...base().scope, observedDateWindow: { field: "updated", timeZone: "UTC", from: "2026-01-01", to: null } } })).toThrow();
    const filters = { ...base().scope.filters, date: { mode: "range", field: "updated", timeZone: "UTC", from: "2026-01-01" } };
    expect(() => parseKnowledgeExportRequest({ scope: { mode: "view", filters, observedDateWindow: { field: "updated", timeZone: "UTC", from: "2026-01-02", to: null } }, includeHistory: true })).toThrow();
  });
});

describe("attachment identity and bounded download metadata", () => {
  it("uses a server-time basename without user titles or paths", () => {
    expect(knowledgeExportFilename("2026-11-09T17:30:00.123Z")).toBe("englishnode-knowledge-20261109T173000123Z.zip");
    expect(() => knowledgeExportFilename("2026-02-30T17:30:00.123Z")).toThrow(); expect(() => knowledgeExportFilename("../../secret")).toThrow();
  });
  it("round-trips explicit digest, byte budget and row counts", () => {
    const data = archive(), headers = new Headers(knowledgeExportHeaders(data));
    expect(parseKnowledgeExportDownloadHeaders(headers)).toEqual({ ...data, bytes: 200 });
    expect(headers.get("Cache-Control")).toBe("no-store, no-transform"); expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
  it("uses the archive byte identity even if wire Content-Length is compressed or absent", () => {
    const headers = new Headers(knowledgeExportHeaders(archive())); headers.set("Content-Length", "17"); headers.set("Content-Encoding", "gzip");
    expect(parseKnowledgeExportDownloadHeaders(headers).bytes).toBe(200); headers.delete("Content-Length"); expect(parseKnowledgeExportDownloadHeaders(headers).bytes).toBe(200);
  });
  it("permits an empty matched library with its index and manifest", () => {
    const data = { ...archive(), recordCount: 0, revisionCount: 0, fileCount: 2 };
    expect(parseKnowledgeExportDownloadHeaders(new Headers(knowledgeExportHeaders(data))).recordCount).toBe(0);
  });
  it.each([
    { field: "Content-Type", value: "application/json" }, { field: "Content-Disposition", value: 'attachment; filename="../../secret.zip"' },
    { field: "Content-Disposition", value: "attachment; filename*=UTF-8''%E7%94%A8%E6%88%B7.zip" }, { field: "Content-Disposition", value: "inline" },
    { field: "X-EnglishNode-Export-Sha256", value: "not-a-digest" }, { field: "X-EnglishNode-Export-Bytes", value: String(KNOWLEDGE_EXPORT_MAX_BYTES + 1) },
    { field: "X-EnglishNode-Export-Bytes", value: "21" }, { field: "X-EnglishNode-Export-Bytes", value: "200trailing" },
    { field: "X-EnglishNode-Export-Record-Count", value: "-1" }, { field: "X-EnglishNode-Export-Revision-Count", value: "1.5" },
    { field: "X-EnglishNode-Export-File-Count", value: String(KNOWLEDGE_EXPORT_MAX_FILES + 1) }, { field: "X-EnglishNode-Export-File-Count", value: "2" }
  ])("does not hand off an unverified attachment $field=$value", ({ field, value }) => {
    const headers = new Headers(knowledgeExportHeaders(archive())); headers.set(field, value); expect(() => parseKnowledgeExportDownloadHeaders(headers)).toThrow();
  });
});
