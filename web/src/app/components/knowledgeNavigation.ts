import { knowledgeViewConfigFromQuery, knowledgeViewConfigToQuery, type KnowledgeViewConfig } from "../../lib/learning/knowledgeViewContracts";

export const PERSONAL_KNOWLEDGE_PATH = "/learning/knowledge";
const filterNames = ["q", "domainId", "collectionId", "kind", "sourceType", "sort", "dateField", "dateMode", "dateFrom", "dateTo", "dateDays", "timeZone", "fields", "calendarMonth"] as const;
const controlCharacters = /[\u0000-\u001f\u007f]/;
type KnowledgeFilters = Partial<Record<typeof filterNames[number], string>>;

/** Only a canonical personal-network view can be used as a navigation return target. */
export function normalizeKnowledgeView(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || controlCharacters.test(value)) return null;
  if (value.split(/[?#]/, 1)[0] !== PERSONAL_KNOWLEDGE_PATH) return null;
  let url: URL;
  try { url = new URL(value, "http://knowledge.invalid"); } catch { return null; }
  if (url.origin !== "http://knowledge.invalid" || url.pathname !== PERSONAL_KNOWLEDGE_PATH || url.hash) return null;
  let canonical: URLSearchParams;
  try { canonical = knowledgeViewConfigToQuery(knowledgeViewConfigFromQuery(url.searchParams), { calendarMonth: url.searchParams.get("calendarMonth") || undefined }); } catch { return null; }
  const query = canonical.toString();
  return `${PERSONAL_KNOWLEDGE_PATH}${query ? `?${query}` : ""}`;
}

export function knowledgeViewForConfig(config: KnowledgeViewConfig, options: { calendarMonth?: string } = {}): string {
  const query = knowledgeViewConfigToQuery(config, options).toString();
  return `${PERSONAL_KNOWLEDGE_PATH}${query ? `?${query}` : ""}`;
}

export function knowledgeViewForFilters(filters: KnowledgeFilters): string {
  const query = new URLSearchParams();
  for (const name of filterNames) if (filters[name] !== undefined) query.set(name, filters[name]!);
  return normalizeKnowledgeView(`${PERSONAL_KNOWLEDGE_PATH}?${query}`) || PERSONAL_KNOWLEDGE_PATH;
}

export function knowledgeReturnView(search: string): string {
  const values = new URLSearchParams(search).getAll("returnTo");
  return values.length === 1 ? normalizeKnowledgeView(values[0]) || PERSONAL_KNOWLEDGE_PATH : PERSONAL_KNOWLEDGE_PATH;
}

/** Capture the source when opening the switcher, including the domain's network alias. */
export function knowledgeSourceView(pathname: string, search: string): string {
  if (pathname === PERSONAL_KNOWLEDGE_PATH) return normalizeKnowledgeView(`${pathname}${search ? `?${search.replace(/^\?/, "")}` : ""}`) || PERSONAL_KNOWLEDGE_PATH;
  if (/^\/learning\/knowledge\/[^/]+$/.test(pathname)) return knowledgeReturnView(search);
  const domainAlias = /^\/learning\/domains\/([^/]+)\/knowledge-graph$/.exec(pathname);
  if (!domainAlias) return PERSONAL_KNOWLEDGE_PATH;
  const params = new URLSearchParams(search);
  if (!params.has("domainId")) {
    try { params.set("domainId", decodeURIComponent(domainAlias[1])); } catch { return PERSONAL_KNOWLEDGE_PATH; }
  }
  return normalizeKnowledgeView(`${PERSONAL_KNOWLEDGE_PATH}?${params}`) || PERSONAL_KNOWLEDGE_PATH;
}

export function knowledgeRecordHref(pointId: string, sourceView: string): string {
  const path = `${PERSONAL_KNOWLEDGE_PATH}/${encodeURIComponent(pointId)}`;
  const returnTo = normalizeKnowledgeView(sourceView) || PERSONAL_KNOWLEDGE_PATH;
  return returnTo === PERSONAL_KNOWLEDGE_PATH ? path : `${path}?${new URLSearchParams({ returnTo })}`;
}
