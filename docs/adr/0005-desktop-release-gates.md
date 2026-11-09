# Desktop distribution requires security and data release gates

## 2026-10-09 后续决定

本 ADR 中冲突的产品约定已被 [ADR 0025](0025-unified-learning-and-personal-knowledge.md) 部分或全部替代。安全、备份和产物门禁保留；本轮本机交付不包含通用高阶掌握认证，不能据此阻塞普通学习。 下文保留原决策背景，不能用其旧规则覆盖当前任务书。

Status: Accepted

Updated: 2026-07-17

EnglishNode remains a single-user local prototype until desktop distribution passes both the local-runtime security boundary and the data-release gates. The working tree now implements the runtime boundary, a versioned empty seed, backup-first migration, migration-fidelity and foreign-key verification, packaged clean-seed and upgrade-database runtime checks, and packaged security-interaction evidence. These foundations do not make the application releasable: key rotation, Mastery Evidence enforcement, and the current blockers in `CURRENT_PROGRESS_AND_DIFFICULTIES.md` still apply. Dependency critical/high findings block CI; the remaining Next-embedded PostCSS moderate finding has a scoped temporary acceptance recorded in the status document. Feature completeness alone is not sufficient for release.

## Runtime security boundary

The Electron main process creates a fresh local API token for every backend launch. It passes the token only through the child-process environment, binds the standalone server to `127.0.0.1`, and injects the token into renderer requests to that origin. Next middleware rejects API requests with a non-local Host/Origin or without that token. The token must never be placed in a URL, persisted database, settings file, or renderer JavaScript state.

AI settings are runtime user data. The Electron main process supplies an `AI_SETTINGS_PATH` below Electron `userData`; the application must not fall back to a path below its source, standalone, or packaged working directory. Provider endpoints must be HTTPS, except loopback HTTP endpoints used by local OpenAI-compatible servers. A request that attempts to replace a retained key's provider URL with another untrusted endpoint must fail validation.

Course-source links are data from an untrusted model. They are accepted and rendered only when they use `https:`. Electron blocks non-application navigation and opens accepted external links in the system browser.

The packager removes `.env`, `.env.*`, and `ai-settings.json` from the standalone and copied Electron resources; package verification fails if any remain. This prevents build-traced configuration from being distributed, while not treating a development database as an acceptable release seed.

Next.js public assets are optional. A clean checkout with no source `public` directory gets an empty packaged public directory; if source assets exist they must be copied successfully. Missing or invalid standalone output, static chunks, schema, seed, migrations or native engines remain hard failures.

CI is a release gate, not advisory reporting. It must fail on lint, type, unit, migration-fidelity, malicious-URL, browser E2E, package, packaged-runtime, or packaged-security failures. Dependency audit covers both runtime and development/build dependencies: critical and high findings block the pipeline, while any accepted moderate finding must be named and tracked in `CURRENT_PROGRESS_AND_DIFFICULTIES.md`.

CI installs the package-manager version declared by the application before `npm ci`, so dependency overrides and the committed lock are resolved by the same pinned npm toolchain. A package-manager mismatch is repaired explicitly; it must not be hidden with `--force`, skipped installation checks, or a lower audit threshold.

Schema changes rebuild the Prisma client and the versioned empty seed from the committed baseline and forward migrations in the isolated CI checkout before database or browser suites run. Seed verification checks migration names/checksums, empty business tables and foreign keys; an old seed must not be used to test a newer generated client. A successfully generated seed and its validation report are retained as a dedicated versioned-empty-seed artifact, excluding user data and settings. When the developer's native engine cannot load, the last committed seed remains unchanged until a real CI-generated artifact is verified and committed; SQL-only copies are not an official generated seed. This process never reads a user database. A forward migration also needs a populated previous-schema fixture that passes the backup-first lifecycle with existing revisions, source snapshots and current-revision pointers preserved. Native migration evidence remains distinct from any developer-local SQL-only validation performed when a native engine cannot load.

Historical upgrade regressions keep an explicit schema and migration boundary. The revision-aliases regression uses its archived schema and only the migration prefix through aliases; future configuration tables and ledger entries are removed only from its isolated synthetic fixture. A later configuration migration receives a separate previous-schema upgrade check that preserves nonempty aliases and all existing records and historical ledger rows. Saving a view configuration, disconnecting and reopening the database, and repeating the backup-first lifecycle must retain that configuration without creating learning or record facts. The empty-seed validator checks the configuration table's shape and empty state as well as the existing aliases default and complete migration ledger.

Personal record templates are configuration, with the same no-content-write and lifecycle persistence gates. The saved-view historical regression is pinned to its own archived schema and migration prefix before templates. Only known empty future configuration tables and their matching ledger entries may be removed from isolated synthetic fixtures; an unknown future migration fails closed. The templates upgrade separately preserves nonempty saved views, raw record revisions and the historical ledger, and verifies custom template version updates across disconnect/reopen and repeated backup-first startup. Source seeds are replaced only with verified official CI artifacts, never with those projected or SQL-only fixtures.

Revision-owned record dates add nullable columns without backfilling or updating immutable historical rows. Historical template upgrades use the archived pre-date schema and its migration prefix. Reconstructing that boundary may remove only the known date columns and matching ledger entry from an empty revision table in a synthetic seed copy; partial, nonempty or unknown future states fail closed. The separate populated date upgrade preserves all old raw revision/configuration fields, pointers, trigger definitions and ledger rows through an exact backup, and verifies date additions/changes/clearing by appending revisions while the immutability trigger stays enabled. Reopening and repeated lifecycle must retain the complete history and pass FK/integrity checks.

The full Windows unit run executes files serially with one worker to avoid saturating the shared runner with native SQLite engines and PDF worker startup. All cases, assertions and test deadlines remain enabled; fixture preparation uses bounded batch transactions rather than hundreds of independent commits. Parallel scheduling is not part of the product's correctness contract.

Browser suites share one isolated SQLite database and assert that read-only interactions do not create records, revisions, AI calls or audit facts. They run with one worker by default so unrelated tests cannot contaminate those global before/after counts. Explicit concurrency scenarios within a test remain enabled; do not weaken the no-write assertions to accommodate cross-test writes.

Browser navigation checks synchronize with the intended detail URL and the completed successful record response before checking interactive controls, within the existing overall test deadline. They retain control-visibility and persistence assertions. Full CI preserves isolated browser reports, failure context, screenshots and traces even when E2E fails; this evidence must not include user databases or real AI settings.

Security maintenance retains the existing Electron/Next.js architecture. When the installed Electron major has no supported patch for a blocking advisory, move to the minimum supported fixed runtime after checking its official migration notes, and re-run the complete desktop runtime, upgrade and security gates. A runtime version change alone is not evidence of desktop compatibility.

Electron 42 no longer downloads its executable during package postinstall. The supported development command explicitly runs the installed `install-electron` command before loading Electron's path; installation failure blocks launch. Packaging continues to use electron-builder's pinned target-runtime download and validates the produced executable, rather than assuming the development executable has already been downloaded.

## Consequences

- Desktop API access is a per-process capability, not a reusable credential or a renderer-visible setting.
- Local OpenAI-compatible providers remain supported through loopback HTTP; remote providers require HTTPS.
- Packaged Electron security-interaction verification is a permanent release regression gate, not a one-time check.
- Empty-seed and upgrade-database verification are separate release scenarios; both must fail closed.
- The synthetic legacy fixture is generated from its fixed historical schema in CI before fidelity and packaged-upgrade verification; a developer-local fixture is not accepted as release evidence.
- The fixed legacy schema is archived as a versioned schema-only fixture with its original commit and content hash. Fixture generation reads that archive rather than assuming a developer's Git history is available, so source snapshots and fresh clones execute the same gate. A missing archive fails the process; it must not fall back to the current schema or any user database.
- Current evidence and unresolved blockers live only in `CURRENT_PROGRESS_AND_DIFFICULTIES.md`; this ADR records the gate, not a release approval.
