# Roadmap semantic review is user-resolvable

Status: Accepted

Date: 2026-08-13

## Context

ADR 0013 made every remaining critical AI review finding a hard prerequisite
for Map Draft confirmation. Live roadmap review then treated unexpanded
`planned` Stages as missing Stage coverage even though progressive expansion
requires those Stages to remain unexpanded. The same model generated, reviewed,
repaired, and finally blocked the draft, so retries could repeat a false
finding without giving the learner a bounded recovery path.

Deterministic map integrity and semantic curriculum judgment are different
authorities. Stable keys, references, revision binding, exact coverage for an
expanded Stage, and DAG validity are replayable server facts. Scope quality,
question overload, and prerequisite meaning are evidence-backed judgments that
can remain uncertain and must not make the configured model the final product
authority.

## Decision

- Deterministic planning errors remain hard blockers and cannot be overridden.
- A `planned` Stage is complete at the blueprint level and must not be reported
  as missing Learning Nodes. Planned-question coverage is checked only inside
  an `expanded` Stage.
- AI semantic review returns findings and does not directly certify or mutate a
  formal map. High-confidence findings may trigger at most two repair calls.
- After repair is exhausted, the learner may edit or regenerate the draft, or
  dismiss a semantic finding with an explicit rationale. A dismissal is bound
  to the review and normalized draft digest; any draft edit makes it stale.
- Provider timeout or review unavailability is a runtime failure, not a content
  defect. If deterministic checks pass, the learner may explicitly acknowledge
  the missing semantic review and continue.
- The configured generation model may also perform the independent review, but
  each role uses a separate call and a narrow contract. Review returns findings;
  repair returns a draft; server validation determines structural validity.
- The UI derives available planning actions and recovery choices from a
  server-computed workflow snapshot instead of reconstructing them from local
  booleans.

This decision supersedes ADR 0013 only where ADR 0013 says that every remaining
AI semantic critical finding or AI review failure is an unresolvable hard
block. Its layered blueprint, deterministic coverage, revision, provenance,
and user-confirmation decisions remain in force.

## Alternatives considered

### Keep every AI critical finding as a hard blocker

Rejected. It gives a probabilistic reviewer final authority and can permanently
block a structurally valid progressive map after repeated false findings.

### Make all review findings advisory immediately

Rejected. A visible, high-confidence curriculum risk should first receive
bounded repair and an explicit learner decision rather than being silently
ignored.

### Allow the learner to override deterministic validation

Rejected. Broken keys, references, coverage, revisions, or cycles would corrupt
the formal map contract and cannot be resolved by a semantic judgment.

## Consequences

- Review records need availability and resolution metadata bound to the draft
  digest.
- Planning APIs expose structured blockers and recovery actions.
- Tests must distinguish deterministic defects, semantic findings, and runtime
  review failure, and must cover the exact `planned` Stage regression.
- Existing confirmed maps remain unchanged. Existing blocked draft reviews stay
  as history but do not become user resolutions automatically.
