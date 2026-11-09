import { describe, expect, it } from "vitest";
import { knowledgeRecordHref, knowledgeReturnView, knowledgeSourceView, knowledgeViewForConfig, knowledgeViewForFilters, normalizeKnowledgeView, PERSONAL_KNOWLEDGE_PATH } from "./knowledgeNavigation";
import { knowledgeViewConfigFromQuery, parseKnowledgeViewConfig } from "../../lib/learning/knowledgeViewContracts";

describe("personal-network return navigation", () => {
  it("normalizes only the five view filters with stable ordering and defaults", () => {
    expect(normalizeKnowledgeView("/learning/knowledge?sort=updated_desc&kind=question&q=%E6%9D%A1%E4%BB%B6&domainId=&collectionId=topic"))
      .toBe("/learning/knowledge?q=%E6%9D%A1%E4%BB%B6&collectionId=topic&kind=question");
    expect(knowledgeViewForFilters({ q: "条件 & a=b", domainId: "math", kind: "understanding", sort: "title_asc" }))
      .toBe("/learning/knowledge?q=%E6%9D%A1%E4%BB%B6+%26+a%3Db&domainId=math&kind=understanding&sort=title_asc");
    expect(normalizeKnowledgeView("/learning/knowledge?domainId=&kind=&sort=" )).toBe(PERSONAL_KNOWLEDGE_PATH);
    expect(normalizeKnowledgeView("/learning/knowledge?q=%5Cd%2B")).toBe("/learning/knowledge?q=%5Cd%2B");
  });

  it.each([
    "https://evil.example/learning/knowledge", "//evil.example/learning/knowledge", "javascript:alert(1)",
    "learning/knowledge", "/learning/knowledge/", "/learning/history", "/learning/knowledge#x",
    "/learning/knowledge\\evil?q=x", "/learning/knowledge?domainId=%5Cevil", "/learning/knowledge?q=%00",
    "/learning/knowledge?q=x\n", "/learning/knowledge?kind=mastered", "/learning/knowledge?sort=custom",
    "/learning/knowledge?q=a&q=b", "/learning/knowledge?domainId=a&domainId=", "/learning/knowledge?unknown=x",
    "/learning/knowledge?returnTo=%2Flearning%2Fknowledge", "/learning/knowledge?kind=question&kind=note"
  ])("rejects unsafe or ambiguous target %s", value => {
    expect(normalizeKnowledgeView(value)).toBeNull();
    expect(knowledgeReturnView(new URLSearchParams({ returnTo: value }).toString())).toBe(PERSONAL_KNOWLEDGE_PATH);
  });

  it("uses exactly one validated returnTo without recursively nesting source views", () => {
    const view = knowledgeViewForFilters({ q: "概率", domainId: "math", kind: "question", sort: "title_asc" });
    const a = knowledgeRecordHref("record-a", view);
    const sourceFromA = knowledgeSourceView("/learning/knowledge/record-a", new URL(a, "http://localhost").search);
    const b = knowledgeRecordHref("record-b", sourceFromA);
    expect(knowledgeReturnView(new URL(b, "http://localhost").search)).toBe(view);
    expect(new URL(b, "http://localhost").searchParams.get("returnTo")).toBe(view);
    expect(knowledgeReturnView("?returnTo=/learning/knowledge&returnTo=/learning/knowledge?q=x")).toBe(PERSONAL_KNOWLEDGE_PATH);
    expect(knowledgeReturnView("")).toBe(PERSONAL_KNOWLEDGE_PATH);
  });

  it("canonicalizes a domain alias using the actual explicit domain selection", () => {
    expect(knowledgeSourceView("/learning/domains/math/knowledge-graph", "?q=条件&kind=question"))
      .toBe("/learning/knowledge?q=%E6%9D%A1%E4%BB%B6&domainId=math&kind=question");
    expect(knowledgeSourceView("/learning/domains/math/knowledge-graph", "?domainId=&kind=note"))
      .toBe("/learning/knowledge?kind=note");
    expect(knowledgeSourceView("/learning/domains/math/knowledge-graph", "?domainId=physics"))
      .toBe("/learning/knowledge?domainId=physics");
    expect(knowledgeSourceView("/learning/domains/%5Cevil/knowledge-graph", "")).toBe(PERSONAL_KNOWLEDGE_PATH);
  });

  it("keeps record identities inside the same route and falls back safely", () => {
    expect(knowledgeRecordHref("a/b?x=1", "https://evil.example")).toBe("/learning/knowledge/a%2Fb%3Fx%3D1");
    expect(knowledgeSourceView("/settings/ai", "?returnTo=https://evil.example")).toBe(PERSONAL_KNOWLEDGE_PATH);
    expect(knowledgeSourceView("/learning/knowledge", "?q=x&sort=title_asc")).toBe("/learning/knowledge?q=x&sort=title_asc");
  });

  it("preserves source, date timezone and selected display fields across record navigation", () => {
    const config = parseKnowledgeViewConfig({ filters: { q: "概率", sourceType: "legacy_ai_or_unknown", date: { mode: "range", field: "created", from: "2026-11-01", to: "2026-11-09", timeZone: "America/Los_Angeles" } }, displayFields: ["kind", "createdAt", "sourceType"] });
    const view = knowledgeViewForConfig(config);
    const record = knowledgeRecordHref("source-record", view);
    const returned = knowledgeReturnView(new URL(record, "http://localhost").search);
    expect(returned).toBe(view);
    expect(knowledgeViewConfigFromQuery(new URL(returned, "http://localhost").searchParams)).toEqual(config);
    expect(knowledgeSourceView("/learning/knowledge/source-record", new URL(record, "http://localhost").search)).toBe(view);
  });

  it("distinguishes title-only and relative-date preferences from omitted defaults", () => {
    const view = knowledgeViewForFilters({ fields: "none", dateMode: "last_days", dateDays: "7", dateField: "created", timeZone: "UTC" });
    const parsed = knowledgeViewConfigFromQuery(new URL(view, "http://localhost").searchParams);
    expect(parsed.displayFields).toEqual([]);
    expect(parsed.filters.date).toEqual({ mode: "last_days", field: "created", timeZone: "UTC", days: 7 });
    const alias = knowledgeSourceView("/learning/domains/math/knowledge-graph", new URL(view, "http://localhost").search);
    expect(knowledgeViewConfigFromQuery(new URL(alias, "http://localhost").searchParams).filters.domainId).toBe("math");
  });

  it("restores the calendar reading month and literal assigned-date filter through all record jumps", () => {
    const config = parseKnowledgeViewConfig({ filters: { q: "补写", domainId: "math", date: { field: "recorded", mode: "range", from: "2026-10-01", to: "2026-10-01", timeZone: "Asia/Shanghai" } }, displayFields: ["summary", "recordDate"] });
    const view = knowledgeViewForConfig(config, { calendarMonth: "2026-11" });
    expect(new URL(view, "http://localhost").searchParams.get("calendarMonth")).toBe("2026-11");
    const first = knowledgeRecordHref("first", view);
    const source = knowledgeSourceView("/learning/knowledge/first", new URL(first, "http://localhost").search);
    const second = knowledgeRecordHref("second", source);
    expect(knowledgeReturnView(new URL(second, "http://localhost").search)).toBe(view);
    const parsed = knowledgeViewConfigFromQuery(new URL(view, "http://localhost").searchParams);
    expect(parsed).toEqual(config);
    expect(parsed).not.toHaveProperty("calendarMonth");
    expect(knowledgeSourceView("/learning/domains/math/knowledge-graph", "?calendarMonth=2026-11&dateField=recorded"))
      .toBe("/learning/knowledge?domainId=math&dateField=recorded&calendarMonth=2026-11");
  });

  it.each(["", "0000-01", "2026-13", "2026-1", "2026-11-01", "2026-11&calendarMonth=2026-12"])("rejects invalid or repeated calendar reading state: %s", month => {
    expect(normalizeKnowledgeView(`${PERSONAL_KNOWLEDGE_PATH}?q=retained&calendarMonth=${month}`)).toBeNull();
  });

  it.each([
    "sourceType=scientifically_verified", "dateMode=range&dateFrom=2026-02-30", "dateMode=all&dateDays=7", "dateMode=last_days&dateDays=0",
    "dateMode=last_days&dateDays=7&dateFrom=2026-11-01", "timeZone=%2B08%3A00", "fields=summary,summary", "fields=execute", "sourceType=user&sourceType=excerpt"
  ])("does not broaden an invalid extended view: %s", query => {
    expect(normalizeKnowledgeView(`${PERSONAL_KNOWLEDGE_PATH}?${query}`)).toBeNull();
  });
});
