# Synthetic legacy migration fixture

`legacy-pre-removal.schema.prisma` is the schema-only archive used to build the synthetic legacy migration database. It contains model definitions, not user records, credentials, or a user database.

- Original repository commit: `71a0071e0e6f8a04141b24fdd74e2a53b24f94b6`
- Original path: `web/prisma/schema.prisma`
- Original blob size: 18,759 bytes
- SHA-256: `5fc529cbcfec500786f1fbba3f589435347201bed317415af386a0d6d72f7ff7`

The archive is stored with the original UTF-8 bytes. Fixture generation reads it directly, so shallow checkouts and standalone source snapshots do not need the historical commit or a Git executable. A missing archive is an error; the current schema, development database, and user backups are not substitutes.

Run `npm run fixture:migration-legacy` in `web/` to derive the legacy schema, insert synthetic records, register the historical migration boundary, and check foreign keys. Then run `npm run verify:migration-fidelity` to verify backup-first upgrade and data retention. These commands must pass with a real Prisma engine in CI; inspecting this archive alone does not prove migration fidelity.

## Revision aliases boundary

`revision-aliases-28.schema.prisma` archives the schema-only boundary after the aliases migration, before saved-view configuration tables:

- Original repository commit: `0bacf71a687ab1e07d4c2686f38674b153df2b1d`
- Original path: `web/prisma/schema.prisma`
- Original Git blob: `0e53e7467f8bb18eb5d3bd9f158a99281e87f459`
- Original blob size: 19,575 bytes (UTF-8, LF)
- SHA-256: `5c45ab6b06b304c85de0f6719e250a23b992be4083f14209c10f22f79d2d50c8`

The aliases upgrade helper validates that hash and creates a temporary schema/migrations projection containing exactly the first 28 migrations. Its temporary seed copy removes only the known future saved-view table/ledger entry and then the aliases column/entry to reconstruct the populated 27 boundary. The actual lifecycle deploys only to 28, preserving the historical regression. No source seed, old migration, baseline or user database is rewritten. The separate saved-view upgrade helper reconstructs the 28 boundary in a temporary copy and verifies 28-to-29 preservation including nonempty raw aliases and configuration persistence after reopening and a repeated lifecycle.
