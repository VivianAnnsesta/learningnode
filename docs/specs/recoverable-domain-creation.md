# Spec: Recoverable Domain Creation

## Objective

Make the existing `/learning/domains/new` flow recoverable after refresh, navigation, or application restart. The single-user learner must resume the same persisted Learning Domain without creating duplicates, losing AI research state, or bypassing task-brief, quality-gate, map-version, or user-confirmation gates.

## Approved assumptions

- The URL identifies an in-progress Learning Domain with `?domainId=<id>`; SQLite remains the source of truth.
- Task Brief confirmation is an explicit persisted fact, not something inferred from non-empty text or browser storage.
- Changing any input used by course research clears Task Brief confirmation. Existing course/map artifacts are preserved for review rather than deleted; if such artifacts exist, their status becomes `needs_review`.
- A confirmed formal map is resumed on the normal Domain page, not reopened as an editable creation wizard.
- This slice does not add manual/no-AI map creation, Mastery Evidence, diagnostics, or new graph concepts.

## Interface contract

- `LearningDomainDto` adds `taskBriefConfirmedAt: Date | null`.
- `Domain.roadmapDraftCourseDesignAiCallLogId` binds a persisted creation draft to the exact AI Course Design generation that produced it.
- `PATCH /api/domains/:id/task-brief` explicitly confirms the currently persisted Task Brief and returns `{ domain }`.
- `POST /api/domains/:id/course-design/ai-draft` rejects initial research and explicit repair unless the persisted Task Brief is confirmed. Repair remains available after provider/quality failure because those failures do not clear confirmation.
- Existing additive recovery reads remain authoritative:
  - `GET /api/domains/:id` returns Domain fields and confirmation state.
  - `GET /api/domains/:id/course-design` returns the persisted Course Design Draft, status, repair count, and log reference.
  - `GET /api/domains/:id/map` returns the persisted Map Draft, its status/Course Design binding, and `mapRevision`.
- After the first Domain creation, the page replaces its URL with `/learning/domains/new?domainId=<id>`.

## State rules

| Event | Task Brief confirmation | Course design/map |
| --- | --- | --- |
| Create Domain | unconfirmed | unchanged defaults |
| Confirm persisted Task Brief | set server timestamp | unchanged |
| Change a course-research input | cleared | preserve artifacts; mark existing planning artifacts `needs_review` |
| Generate or repair Course Design | requires confirmation | normal quality gate and bounded repair |
| Restore a Map Draft bound to an older Course Design | unchanged | show read-only; regeneration required before confirmation |
| Refresh incomplete wizard | restored from Domain/Course Design/Map APIs | no mutation |
| Open wizard for confirmed map | not editable in wizard | redirect to Domain page |

## Tech stack and structure

- Next.js App Router API and client page under `web/src/app/`.
- Prisma/SQLite persistence in `web/prisma/schema.prisma` plus an additive migration.
- Domain state rules in `web/src/lib/learning/domainService.ts`.
- Vitest service/route tests beside the implementation and Playwright browser flows in `web/e2e/app.spec.ts`.
- Long-lived rationale in `docs/adr/0010-persist-domain-creation-progress.md`; current evidence remains in `CURRENT_PROGRESS_AND_DIFFICULTIES.md`.

## Code style

Use additive typed DTO fields and explicit resource actions:

```ts
export interface LearningDomainDto {
  taskBriefConfirmedAt: Date | null;
}

await fetch(`/api/domains/${domainId}/task-brief`, { method: "PATCH" });
```

Do not expose serialized Prisma records or introduce a second browser-only state model.

## Testing strategy

- Service seam: confirmation persists; planning-input edits invalidate it; unchanged synchronization does not.
- Transaction seam: creation confirmation atomically claims Task Brief confirmation, Course Design generation ID/status, persisted Map Draft binding/content, and `mapRevision`.
- Migration seam: a pre-column Domain with explicit Course Design/formal-map confirmation evidence receives a confirmation timestamp; plain non-empty text does not.
- Route seam: Task Brief confirmation has stable success, missing-domain, and invalid-state behavior.
- AI seam: initial course research rejects an unconfirmed Task Brief.
- Browser seam: refresh after Task Brief confirmation, Course Design persistence, and Map Draft persistence resumes the same Domain and keeps the correct gates/actions.
- Finish with lint, typecheck, full Vitest, encoding, production build, default E2E, Prisma validation, and migration status.

## Commands

Run from `web/`:

```text
npx prisma generate
npx prisma validate
npm run lint
npm run typecheck
npm run test
npm run check:encoding
npm run build
npm run test:e2e
npx prisma migrate status
```

## Boundaries

- Always: preserve persisted artifacts and confirmation gates; use an additive migration; test through service/API/browser seams.
- Ask first: destructive migration, new dependency, or a change that permits non-AI formal map creation.
- Never: use `dev.db` as a test target, store recovery state only in localStorage, infer confirmation from text presence, or weaken map/version/quality gates.

## Success criteria

- Refreshing an in-progress wizard restores the same Domain and persisted progress.
- Task Brief confirmation survives refresh and is cleared by a meaningful planning-input edit.
- An unconfirmed Task Brief cannot start initial course research through the API.
- Persisted incomplete/successful Course Design state and Map Draft reappear after refresh.
- A stale Map Draft cannot be confirmed after Course Design regeneration or a concurrent planning-input update.
- A confirmed formal map leaves the creation wizard and opens its normal Domain page.
- No refresh creates another Domain; all deterministic verification passes and the worktree is committed cleanly.

## Open questions

None. The user approved this scope on 2026-07-19.
