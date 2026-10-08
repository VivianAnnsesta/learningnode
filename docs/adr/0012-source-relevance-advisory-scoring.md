# Source relevance is an advisory floor, not a blocking gate

Status: Accepted

Date: 2026-08-04

## Context

ADR 0011 added Source Grounding, which verifies that each AI-proposed course source is reachable over the HTTPS whitelist and extracts a plain-text digest (title, headings, short excerpt). Grounding records *whether* a source can be fetched, but not *how related* the fetched content is to the learning domain. A source can pass grounding (reachable) while being only tangentially about the learner's goal — for example a general university homepage cited as the main course-design source.

The product gap list recorded "内容相关性评分仍未实现（接地只提取摘要，不做相关性打分）". Closing it needs to stay inside the existing advisory posture: the structural Course Research Quality Gate (ADR 0004) stays the only blocker, and the URL whitelist / no-trusted-render boundary (ADR 0011) must not change.

## Decision

- Add a new `web/src/lib/learning/sourceRelevanceService.ts` that scores each grounded source against the learning domain using a **deterministic, dependency-free** algorithm:
  - Tokenize mixed Chinese/English text — English/N-digit runs become lowercased word tokens (length >= 2, stopwords and pure numbers dropped); CJK runs become character bigrams via a sliding window.
  - Build the weighted query from the domain: `name` repeated three times (strongest signal), then `scope`, then `goal`.
  - Score with a multiset **Dice coefficient** `2|A∩B| / (|A|+|B|)` over the query tokens and the source's `title + excerpt` tokens; result is clamped to `0–1`.
  - Expose `LOW_RELEVANCE_THRESHOLD = 0.15`; a score below it sets `lowRelevance: true`.
- The score is **advisory only**. It attaches to `SourceGroundingInfo.relevance` (a new optional `{ score, lowRelevance } | null` field) and is surfaced in the review UI as an amber badge ("相关性偏低（仅供参考）") next to the grounding badge. It never feeds the blocking quality gate.
- `scoreSourceRelevance(query, sourceText)` returns `null` when there is no source text to score (fetch failed, or no excerpt). `null` means "no signal", not "low". The pipeline (`groundDraftSources`) computes relevance only for reachable sources that produced a digest; unreachable sources carry `relevance: null`.
- The scoring reuses the already-fetched grounding digest — no new network call, no AI call, no new third-party dependency. Rendering still only whitelists HTTPS URLs and never renders fetched content as trusted HTML (inherited from ADR 0011).

## Alternatives considered

### Add relevance as a blocking dimension of the quality gate

Rejected. Relevance is a subjective, fresh floor with a conservative threshold and an approximate tokenizer (CJK bigrams). Promoting it to a gate would block learners on borderline sources before the threshold is calibrated, contradicting ADR 0011's advisory-report principle.

### Embed relevance scoring inside the AI critique pass (let the model judge relevance)

Rejected. Adds a non-deterministic, provider-dependent step to a signal that is fully computable from text already on hand. A deterministic floor is cheaper, replayable, and testable, and it complements — rather than replaces — the AI critique note on source quality.

### Per-language full NLP tokenizer (jieba, spaCy, etc.)

Rejected for a first version. It would add a dependency and break the local-first, dependency-free posture. CJK bigrams are an acknowledged approximation; the threshold is set conservatively (0.15) so the floor only flags clearly-unrelated sources. The algorithm is isolated in one module so a better tokenizer can replace it later without touching call sites.

## Consequences

- `tasks.ts` gains `SourceGroundingRelevance` and a `relevance` field on `SourceGroundingInfo`; `parseGroundingInfo` parses and clamps the score to `0–1`.
- `tutorService.groundDraftSources` takes `(draft, domain)` and computes `relevance` per reachable source; both call sites (final draft and critique pass) pass the domain.
- `domains/new/page.tsx` renders the amber "相关性偏低" badge when `grounding.relevance.lowRelevance` is true.
- New `sourceRelevanceService.test.ts` covers tokenization, scoring, threshold boundary, determinism, and the `null` cases; `courseQualityBaseline.test.ts` asserts reachable sources carry relevance while unreachable ones do not.
- The "内容相关性评分未实现" gap is closed at the deterministic-floor level. The optional AI review task (`source_relevance_check`) is implemented as a separate, bounded, advisory layer (see below) — it does not replace the deterministic floor.

## Implementation (2026-08-04): optional AI review task

The deferred `source_relevance_check` task is now implemented as an independent, advisory enrichment that is **not** mixed into the course-research main call.

**Design**

- New AI task type `source_relevance_check` (added only to the authoritative `web/src/lib/ai/provider.ts` `AiTaskType`; the legacy `web/src/lib/learning/types.ts` enum is divergent and intentionally left alone). Policy: `{ timeoutMs: 60000, maxTokens: 4000 }`, transient retry count `1` (bounded, like `course_design_critique`).
- It judges **only already-grounded sources** — those with `grounding.ok === true` and a non-empty `title`/`excerpt`. The grounded title + excerpt (already fetched by `sourceGroundingService`) is fed directly into the prompt, so the task sets `requiresWebResearch: false`: no extra network fetch, no new dependency, fully bounded.
- `buildSourceRelevanceCheckPrompt(domain, sources)` asks the model to return per-source `{ url, score (0–1), lowRelevance (bool), reason (short Chinese) }`. `validateSourceRelevanceCheck` clamps `score` to `0–1`, derives `lowRelevance = lowRelevance === true || score < 0.15`, and requires a `reason`.
- The result is merged into `SourceGroundingInfo.aiRelevance` (`{ score, lowRelevance, reason } | null`), a **new optional field** distinct from the deterministic `relevance` floor. Both layers are advisory; neither feeds the blocking quality gate.
- `runSourceRelevanceCheck(domainId)` (tutorService) loads the saved draft via `getCourseDesignState`, runs the task, merges `aiRelevance` per matched url, and returns the enriched draft for display. It deliberately does **not** re-persist via `saveCourseDesignDraft`, to avoid overwriting `courseDesignAiCallLogId` (the map-skeleton binding invariant, ADR 0008/0009) or resetting `courseDesignConfirmedAt`. The AI review is therefore an on-demand, transient enrichment; the deterministic floor remains the persisted baseline.
- Exposed via a new `POST /api/domains/[id]/course-design/source-relevance-check` route. The review page (`domains/new`) gains a "用 AI 复核来源相关性" button that calls it and shows each source's AI relevance badge + reason alongside the deterministic floor badge.

**Why not persist**

Persisting through `saveCourseDesignDraft` would reset `courseDesignConfirmedAt` to null and re-point `courseDesignAiCallLogId` at the review call — both would corrupt the confirmed/research provenance that downstream map generation depends on. A dedicated column was rejected as schema/migration overhead for an advisory, on-demand signal.

**Consequences**

- `tasks.ts` gains `SourceGroundingAiRelevance`, an `aiRelevance` field on `SourceGroundingInfo`, `buildSourceRelevanceCheckPrompt`, and `validateSourceRelevanceCheck`.
- `tutorService.ts` gains `runSourceRelevanceCheck`; the `source_relevance_check` call shares the `runJsonTask` + `writeAiCallLog` path (separate `AiCallLog`).
- `domains/new/page.tsx` renders the AI relevance badge + reason and adds the review button.
- Tests: `tasks.test.ts` covers the prompt + validator; `tutorService.test.ts` covers merge behavior with a mocked `getCourseDesignState` + provider.
