import { describe, expect, it } from "vitest";
import { knowledgeCalendarQuery, parseKnowledgeCalendarQuery } from "./knowledgeCalendarContracts";
import { knowledgeViewConfigFromQuery, knowledgeViewConfigToQuery, parseKnowledgeViewConfig } from "./knowledgeViewContracts";

describe("月历查询与既有检索视图兼容", () => {
  it("月概览只使用基础条件和日期依据，不偷带当前单日/相对范围", () => {
    const config = parseKnowledgeViewConfig({ filters: { q: "字面%_😀", domainId: "domain", collectionId: "topic", kind: "question", sourceType: "legacy_unknown", sort: "title_asc", date: { mode: "range", field: "recorded", timeZone: "US/Pacific", from: "2026-11-09", to: "2026-11-09" } }, displayFields: ["recordDate"] });
    const query = knowledgeCalendarQuery(config, "2026-11"), parsed = parseKnowledgeCalendarQuery(query);
    expect([...query.keys()].sort()).toEqual(["collectionId", "dateField", "domainId", "kind", "month", "q", "sort", "sourceType", "timeZone"].sort());
    expect(parsed).toEqual({ month: "2026-11", filters: { ...config.filters, date: { mode: "all", field: "recorded", timeZone: "US/Pacific" } } });
  });
  it("未提供month时保留未指定，由server同now决定当前月", () => {
    expect(parseKnowledgeCalendarQuery(new URLSearchParams()).month).toBeUndefined();
    expect(parseKnowledgeCalendarQuery(new URLSearchParams()).filters.date).toEqual({ mode: "all", field: "updated", timeZone: "UTC" });
  });
  it.each(["month=", "month=2026-13", "month=0000-01", "month=2026-11&month=2026-12", "q=a&q=b", "dateField=verified", "timeZone=", "dateMode=range", "dateFrom=2026-11-09", "dateTo=2026-11-09", "dateDays=7", "fields=recordDate", "calendarMonth=2026-11", "offset=10", "unknown=x", "q=a%00b", "sourceType=verified"])("拒绝混入单日范围、重复或未知字段 %s", query => {
    expect(() => parseKnowledgeCalendarQuery(new URLSearchParams(query))).toThrow();
  });
  it("calendarMonth只作为明确阅读状态保留，不进入SavedView持久化形状", () => {
    const old = { filters: { q: "", domainId: "", collectionId: "", kind: "", sourceType: "", sort: "updated_desc", date: { mode: "all", field: "updated", timeZone: "UTC" } }, displayFields: ["summary", "aliases", "collections"] };
    const config = parseKnowledgeViewConfig(old); expect(config).toEqual(old);
    const query = knowledgeViewConfigToQuery(config, { calendarMonth: "2026-11" }); expect(query.toString()).toBe("calendarMonth=2026-11");
    expect(knowledgeViewConfigFromQuery(query)).toEqual(old); expect(knowledgeViewConfigToQuery(config).toString()).toBe("");
  });
  it.each(["calendarMonth=", "calendarMonth=2026-00", "calendarMonth=2026-11&calendarMonth=2026-12", "calendarMonth=2026-11-09"])("普通URL亦拒绝无效或重复月 %s", query => {
    expect(() => knowledgeViewConfigFromQuery(new URLSearchParams(query))).toThrow();
  });
  it("旧显示字段次序和默认值不变，新日期字段仅显式选择", () => {
    const old = parseKnowledgeViewConfig({ displayFields: ["summary", "kind", "sourceType", "aliases", "domains", "collections", "createdAt", "updatedAt"] });
    expect(old.displayFields).toEqual(["summary", "kind", "sourceType", "aliases", "domains", "collections", "createdAt", "updatedAt"]);
    const extended = parseKnowledgeViewConfig({ displayFields: ["recordDate", "summary"] }); expect(extended.displayFields).toEqual(["summary", "recordDate"]);
    expect(knowledgeViewConfigFromQuery(knowledgeViewConfigToQuery(extended, { calendarMonth: "2026-11" }))).toEqual(extended);
  });
});
