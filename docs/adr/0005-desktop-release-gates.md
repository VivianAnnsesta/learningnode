# Desktop distribution requires security and data release gates

Status: Accepted

Updated: 2026-07-17

EnglishNode remains a single-user local prototype until desktop distribution passes both the local-runtime security boundary and the data-release gates. The working tree now implements the runtime boundary, a versioned empty seed, backup-first migration, migration-fidelity and foreign-key verification, packaged clean-seed and upgrade-database runtime checks, and packaged security-interaction evidence. These foundations do not make the application releasable: key rotation, Mastery Evidence enforcement, and the current blockers in `CURRENT_PROGRESS_AND_DIFFICULTIES.md` still apply. Dependency critical/high findings block CI; the remaining Next-embedded PostCSS moderate finding has a scoped temporary acceptance recorded in the status document. Feature completeness alone is not sufficient for release.

## Runtime security boundary

The Electron main process creates a fresh local API token for every backend launch. It passes the token only through the child-process environment, binds the standalone server to `127.0.0.1`, and injects the token into renderer requests to that origin. Next middleware rejects API requests with a non-local Host/Origin or without that token. The token must never be placed in a URL, persisted database, settings file, or renderer JavaScript state.

AI settings are runtime user data. The Electron main process supplies an `AI_SETTINGS_PATH` below Electron `userData`; the application must not fall back to a path below its source, standalone, or packaged working directory. Provider endpoints must be HTTPS, except loopback HTTP endpoints used by local OpenAI-compatible servers. A request that attempts to replace a retained key's provider URL with another untrusted endpoint must fail validation.

Course-source links are data from an untrusted model. They are accepted and rendered only when they use `https:`. Electron blocks non-application navigation and opens accepted external links in the system browser.

The packager removes `.env`, `.env.*`, and `ai-settings.json` from the standalone and copied Electron resources; package verification fails if any remain. This prevents build-traced configuration from being distributed, while not treating a development database as an acceptable release seed.

CI is a release gate, not advisory reporting. It must fail on lint, type, unit, migration-fidelity, malicious-URL, browser E2E, package, packaged-runtime, or packaged-security failures. Dependency audit covers both runtime and development/build dependencies: critical and high findings block the pipeline, while any accepted moderate finding must be named and tracked in `CURRENT_PROGRESS_AND_DIFFICULTIES.md`.

## Consequences

- Desktop API access is a per-process capability, not a reusable credential or a renderer-visible setting.
- Local OpenAI-compatible providers remain supported through loopback HTTP; remote providers require HTTPS.
- Packaged Electron security-interaction verification is a permanent release regression gate, not a one-time check.
- Empty-seed and upgrade-database verification are separate release scenarios; both must fail closed.
- The synthetic legacy fixture is generated from its fixed historical schema in CI before fidelity and packaged-upgrade verification; a developer-local fixture is not accepted as release evidence.
- Current evidence and unresolved blockers live only in `CURRENT_PROGRESS_AND_DIFFICULTIES.md`; this ADR records the gate, not a release approval.
