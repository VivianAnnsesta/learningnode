import { describe, expect, it } from "vitest";
import { createKnowledgeDateMatcher, defaultKnowledgeViewConfig, knowledgeViewConfigFromQuery, knowledgeViewConfigToQuery, parseKnowledgeDateFilter, parseKnowledgeViewConfig, parseKnowledgeViewTitle, recordSourceCategory } from "./knowledgeViewContracts";

describe("saved knowledge view contracts", () => {
  it("defaults preserve the old view and return independent editable values", () => {
    const first = defaultKnowledgeViewConfig(), second = defaultKnowledgeViewConfig();
    expect(first.filters.date).toEqual({ mode: "all", field: "updated", timeZone: "UTC" });
    expect(first.displayFields).toEqual(["summary", "aliases", "collections"]);
    first.displayFields.pop();
    expect(second.displayFields).toHaveLength(3);
    expect(knowledgeViewConfigToQuery(second).toString()).toBe("");
    expect(knowledgeViewConfigFromQuery(new URLSearchParams())).toEqual(second);
  });
  it("normalizes fixed ordering without evaluating unknown properties", () => {
    const config = parseKnowledgeViewConfig({ displayFields: ["updatedAt", "summary", "kind"], filters: { sourceType: "legacy_user", q: "条件", kind: "question" } });
    expect(config.displayFields).toEqual(["summary", "kind", "updatedAt"]);
    expect(config.filters.sourceType).toBe("legacy_user");
    expect(knowledgeViewConfigFromQuery(knowledgeViewConfigToQuery(config))).toEqual(config);
  });
  it("preserves explicit title-only fields and all-mode timezone preferences", () => {
    const config = parseKnowledgeViewConfig({ displayFields: [], filters: { date: { mode: "all", field: "created", timeZone: "Asia/Shanghai" } } });
    const query = knowledgeViewConfigToQuery(config);
    expect(query.get("fields")).toBe("none");
    expect(query.get("timeZone")).toBe("Asia/Shanghai");
    expect(knowledgeViewConfigFromQuery(query)).toEqual(config);
  });
  it.each([
    null, [], { extra: true }, { filters: { magic: true } }, { filters: { sourceType: "verified" } },
    { filters: { kind: "unresolved" } }, { filters: { sort: "score" } }, { filters: { domainId: "bad\\id" } },
    { filters: { q: "bad\0query" } }, { displayFields: ["title"] }, { displayFields: ["summary", "summary"] },
    { displayFields: ["<script>"] }, { displayFields: "summary" }
  ])("rejects unsupported or malformed configuration %#", value => expect(() => parseKnowledgeViewConfig(value)).toThrow());
  it.each(["fields=", "sourceType=verified", "dateMode=", "dateField=", "timeZone=", "dateMode=all&dateFrom=2026-01-01", "dateMode=range&dateDays=7", "dateMode=last_days&dateDays=7&dateTo=2026-01-01", "q=one&q=two", "fields=summary&fields=kind", "unknown=x", "q=a%00b", "offset=20"])("rejects an ambiguous/unsupported URL %s", query => {
    expect(() => knowledgeViewConfigFromQuery(new URLSearchParams(query))).toThrow();
  });
  it("allows pagination only for the API and leaves its numeric validation to listPage", () => {
    expect(knowledgeViewConfigFromQuery(new URLSearchParams("offset=50&limit=20&q=AI"), { allowPagination: true }).filters.q).toBe("AI");
    expect(() => knowledgeViewConfigFromQuery(new URLSearchParams("offset=0&offset=1"), { allowPagination: true })).toThrow();
  });
  it.each(["", " ", "a\nb", "\ud800", "x".repeat(121), null])("rejects invalid view titles %#", title => expect(() => parseKnowledgeViewTitle(title)).toThrow());
  it("keeps valid titles and all historical source categories separate", () => {
    expect(parseKnowledgeViewTitle("  本周疑问  ")).toBe("本周疑问");
    for (const raw of ["user", "accepted_ai", "excerpt", "legacy_user", "legacy_ai_or_unknown", "legacy_unknown"]) expect(recordSourceCategory(raw)).toBe(raw);
    expect(recordSourceCategory("future_source")).toBe("legacy_unknown");
    expect(recordSourceCategory(undefined)).toBe("legacy_unknown");
  });
});

describe("calendar-day date filtering", () => {
  it.each([
    { mode: "range" }, { mode: "range", from: "2025-02-29" }, { mode: "range", to: "2026-13-01" },
    { mode: "range", from: "2026-1-01" }, { mode: "range", from: "0000-01-01" }, { mode: "range", from: "2026-03-02", to: "2026-03-01" },
    { mode: "last_days", days: 0 }, { mode: "last_days", days: 1.5 }, { mode: "last_days", days: 3661 }, { mode: "last_days", days: "7" },
    { mode: "all", field: "learned" }, { mode: "all", timeZone: "+01:00" }, { mode: "all", timeZone: "Not/AZone" },
    { mode: "all", timeZone: "UTC\n" }, { mode: "formula" }
  ])("rejects invalid dates, windows and zones %#", value => expect(() => parseKnowledgeDateFilter(value)).toThrow());
  it("accepts real leap dates and open-ended ranges", () => {
    expect(parseKnowledgeDateFilter({ mode: "range", from: "2024-02-29" })).toEqual({ mode: "range", field: "updated", timeZone: "UTC", from: "2024-02-29" });
    expect(parseKnowledgeDateFilter({ mode: "range", to: "0001-01-01" })).toMatchObject({ to: "0001-01-01" });
    expect(parseKnowledgeDateFilter({ mode: "all", timeZone: "US/Pacific" }).timeZone).toBe("US/Pacific");
  });
  it("compares selected local dates and includes both calendar boundaries", () => {
    const matcher = createKnowledgeDateMatcher({ mode: "range", field: "created", timeZone: "America/Los_Angeles", from: "2026-11-01", to: "2026-11-01" });
    const matches = (createdAt: string) => matcher.matches({ createdAt, updatedAt: "2020-01-01T00:00:00Z" });
    expect(matches("2026-11-01T06:59:59.999Z")).toBe(false);
    expect(matches("2026-11-01T07:00:00.000Z")).toBe(true);
    expect(matches("2026-11-02T07:59:59.999Z")).toBe(true);
    expect(matches("2026-11-02T08:00:00.000Z")).toBe(false);
  });
  it("spring-forward recent days count calendar days rather than fixed 24-hour periods", () => {
    const matcher = createKnowledgeDateMatcher({ mode: "last_days", field: "updated", timeZone: "America/Los_Angeles", days: 2 }, new Date("2026-03-09T06:30:00Z"));
    expect(matcher.window).toEqual({ field: "updated", timeZone: "America/Los_Angeles", from: "2026-03-07", to: "2026-03-08" });
    expect(matcher.matches({ createdAt: 0, updatedAt: "2026-03-07T08:00:00Z" })).toBe(true);
    expect(matcher.matches({ createdAt: 0, updatedAt: "2026-03-09T06:59:59.999Z" })).toBe(true);
    expect(matcher.matches({ createdAt: 0, updatedAt: "2026-03-09T07:00:00Z" })).toBe(false);
  });
  it("fall-back repeated hours belong to the same calendar day", () => {
    const matcher = createKnowledgeDateMatcher({ mode: "last_days", field: "updated", timeZone: "America/Los_Angeles", days: 1 }, new Date("2026-11-02T07:30:00Z"));
    expect(matcher.window).toMatchObject({ from: "2026-11-01", to: "2026-11-01" });
    for (const updatedAt of ["2026-11-01T08:30:00Z", "2026-11-01T09:30:00Z"]) expect(matcher.matches({ createdAt: 0, updatedAt })).toBe(true);
  });
  it("uses the selected timestamp and selected zone independently of the host", () => {
    const updated = createKnowledgeDateMatcher({ mode: "range", field: "updated", timeZone: "Asia/Shanghai", from: "2026-11-09", to: "2026-11-09" });
    const created = createKnowledgeDateMatcher({ mode: "range", field: "created", timeZone: "Asia/Shanghai", from: "2026-11-09", to: "2026-11-09" });
    const record = { createdAt: "2026-11-08T00:00:00Z", updatedAt: "2026-11-08T16:00:00Z" };
    expect(updated.matches(record)).toBe(true); expect(created.matches(record)).toBe(false);
  });
  it("captures its window once and returns all records when dates are unrestricted", () => {
    const now = new Date("2026-11-09T12:00:00Z");
    const matcher = createKnowledgeDateMatcher({ mode: "last_days", field: "created", timeZone: "UTC", days: 1 }, now);
    now.setUTCDate(20);
    expect(matcher.window?.to).toBe("2026-11-09");
    expect(matcher.matches({ createdAt: "2026-11-09T23:59:59Z", updatedAt: 0 })).toBe(true);
    expect(createKnowledgeDateMatcher({ mode: "all", field: "updated", timeZone: "UTC" }).window).toBeNull();
    expect(createKnowledgeDateMatcher({ mode: "all", field: "updated", timeZone: "UTC" }).matches({ createdAt: "invalid", updatedAt: "invalid" })).toBe(true);
    expect(() => matcher.matches({ createdAt: "invalid", updatedAt: 0 })).toThrow("记录日期");
  });
});
