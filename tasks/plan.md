# Recoverable Domain Creation Plan

`IMPLEMENTATION_PLAN.md` remains the repository-wide priority authority. This file is the execution plan for the approved recoverable-creation slice in `docs/specs/recoverable-domain-creation.md`.

1. Add the persisted Task Brief confirmation contract and ADR.
2. Implement confirmation/invalidation at the Domain service and API boundary.
3. Enforce confirmation before initial AI course research.
4. Restore Domain, Course Design, repair state, and Map Draft from the URL identity.
5. Add refresh-oriented service, route, and browser tests.
6. Synchronize authority docs, run the full verification set, review, and commit.

Risks and mitigations:

- Stale planning artifacts: preserve them but mark existing artifacts `needs_review` after relevant input changes.
- Duplicate creation: put the created Domain ID in the URL immediately and make hydration read-only.
- Accidental bypass: enforce Task Brief confirmation in the server AI service, not only the page.
- Historical databases: use a nullable additive column and verify migrations only against seed/temporary databases.
