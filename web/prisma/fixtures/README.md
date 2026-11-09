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

The aliases upgrade helper validates that hash and creates a temporary schema/migrations projection containing exactly the first 28 migrations. Its temporary seed copy removes only known future empty configuration tables and matching ledger entries, then the aliases column/entry to reconstruct the populated 27 boundary. The actual lifecycle deploys only to 28, preserving the historical regression. No source seed, old migration, baseline or user database is rewritten. The separate saved-view upgrade helper reconstructs the 28 boundary in a temporary copy and verifies 28-to-29 preservation including nonempty raw aliases and configuration persistence after reopening and a repeated lifecycle.

## Saved-view boundary

`saved-knowledge-views-29.schema.prisma` is the schema-only archive after saved views and before personal record templates:

- Original repository commit: `a74f5f95fc17df3af6b0a8e77e351a699ec1db28`
- Original path: `web/prisma/schema.prisma`
- Original Git blob: `2368c9398bfcbd21a5f57c5f8bb8d36262429182`
- Original blob size: 19,831 bytes (UTF-8, LF)
- SHA-256: `097637e12a4cfb613b54ebf80d9d1678eaf7fe43fbef00c3451feb940122b6f9`

The saved-view regression validates this archive and deploys exactly the first 29 migrations. Its temporary seed copy removes only the known empty template table/migration entry before projecting away saved views to construct the populated 28 boundary. The aliases regression similarly removes these known future empty configuration tables before constructing 27. Unknown future migrations, mismatched table/ledger state, nonempty configuration tables, or a missing/changed archive fail closed. The separate 29-to-30 template regression keeps nonempty saved-view configurations and their versions together with all old knowledge and ledger fields, then verifies custom template persistence without creating records or learning facts. All projection operations occur only in isolated synthetic fixture copies.

## Personal-template boundary

`record-templates-30.schema.prisma` archives the schema after personal templates and before revision-owned record dates:

- Original repository commit: `ecd0d51f48756aa09e827d838a6c4cf939a49924`
- Original path: `web/prisma/schema.prisma`
- Original Git blob: `5050fab970a346b6dcd66048b228647e4248e177`
- Original blob size: 20,092 bytes (UTF-8, LF)
- SHA-256: `cca4a1b8ded7f5037c814f30872c9d0a674c308d4faca5f07bd16e10e9665cd2`

The template regression validates this archive and deploys only the first 30 migrations. Before any older projection, a temporary empty seed copy may remove the known nullable record-date columns and their exact migration ledger entry. Both columns, their null defaults and the ledger must agree, and the revision table must be empty. Unknown future migrations, partial schema, nonempty revisions or altered archives fail closed. No projection disables or removes the existing immutability trigger. The separate populated 30-to-31 regression preserves both configuration kinds, raw knowledge and ledger data, verifies all old dates remain null, and exercises date additions/changes/clearing only through new revisions and current-pointer updates with the trigger enabled.
