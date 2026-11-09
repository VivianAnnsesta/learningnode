import { referenceParagraphs } from "./recordReferences";

export function normalizeRecordName(value: string): string {
  return value.normalize("NFKC").toLowerCase();
}

export function recordAliases(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 20) throw new Error("别名必须是最多20项的文字列表。");
  const result: string[] = [], seen = new Set<string>();
  for (const raw of value) {
    if (typeof raw !== "string") throw new Error("每个别名都必须是文字。");
    const name = raw.trim();
    if (!name || name.length > 80 || /\p{Cc}/u.test(name) || [...name].some(character => {
      const code = character.codePointAt(0)!;
      return code >= 0xd800 && code <= 0xdfff;
    })) throw new Error("每个别名需为1至80个字符，且不能包含控制字符或不完整Unicode。");
    const key = normalizeRecordName(name);
    if (!seen.has(key)) { seen.add(key); result.push(name); }
  }
  return result;
}

export function readRecordAliases(json: unknown): string[] {
  if (typeof json !== "string") return [];
  try { return recordAliases(JSON.parse(json)); } catch { return []; }
}

export function recordNames(title: string, aliases: string[]): string[] {
  const seen = new Set<string>();
  return [title, ...aliases].filter(name => {
    const key = normalizeRecordName(name);
    if (!key || seen.has(key)) return false;
    seen.add(key); return true;
  });
}

export function matchRecordSearch(record: { title: string; body: string; aliases: string[] }, query: string) {
  const key = normalizeRecordName(query);
  if (!key) return { matches: true, matchedAliases: [] as string[] };
  const matchedAliases = record.aliases.filter(alias => normalizeRecordName(alias).includes(key));
  return {
    matches: matchedAliases.length > 0 || normalizeRecordName(record.title).includes(key) || normalizeRecordName(record.body).includes(key),
    matchedAliases
  };
}

const eastAsian = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;
const word = /[\p{L}\p{N}\p{M}_]/u;
function wordCharacter(character: string | undefined) {
  return !!character && word.test(character) && !eastAsian.test(character);
}
function before(text: string, index: number): string | undefined {
  if (index <= 0) return undefined;
  const last = text.charCodeAt(index - 1);
  return last >= 0xdc00 && last <= 0xdfff && index > 1 ? text.slice(index - 2, index) : text[index - 1];
}
function containsName(text: string, name: string) {
  const points = [...name], first = points[0], last = points.at(-1);
  let index = text.indexOf(name);
  while (index >= 0) {
    const after = text.codePointAt(index + name.length);
    if ((!wordCharacter(first) || !wordCharacter(before(text, index))) &&
      (!wordCharacter(last) || !wordCharacter(after === undefined ? undefined : String.fromCodePoint(after)))) return true;
    index = text.indexOf(name, index + 1);
  }
  return false;
}

export type RecordMention = { matchedNames: string[]; context: { start: number; end: number; quote: string } };
export function recordMention(body: string, names: string[]): RecordMention | null {
  const unique = recordNames("", names), keys = unique.map(normalizeRecordName), found = new Set<string>();
  if (!keys.length) return null;
  let context: RecordMention["context"] | null = null;
  for (const paragraph of referenceParagraphs(body)) {
    const text = normalizeRecordName(paragraph.quote);
    for (const key of keys) if (!found.has(key) && containsName(text, key)) {
      found.add(key);
      context ??= paragraph;
    }
    if (found.size === keys.length) break;
  }
  return context ? { matchedNames: unique.filter((_, index) => found.has(keys[index])), context } : null;
}

// SQLite's NOCASE folds only ASCII and otherwise compares UTF-8 bytes. It stops
// comparing at a shared NUL, then uses full byte lengths, just as SQLite does.
export function compareRecordTitles(left: string, right: string): number {
  const encoder = new TextEncoder();
  const a = encoder.encode(left.replace(/[A-Z]/g, character => character.toLowerCase()));
  const b = encoder.encode(right.replace(/[A-Z]/g, character => character.toLowerCase()));
  for (let index = 0; index < Math.min(a.length, b.length); index++) {
    if (a[index] !== b[index]) return a[index] - b[index];
    if (a[index] === 0) break;
  }
  return a.length - b.length;
}

export function compareRecordIds(left: string, right: string): number {
  const encoder = new TextEncoder(), a = encoder.encode(left), b = encoder.encode(right);
  for (let index = 0; index < Math.min(a.length, b.length); index++) if (a[index] !== b[index]) return a[index] - b[index];
  return a.length - b.length;
}
