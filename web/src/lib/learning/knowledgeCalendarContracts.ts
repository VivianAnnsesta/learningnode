import { parseCalendarMonth } from "./civilDateContracts";
import { parseKnowledgeFilters, parseKnowledgeViewConfig, type KnowledgeDateField, type KnowledgeDateWindow, type KnowledgeViewConfig, type KnowledgeViewFilters } from "./knowledgeViewContracts";

export type KnowledgeRecordCalendarResult = {
  month: string;
  field: KnowledgeDateField;
  timeZone: string;
  today: string;
  dateWindow: KnowledgeDateWindow;
  filters: KnowledgeViewFilters;
  days: { date: string; count: number }[];
  total: number;
  undatedCount: number;
  unavailableDateCount: number;
  unavailableReason?: string;
};
const calendarNames = ["month", "q", "domainId", "collectionId", "kind", "sourceType", "sort", "dateField", "timeZone"];
export function parseKnowledgeCalendarQuery(params: URLSearchParams): { month?: string; filters: KnowledgeViewFilters } {
  const seen = new Set<string>();
  for (const [name] of params) {
    if (!calendarNames.includes(name) || seen.has(name)) throw new Error("月历地址包含未知或重复条件。");
    seen.add(name);
  }
  const get = (name: string) => params.has(name) ? params.get(name)! : undefined;
  const month = params.has("month") ? parseCalendarMonth(params.get("month")) : undefined;
  const filters = parseKnowledgeFilters({ q: get("q"), domainId: get("domainId"), collectionId: get("collectionId"), kind: get("kind"), sourceType: get("sourceType"), sort: get("sort"), date: { mode: "all", field: get("dateField"), timeZone: get("timeZone") } });
  return { ...(month !== undefined ? { month } : {}), filters };
}
export function knowledgeCalendarQuery(value: KnowledgeViewConfig, month?: string): URLSearchParams {
  const { filters } = parseKnowledgeViewConfig(value), params = new URLSearchParams();
  for (const name of ["q", "domainId", "collectionId", "kind", "sourceType", "sort"] as const) if (filters[name]) params.set(name, filters[name]);
  params.set("dateField", filters.date.field); params.set("timeZone", filters.date.timeZone);
  if (month !== undefined) params.set("month", parseCalendarMonth(month));
  return params;
}
