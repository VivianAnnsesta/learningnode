# User database lifecycle is backup-first and migration-verified

Status: Accepted

Date: 2026-07-13

## Context

The prior desktop flow copied a populated development database to a new user's data directory and never upgraded an existing user database. The build flow also ran `prisma db push --accept-data-loss` and continued after database failures. That combines personal data leakage, destructive schema drift, and unverifiable upgrades.

## Decision

The historical migration chain cannot be replayed from an empty database: a legacy migration changes `GraphCanvas`, but no prior migration creates that table. Historical migration files cannot be changed because deployed databases verify their checksums. The packaged application therefore ships a versioned, empty SQLite seed database built from the committed `prisma/baseline/20260713_prd_v1_2_schema.sql`. The seed generator records the checksum of every historical migration as already applied, then validates that `migrate deploy` finds no pending work.

On every packaged launch, before the Next server starts, it must:

1. create or identify the user database below Electron `userData`;
2. copy an existing database to a timestamped backup before any migration attempt;
3. run the committed Prisma migrations with `migrate deploy`, never `db push`;
4. run `PRAGMA foreign_key_check` and defined migration-fidelity checks;
5. start the server only when every prior step succeeds.

Legacy upgrades that still contain `Word`, `CoreEssence`, `InferenceTree`, and
tag tables require an additional fidelity bridge around `migrate deploy`.
Before migration, the runtime writes a local, versioned fidelity snapshot next
to the user database. After migration it restores direct `KnowledgePoint`
fields (`language`, `sentenceSample`, and review scheduling), and stores the
lossless legacy core rationale, inference-tree structure, relations, and tags
inside the existing `manualBranchesJson` compatibility envelope. Readers must
continue to accept the earlier plain branch-array format. The snapshot is
removed only after field, count, relationship, semantic-sample, and foreign-key
checks all succeed; otherwise both it and the database backup remain available
for recovery. Snapshot format v2 is required; an older or incomplete sidecar is
rejected before migration and requires restoring the corresponding pre-migration
database backup instead of guessing at missing semantics.

Because SQLite foreign keys only prove that referenced IDs exist, forward
migrations also install storage-boundary guards for Domain ownership. A
Learning Node's Unit and Knowledge Point, a graph node's Knowledge Point, both
ends of a graph edge, and both ends of a learning dependency must belong to the
same Domain recorded by the owning row. Self-dependencies are rejected. The
guard migration performs a preflight query and fails instead of silently
rewriting contradictory existing data.

Business-identical legacy `WordRelation` or formal graph edges may contain different explanations,
evidence, or status history. The idempotent formal edge remains one row per
Domain/source/target/type, but the pre-migration fidelity snapshot captures
every physical variant and restores the complete ordered set to
`KnowledgeGraphEdge.legacyVariantsJson`. Verification compares both business
relation counts and raw semantic-variant counts; grouping duplicates before
comparison is not sufficient evidence of preservation. Transitional databases
may contain both a `WordRelation` and a formal edge with the same ID; both
physical semantics are retained. Cross-table history is ordered deterministically
by `createdAt`, then source kind and source row identity.
If the destructive relation-deduplication migration is already recorded as
applied but no variant column exists, the lifecycle fails closed and requires a
pre-deduplication backup because deleted variants cannot be reconstructed.

Any failure is terminal for that launch: the application must show the failure and leave the backup available. The packager must create the seed from the committed baseline plus checked-in migration history, must not copy a development database, and must fail rather than package after a database error.

## Alternatives considered

- Copying `dev.db`: rejected because it can include personal or test data and does not prove upgrades.
- Editing the broken historical migrations: rejected because changing an applied migration changes its checksum and invalidates deployed migration history.
- Replacing migrations with `db push`: rejected because it is not an auditable upgrade protocol and can lose or drift user data.

## Verification evidence

The committed seed is created from the baseline, records the 15 migrations represented by that baseline, then applies every later migration with `migrate deploy` and checks `PRAGMA foreign_key_check`. A synthetic pre-removal database exercises the actual `WordRelation` conversion, physical relation deduplication, v2 semantic-variant restore, legacy Word/core/tree/tag preservation, and foreign-key check. This fidelity verifier runs before Electron packaging and fails the build on any mismatch; packaged runtime and security checks use isolated temporary user-data directories.

## Consequences

- `dev.db` is not a release artifact or a seed source.
- The baseline exists solely to bootstrap a clean installation; future schema changes remain normal Prisma migrations and must be covered by fresh-seed and upgrade tests.
- Runtime migration support and its Prisma migration engine are packaged deliberately and tested as part of the desktop runtime.
- Each migration needs fidelity assertions for preserved legacy fields, counts, and relationships; a foreign-key check alone is insufficient.
- Existing migration files remain immutable. Compatibility work needed around a destructive historical migration belongs in the runtime fidelity bridge or a new forward migration.
- Seed creation and upgrade verification are separate scenarios: a clean install must be empty, while an upgrade must preserve supported user data.
