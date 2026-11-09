import { createCivilDayFormatter, parseCalendarMonth } from "./civilDateContracts";
import { parseAssignedRecordDate, readAssignedRecordDate } from "./recordDateContracts";

export const knowledgeRecordKinds = ["note", "question", "understanding", "example", "experience", "excerpt"] as const;
export const knowledgeSourceTypes = ["user", "accepted_ai", "excerpt", "legacy_user", "legacy_ai_or_unknown", "legacy_unknown"] as const;
export const knowledgeDisplayFields = ["summary", "kind", "sourceType", "aliases", "domains", "collections", "createdAt", "updatedAt", "recordDate"] as const;
export const defaultKnowledgeDisplayFields = ["summary", "aliases", "collections"] as const;
export type KnowledgeSourceType = typeof knowledgeSourceTypes[number];
export type KnowledgeDisplayField = typeof knowledgeDisplayFields[number];
export type KnowledgeDateField = "created" | "updated" | "recorded";
type DateCommon = { field: KnowledgeDateField; timeZone: string };
export type KnowledgeDateRecord = { createdAt: Date | string | number; updatedAt: Date | string | number; recordDate?: unknown; recordDateTimeZone?: unknown; recordDateUnavailableReason?: string };
export type KnowledgeDateFilter = DateCommon & ({ mode: "all" } | { mode: "range"; from?: string; to?: string } | { mode: "last_days"; days: number });
export type KnowledgeDateWindow = DateCommon & { from: string | null; to: string | null };
export type KnowledgeViewFilters = { q: string; domainId: string; collectionId: string; kind: "" | typeof knowledgeRecordKinds[number]; sourceType: "" | KnowledgeSourceType; sort: "updated_desc" | "title_asc"; date: KnowledgeDateFilter };
export type KnowledgeViewConfig = { filters: KnowledgeViewFilters; displayFields: KnowledgeDisplayField[] };

const controls = /\p{Cc}/u;
function object(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label}必须是有效配置。`);
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: readonly string[]) {
  if (Object.keys(value).some(key => !allowed.includes(key))) throw new Error("配置包含未知条件或字段。");
}
function text(value: unknown, label: string, max: number, fallback = "") {
  if (value === undefined) return fallback;
  if (typeof value !== "string" || value.length > max || controls.test(value)) throw new Error(`${label}无效。`);
  return value;
}
export function parseKnowledgeViewTitle(value: unknown): string {
  if (typeof value !== "string") throw new Error("请填写视图名称。");
  const title = value.trim();
  if (!title || title.length > 120 || controls.test(title) || [...title].some(character => {
    const code = character.codePointAt(0)!; return code >= 0xd800 && code <= 0xdfff;
  })) throw new Error("视图名称需为1至120个字符，不能包含控制字符或不完整Unicode。");
  return title;
}
function isoDate(value: unknown): string | undefined {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) throw new Error("日期需为有效的YYYY-MM-DD。");
  const date = new Date(`${value}T12:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("日期不存在，请检查年月日。");
  return value;
}
function zone(value: unknown): string {
  const name = text(value, "日期时区", 100, "UTC").trim();
  if (!name || /^[+-]/.test(name)) throw new Error("日期时区需为有效的IANA名称或UTC。");
  try { new Intl.DateTimeFormat("en", { timeZone: name }).format(0); }
  catch { throw new Error("日期时区无效，请使用IANA名称或UTC。"); }
  return name;
}
export function parseKnowledgeDateFilter(value: unknown): KnowledgeDateFilter {
  const input = value === undefined ? {} : object(value, "日期筛选");
  keys(input, ["mode", "field", "timeZone", "from", "to", "days"]);
  const mode = input.mode === undefined ? "all" : input.mode;
  const field = input.field === undefined ? "updated" : input.field;
  if (field !== "created" && field !== "updated" && field !== "recorded") throw new Error("日期依据无效。");
  const common: DateCommon = { field, timeZone: zone(input.timeZone) };
  const has = (key: string) => input[key] !== undefined && input[key] !== "";
  if (mode === "all") {
    if (has("from") || has("to") || has("days")) throw new Error("不限日期时不能混入日期范围或天数。");
    return { mode, ...common };
  }
  if (mode === "range") {
    if (has("days")) throw new Error("固定日期不能混入最近天数。");
    const from = isoDate(input.from), to = isoDate(input.to);
    if (!from && !to) throw new Error("请至少填写一个日期边界。");
    if (from && to && from > to) throw new Error("起始日期不能晚于结束日期。");
    return { mode, ...common, ...(from ? { from } : {}), ...(to ? { to } : {}) };
  }
  if (mode === "last_days") {
    if (has("from") || has("to")) throw new Error("最近天数不能混入固定日期。");
    if (typeof input.days !== "number" || !Number.isSafeInteger(input.days) || input.days < 1 || input.days > 3660) throw new Error("最近天数需为1至3660的整数。");
    return { mode, ...common, days: input.days };
  }
  throw new Error("日期范围模式无效。");
}
export function recordSourceCategory(raw: unknown): KnowledgeSourceType {
  return (knowledgeSourceTypes as readonly unknown[]).includes(raw) ? raw as KnowledgeSourceType : "legacy_unknown";
}
export function parseKnowledgeFilters(value: unknown): KnowledgeViewFilters {
  const input = value === undefined ? {} : object(value, "检索条件");
  keys(input, ["q", "domainId", "collectionId", "kind", "sourceType", "sort", "date"]);
  const q = text(input.q, "检索关键词", 2000), domainId = text(input.domainId, "领域条件", 200), collectionId = text(input.collectionId, "主题条件", 200);
  if (domainId.includes("\\") || collectionId.includes("\\")) throw new Error("领域或主题条件无效。");
  const kind = text(input.kind, "记录类型", 30), sourceType = text(input.sourceType, "内容来源", 40), sort = text(input.sort, "排序方式", 30, "updated_desc");
  if (kind && !(knowledgeRecordKinds as readonly string[]).includes(kind)) throw new Error("记录类型筛选无效。");
  if (sourceType && !(knowledgeSourceTypes as readonly string[]).includes(sourceType)) throw new Error("内容来源筛选无效。");
  if (sort !== "updated_desc" && sort !== "title_asc") throw new Error("记录排序方式无效。");
  return { q, domainId, collectionId, kind: kind as KnowledgeViewFilters["kind"], sourceType: sourceType as KnowledgeViewFilters["sourceType"], sort, date: parseKnowledgeDateFilter(input.date) };
}
export function parseKnowledgeViewConfig(value: unknown): KnowledgeViewConfig {
  const input = object(value, "视图");
  keys(input, ["filters", "displayFields"]);
  const fields = input.displayFields === undefined ? [...defaultKnowledgeDisplayFields] : input.displayFields;
  if (!Array.isArray(fields) || fields.length > knowledgeDisplayFields.length || fields.some(field => typeof field !== "string" || !(knowledgeDisplayFields as readonly string[]).includes(field)) || new Set(fields).size !== fields.length) throw new Error("显示字段无效或重复。");
  return { filters: parseKnowledgeFilters(input.filters), displayFields: knowledgeDisplayFields.filter(field => fields.includes(field)) };
}
export function defaultKnowledgeViewConfig(): KnowledgeViewConfig { return parseKnowledgeViewConfig({}); }

const queryNames = ["q", "domainId", "collectionId", "kind", "sort", "sourceType", "dateField", "dateMode", "dateFrom", "dateTo", "dateDays", "timeZone", "fields", "calendarMonth"] as const;
export function knowledgeViewConfigFromQuery(params: URLSearchParams, options: { allowPagination?: boolean } = {}): KnowledgeViewConfig {
  const seen = new Set<string>();
  for (const [name, value] of params) {
    if (!(queryNames as readonly string[]).includes(name) && !(options.allowPagination && ["offset", "limit"].includes(name))) throw new Error("检索地址包含未知条件。");
    if (seen.has(name) || controls.test(value)) throw new Error("检索地址包含重复或无效条件。");
    seen.add(name);
  }
  const get = (key: string) => params.get(key) || undefined;
  const explicit = (key: string) => params.has(key) ? params.get(key)! : undefined;
  const date = { mode: explicit("dateMode"), field: explicit("dateField"), timeZone: explicit("timeZone"), from: get("dateFrom"), to: get("dateTo"), days: params.has("dateDays") ? Number(params.get("dateDays")) : undefined };
  const fields = explicit("fields");
  if (params.has("calendarMonth")) parseCalendarMonth(params.get("calendarMonth"));
  return parseKnowledgeViewConfig({ filters: { q: get("q"), domainId: get("domainId"), collectionId: get("collectionId"), kind: get("kind"), sourceType: get("sourceType"), sort: get("sort"), date }, ...(fields !== undefined ? { displayFields: fields === "none" ? [] : fields.split(",") } : {}) });
}
export function knowledgeViewConfigToQuery(value: KnowledgeViewConfig, options: { calendarMonth?: string } = {}): URLSearchParams {
  const { filters, displayFields } = parseKnowledgeViewConfig(value), result = new URLSearchParams();
  for (const name of ["q", "domainId", "collectionId", "kind", "sort", "sourceType"] as const) if (filters[name] && !(name === "sort" && filters.sort === "updated_desc")) result.set(name, filters[name]);
  const date = filters.date;
  if (date.field !== "updated") result.set("dateField", date.field);
  if (date.mode !== "all") result.set("dateMode", date.mode);
  if (date.mode === "range") { if (date.from) result.set("dateFrom", date.from); if (date.to) result.set("dateTo", date.to); }
  if (date.mode === "last_days") result.set("dateDays", String(date.days));
  if (date.timeZone !== "UTC") result.set("timeZone", date.timeZone);
  if (JSON.stringify(displayFields) !== JSON.stringify(defaultKnowledgeDisplayFields)) result.set("fields", displayFields.length ? displayFields.join(",") : "none");
  if (options.calendarMonth !== undefined) result.set("calendarMonth", parseCalendarMonth(options.calendarMonth));
  return result;
}

export function createKnowledgeDateMatcher(value: KnowledgeDateFilter, now = new Date()) {
  const filter = parseKnowledgeDateFilter(value);
  let formatter: ReturnType<typeof createCivilDayFormatter> | undefined;
  const day = (value: Date | string | number) => { formatter ||= createCivilDayFormatter(filter.timeZone); return formatter(value); };
  const dateOf = (record: KnowledgeDateRecord): string | null => {
    if (filter.field !== "recorded") return day(filter.field === "created" ? record.createdAt : record.updatedAt);
    if (record.recordDateUnavailableReason) return null;
    if (record.recordDate && typeof record.recordDate === "object") {
      try { return parseAssignedRecordDate(record.recordDate)?.date || null; } catch { return null; }
    }
    return readAssignedRecordDate(record.recordDate ?? null, record.recordDateTimeZone ?? null).recordDate?.date || null;
  };
  if (filter.mode === "all") return { window: null, matches: (_record: KnowledgeDateRecord) => true, dateOf };
  let from: string | null = null, to: string | null = null;
  if (filter.mode === "range") { from = filter.from || null; to = filter.to || null; }
  else {
    to = day(now);
    if (!to) throw new Error("当前日期超出支持范围。");
    const start = new Date(`${to}T12:00:00.000Z`);
    start.setUTCDate(start.getUTCDate() - filter.days + 1);
    from = start.getUTCFullYear() < 1 ? "0001-01-01" : start.toISOString().slice(0, 10);
  }
  const window: KnowledgeDateWindow = { field: filter.field, timeZone: filter.timeZone, from, to };
  return { window, dateOf, matches: (record: KnowledgeDateRecord) => {
    const value = dateOf(record);
    return value !== null && (!from || value >= from) && (!to || value <= to);
  } };
}
