# Recoverable Domain Creation Tasks

- [x] Persist explicit Task Brief confirmation.
  - Acceptance: confirmation returns through `LearningDomainDto`; relevant edits clear it.
  - Verify: `domainService.test.ts` and Task Brief route tests.
  - Files: Prisma schema/migration, Domain service, Task Brief route.
- [x] Enforce confirmation at initial course research.
  - Acceptance: direct API use cannot research an unconfirmed Task Brief; persisted repair remains available.
  - Verify: tutor service and route tests.
  - Files: tutor service and tests.
- [x] Restore the creation page from `?domainId=`.
  - Acceptance: the page reloads Domain, Course Design, repair count, and Map Draft without mutation or duplication.
  - Verify: Playwright refresh tests.
  - Files: new-domain page and E2E.
- [x] Synchronize docs and complete verification.
  - Acceptance: ADR/current status/plan/README/AGENTS agree; no stale client-only recovery claim remains.
  - Verify: contradiction scan, full command set, code review, clean commit.
  - Files: authority and auxiliary docs.
