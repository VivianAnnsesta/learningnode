# ADR 0034: Consistent portable personal knowledge export

- Status: Accepted
- Date: 2026-11-09

## Context

The Obsidian-inspired discovery workflow needs portable readable notes and durable source history. SQLite and immutable personal revisions remain the application authority. Existing list pagination is not an export snapshot, the detail DTO transforms assigned-date raw columns, and database lifecycle backups contain more than personal knowledge. The legacy canvas export must not become a new personal-record entry point.

## Decision

1. Add read-only `POST /api/knowledge-points/export`. Its complete input is `{scope,includeHistory}`: scope is either `{mode:"view",filters,observedDateWindow}` or `{mode:"record",pointId}`, and `includeHistory` is an explicit boolean. The view means every matching record, not the loaded page; display fields, browse month, pagination and saved-view configuration identity do not limit exported content. A missing record is 404; invalid or unavailable scope fails visibly and never widens to the whole library. A valid zero-match view produces an honest empty package and selection metadata.

2. Preserve the existing filter/search/source-category/date/sort semantics. The list binds its accepted date window to the exact applied filters key before enabling export. For a relative date rule, export freezes the already displayed civil window instead of recomputing a different day across midnight. The server validates field/timezone/window shape and relative span, records the original rule and effective window, then uses an explicit range for matching. An all-date rule carries null; an explicit range must agree with its observed window. A pending date edit, stale response or unavailable scope cannot silently become another selection.

3. Capture matching IDs, current pointers, selected raw revisions and all allowed context in one bounded read-only Prisma transaction. Do not page through separate list requests or join independently fetched detail DTOs. Read raw `body`, `sourcesJson`, `aliasesJson`, `recordDate` and `recordDateTimeZone` without lossy parsing/defaulting; preserve malformed JSON and invalid assigned-date raw values. Validate current-revision ownership. With history off include exactly the current revision, not an inferred latest revision; with history on include all owned revisions. Null-current legacy records keep their actual fallback fields and an explicit legacy marker; no fabricated revision or historical kind is created. `currentRecordKind` belongs only to the point.

4. Use explicit column allowlists. Context includes selected-record memberships, collection/domain/node labels and explicit incident record relations. Relations retain stored direction/type/status/evidence and explanations. Outside endpoints may have ID/current-label stubs, not their bodies; this does not expand the record selection. Candidate or rejected relations do not become confirmed links. Learning events, mastery/review state, AI settings, startup tokens, environment, file-system paths and whole database rows are not export fields. User-owned source JSON remains original content rather than a settings dump.

5. Produce a versioned `manifest.json`, a readable `README.md` index and UTF-8 Markdown. File identities derive from stable IDs, not titles or unchecked path components. A current revision may share its record Markdown path; older included revisions have distinct paths. Preserve the original body bytes as a documented slice of each Markdown file, including CRLF, emoji and NUL; metadata and generated context are outside that slice. The manifest keeps original fields, ordered IDs, scope/effective window, capture time and file-to-record/revision mappings. Unknown or malformed metadata remains raw and gets an honest readable limitation instead of being rewritten as an empty value.

6. Fixed record references keep their stored revision and paragraph selector. Link to that exact revision only when its file is included. Otherwise show the stored fixed snapshot/quote and mark the missing independent target; never follow the target's current content or recursively pull outside records. Generated readable source text is inert, and any generated external link passes the HTTPS guard. Existing body text is not rewritten to resolve title-based links. No backlinks, mentions, mastery or relations are inferred during export.

7. The archive is ZIP32 STORE with CRC32 and UTF-8 names, requiring no new production dependency. Count all local headers, central directory, filenames, manifest and index toward the archive limit. All files must fit or the operation fails before returning a successful attachment; never silently truncate records, revisions or sources. The implementation has a 64 MiB archive/raw-snapshot budget and the ZIP32 65535-entry ceiling, with a bounded whole operation and one active export per Node process. The archive cap is not a claim that total process RAM stays below 64 MiB. Formatting and CRC work check cancellation/deadlines between bounded chunks; uncancellable database work is not falsely described as interrupted.

8. Manifest file hashes cover payload files; the manifest explicitly excludes its own hash from its file table to avoid circular integrity claims. A digest of the full ZIP covers the returned archive. CRC/digests detect accidental changes and do not authenticate source truth. The package is a portable readable export, not a claimed import/restore command or a replacement SQLite authority.

9. Return a same-origin `application/zip` attachment with a server-generated safe filename, length, digest and record/revision counts, `no-store` and `nosniff`. Return structured JSON on failure rather than wrapping binary success with the teaching JSON helper. Node runtime, existing Electron token injection, localhost Host/Origin and random 127.0.0.1 port stay mandatory. Do not add URL tokens, renderer credentials, IPC or a navigation exception.

10. Both list and detail expose discoverable export controls and an explicit history choice. Export reads saved state only and uses separate busy/error/cancellation state; it never hydrates, saves, resets or clears an editing draft. The renderer verifies status/type/size/digest before handing a Blob to the browser download mechanism. It may report that download was requested, but cannot claim the user saved a file or cancelled an operating-system dialog without a real download event. Cancellation of preparation aborts that request and preserves all record and filter state.

11. Validate complete results beyond one page, both history choices, exact raw fields/body slices, legacy/null pointers, fixed/outside references, incident relation status, concurrent save consistency, size/entry rejection and zero business writes. Independent ZIP readers must check CRC, UTF-8 names and file bytes rather than only testing the writer against itself. Real browser download and packaged Electron save/completed/cancelled, authentication and unchanged-window evidence are required. Verification writes only inside the already isolated temporary verification root; normal startup, navigation and user data remain unchanged.

## Consequences

Personal knowledge can leave the app in readable and machine-readable forms while revisions and source identities remain explicit. Very large packages fail with a scope/history reduction option instead of producing incomplete data. Export does not certify teaching effectiveness, source correctness, import compatibility or distribution readiness.

## References

- [PKWARE ZIP APPNOTE](https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT)
- [Electron 42 DownloadItem](https://raw.githubusercontent.com/electron/electron/v42.11.16/docs/api/download-item.md)
