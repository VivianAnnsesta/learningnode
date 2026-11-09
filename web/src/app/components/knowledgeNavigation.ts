export const PERSONAL_KNOWLEDGE_PATH = "/learning/knowledge";

const filterNames = ["q", "domainId", "collectionId", "kind", "sort"] as const;
const recordKinds = new Set(["note", "question", "understanding", "example", "experience", "excerpt"]);
const sortKinds = new Set(["updated_desc", "title_asc"]);
const controlCharacters = /[\u0000-\u001f\u007f]/;
type KnowledgeFilters = Partial<Record<typeof filterNames[number], string>>;

/** Only a canonical personal-network view can be used as a navigation return target. */
export function normalizeKnowledgeView(value: unknown): string | null {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || controlCharacters.test(value)) return null;
  if (value.split(/[?#]/, 1)[0] !== PERSONAL_KNOWLEDGE_PATH) return null;
  let url: URL;
  try { url = new URL(value, "http://knowledge.invalid"); } catch { return null; }
  if (url.origin !== "http://knowledge.invalid" || url.pathname !== PERSONAL_KNOWLEDGE_PATH || url.hash) return null;
  const seen = new Set<string>();
  for (const [name, entry] of url.searchParams) {
    if (!(filterNames as readonly string[]).includes(name) || seen.has(name) || controlCharacters.test(entry) || (name !== "q" && entry.includes("\\"))) return null;
    seen.add(name);
    if (name === "kind" && entry && !recordKinds.has(entry)) return null;
    if (name === "sort" && entry && !sortKinds.has(entry)) return null;
  }
  const canonical = new URLSearchParams();
  for (const name of filterNames) {
    const entry = url.searchParams.get(name);
    if (entry && !(name === "sort" && entry === "updated_desc")) canonical.set(name, entry);
  }
  const query = canonical.toString();
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
