# Synthetic legacy migration fixture

`legacy-pre-removal.schema.prisma` is the schema-only archive used to build the synthetic legacy migration database. It contains model definitions, not user records, credentials, or a user database.

- Original repository commit: `71a0071e0e6f8a04141b24fdd74e2a53b24f94b6`
- Original path: `web/prisma/schema.prisma`
- Original blob size: 18,759 bytes
- SHA-256: `5fc529cbcfec500786f1fbba3f589435347201bed317415af386a0d6d72f7ff7`

The archive is stored with the original UTF-8 bytes. Fixture generation reads it directly, so shallow checkouts and standalone source snapshots do not need the historical commit or a Git executable. A missing archive is an error; the current schema, development database, and user backups are not substitutes.

Run `npm run fixture:migration-legacy` in `web/` to derive the legacy schema, insert synthetic records, register the historical migration boundary, and check foreign keys. Then run `npm run verify:migration-fidelity` to verify backup-first upgrade and data retention. These commands must pass with a real Prisma engine in CI; inspecting this archive alone does not prove migration fidelity.
