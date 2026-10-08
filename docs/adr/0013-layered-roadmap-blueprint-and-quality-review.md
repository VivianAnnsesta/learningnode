# Layered roadmap blueprints and server-bound quality review

Status: Accepted

Date: 2026-08-09

## Context

The current complete Stage skeleton names Stage goals and coarse topic directions, while detailed Stage generation is only required to return a non-empty Module with non-empty Learning Nodes. A route can therefore be structurally valid while compressing several independently learnable concepts, methods, boundaries, and applications into a few overloaded questions. Fixed minimum node counts would not solve this: a model could satisfy them by splitting or padding content without improving coverage.

Roadmap planning is low-frequency and high-value. It may spend bounded additional AI calls, but it must preserve progressive Stage expansion, explicit prerequisites, user confirmation, and the distinction between an AI plan and the learner's formal knowledge.

## Decision

- New Domain Maps use a versioned layered planning contract. The complete Stage skeleton contains structured Module directions; every direction has a stable key, a goal, and one or more key questions with checkable outcomes. These questions are planning coverage, not Learning Nodes or Knowledge Points.
- No fixed minimum question or node count is a quality signal. Completeness is judged against the Domain scope, confirmed Course Design Direction, grounded source evidence, Module goals, prerequisite correctness, question atomicity, boundaries, and application or transfer needs where applicable.
- A fresh call to the configured Provider/model reviews every new layered skeleton. Critical findings trigger at most two bounded repair calls. Remaining critical findings block confirmation; advisory findings remain visible and do not block.
- A Stage is still expanded only when the learner requests it. Every generated Learning Node has one core question, one checkable outcome, and exactly one planning-question key. Several Learning Nodes may decompose one planned key question, but every planned question must be covered and orphan Learning Nodes are rejected.
- Stage expansion normally uses deterministic coverage, key, ownership, revision, and DAG checks. A fresh AI review is added only when deterministic risk signals or learner edits make content quality uncertain; critical findings receive the same two-repair limit.
- Quality approval is a server-recorded review bound to the normalized Map Draft digest, `mapRevision`, Stage key when applicable, and Course Design AI provenance. Any content edit makes the previous review stale. The client cannot submit or preserve a passing status by itself.
- AI repair changes only the Map Draft. It never updates the formal Domain Map until the learner reviews and confirms the whole draft.
- New layered map creation is fail-closed. AI failure, exhausted repair, missing provenance, a stale review, or `source="fallback"` cannot create a formal Domain Map. Recovery remains retry, Provider/model correction or switching, and regeneration.
- Existing confirmed maps remain readable and unchanged. Legacy unconfirmed drafts may be displayed, but a new confirmation requires regeneration under the layered contract.

## Alternatives considered

### Require a minimum number of questions per Stage or Module

Rejected. Counts reward padding and do not prove that the questions are atomic, correctly sequenced, or complete.

### Generate all Learning Nodes during the first planning review

Rejected. It removes progressive Stage expansion, increases the initial review burden, and prevents later Stages from adapting to learner evidence.

### Keep all roadmap quality signals advisory

Rejected. Missing planned-question coverage, materially wrong prerequisites, overloaded questions, or a stale review would still be confirmable despite being known defects.

### Automatically regenerate existing formal maps

Rejected. It would bypass versioned Map Draft review and could disrupt started or sedimented learning work.

## Consequences

- `RoadmapSkeletonDraft`, Map Draft and Domain Map DTOs gain additive versioned planning fields; legacy fields remain readable.
- Unit and LearningNode persistence gains nullable planning provenance. A review record retains the digest, revision, findings and AI log provenance used by the confirmation gate.
- The creation UI must show and edit Module goals, key questions and checkable outcomes, mark reviews stale after edits, and expose blocking findings and recovery actions.
- Tests must prove bounded review/repair, exact planned-question coverage, stale-review rejection, revision conflicts, fail-closed AI behavior, legacy-read compatibility, and preservation of existing formal maps.
