# Persist Domain creation progress on the Domain

Status: Accepted

Date: 2026-07-19

## Context

The creation wizard already writes the Learning Domain, Course Design Draft, repair count, and Map Draft to SQLite, but it keeps the Domain identity and Task Brief confirmation only in React state. A refresh or application restart therefore loses the workflow position even though the underlying artifacts still exist. Inferring confirmation from non-empty Task Brief text would erase the distinction between editing and explicit learner approval.

## Decision

- The in-progress Learning Domain ID is carried in the creation URL as `?domainId=<id>`; SQLite remains authoritative for all recoverable state.
- `Domain.taskBriefConfirmedAt` records explicit confirmation of the currently persisted Task Brief and is exposed additively in the formal Domain DTO.
- Changing any persisted input used for course research clears Task Brief confirmation. Existing Course Design or map artifacts are preserved, but existing planning artifacts become `needs_review` rather than being silently reused or deleted.
- Initial Course Design research and explicit repair require server-observed Task Brief confirmation. A renderer flag alone cannot unlock AI planning.
- Every persisted Map Draft is bound to the `courseDesignAiCallLogId` of the Course Design that produced it. A draft whose binding no longer matches is recoverable only as read-only reference and cannot be confirmed.
- Formal map confirmation re-reads the persisted creation draft and atomically claims Task Brief confirmation, Course Design status/log ID, Map Draft binding/content, and `mapRevision` in the same transaction that reconciles the map. Post-confirmation Stage edits keep the same atomic planning gates while using their explicit `baseRevision` conflict path.
- The creation page reconstructs its state through the formal Domain, Course Design, and Map APIs. It does not store a duplicate wizard snapshot in localStorage or a new compatibility model.
- A Domain with an already confirmed formal map resumes on the normal Domain page.

## Alternatives considered

### Store the wizard in localStorage

Rejected. It duplicates SQLite state, can drift from API mutations, and cannot prove explicit confirmation belongs to the current persisted Task Brief.

### Treat any non-empty Task Brief as confirmed

Rejected. Text presence is not learner confirmation and would allow refresh or direct API use to bypass the planning review gate.

### Persist one serialized wizard blob

Rejected. Course Design and Map Draft already have formal storage and APIs. A parallel blob would create competing state and migration rules.

## Consequences

- Historical databases receive two nullable additive columns: explicit Task Brief confirmation and the Map Draft-to-Course Design binding.
- Upgrade backfill treats an existing `courseDesignConfirmedAt` or a `confirmed` formal map revision as explicit historical confirmation evidence. A non-empty Task Brief alone is never backfilled as confirmed.
- Domain input changes must compare normalized persisted planning values inside the update transaction.
- Recovery is read-only until the learner takes the next explicit action.
- A stale Map Draft remains visible but read-only; the learner must generate a new draft from the current Course Design before confirmation.
- Tests must prove refresh recovery and server-side confirmation enforcement without touching the real development database.
