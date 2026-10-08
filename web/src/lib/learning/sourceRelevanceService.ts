/**
 * Source relevance scoring — a deterministic, advisory floor for course-design
 * sources.
 *
 * It scores how much a grounded source page (title + excerpt) overlaps with the
 * learning domain (name / scope / goal) using a mixed Chinese+English tokenizer
 * and a weighted Dice coefficient. The result is advisory only: it never blocks
 * the structural quality gate; it is surfaced in the review UI as a warning.
 *
 * Design constraints (see ADR 0012):
 * - Deterministic and dependency-free (no external tokenizer).
 * - No network, no AI: scoring reuses the already-fetched grounding digest.
 * - Threshold is conservative; the floor only flags clearly-unrelated sources.
 */

export const LOW_RELEVANCE_THRESHOLD = 0.15;

export type SourceRelevance = {
  score: number;
  lowRelevance: boolean;
};

const CJK = /[㐀-䶿一-鿿]/;
const ENGLISH_WORD = /[a-z0-9]+/g;
const STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "of",
  "to",
  "in",
  "on",
  "for",
  "with",
  "is",
  "are",
  "as",
  "by",
  "that",
  "this",
  "it",
  "at",
  "be",
  "from",
  "you",
  "we",
  "our",
  "your",
  "how",
  "what",
  "why",
  "when",
  "can",
  "will",
  "do",
  "does",
  "not",
  "no",
  "if",
  "than",
  "then"
]);

/**
 * Tokenize mixed Chinese/English text:
 * - English/number runs → lowercased word tokens (length >= 2, drop stopwords
 *   and pure-number tokens).
 * - CJK runs → character bigrams via a sliding window.
 * Repeats are preserved so callers can weight tokens by duplication.
 */
export function tokenize(text: string): string[] {
  const lower = (text || "").toLowerCase();
  const tokens: string[] = [];

  const words = lower.match(ENGLISH_WORD) ?? [];
  for (const word of words) {
    if (word.length < 2) continue;
    if (/^[0-9]+$/.test(word)) continue;
    if (STOPWORDS.has(word)) continue;
    tokens.push(word);
  }

  let cjkRun = "";
  const flushRun = () => {
    for (let i = 0; i + 1 < cjkRun.length; i += 1) {
      tokens.push(cjkRun.slice(i, i + 2));
    }
    cjkRun = "";
  };

  for (const char of lower) {
    if (CJK.test(char)) {
      cjkRun += char;
    } else {
      flushRun();
    }
  }
  flushRun();

  return tokens;
}

/** Multiset Dice coefficient over token lists, in [0, 1]. */
function diceCoefficient(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const countB = new Map<string, number>();
  for (const token of b) {
    countB.set(token, (countB.get(token) ?? 0) + 1);
  }
  const consumed = new Map<string, number>();
  let overlap = 0;
  for (const token of a) {
    const used = consumed.get(token) ?? 0;
    const available = countB.get(token) ?? 0;
    if (available > used) {
      overlap += 1;
      consumed.set(token, used + 1);
    }
  }
  return (2 * overlap) / (a.length + b.length);
}

/**
 * Build the weighted relevance query for a domain: the domain name is repeated
 * (weight x3) because it is the strongest signal, followed by scope and goal.
 */
export function buildSourceRelevanceQuery(domain: {
  name?: string | null;
  scope?: string | null;
  goal?: string | null;
}): string {
  const parts: string[] = [];
  const name = (domain.name ?? "").trim();
  if (name) {
    parts.push(name, name, name);
  }
  const scope = (domain.scope ?? "").trim();
  if (scope) parts.push(scope);
  const goal = (domain.goal ?? "").trim();
  if (goal) parts.push(goal);
  return parts.join(" ");
}

/**
 * Score a grounded source against the domain query.
 * Returns null when there is no source text to score (e.g. fetch failed or the
 * page produced no excerpt); callers should treat null as "no signal".
 */
export function scoreSourceRelevance(
  query: string,
  sourceText: string
): SourceRelevance | null {
  if (!sourceText || !sourceText.trim()) return null;
  const queryTokens = tokenize(query);
  const sourceTokens = tokenize(sourceText);
  if (queryTokens.length === 0 || sourceTokens.length === 0) return null;
  const score = diceCoefficient(queryTokens, sourceTokens);
  return {
    score,
    lowRelevance: score < LOW_RELEVANCE_THRESHOLD
  };
}
