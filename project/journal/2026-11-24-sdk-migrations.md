# The sdk knows which migrations a shard repo has not run (A7, M1, M2)

> Written by: Claude (opus, session 015pj4Rw). Plan
> `docs/plans/opus-2026-11-24-sdk-migrate-static.md`, rows M1 and M2.

## M1: the stamp and `pendingMigrations`

- Until now only `update --pins` ran codemods, picked by the pin
  window. A repo bumped by hand (`pnpm add @wildshard/sdk@0.5.0`) had
  its pin already at the new version, so nothing ever ran and nothing
  said so.
- `package.json` `"wildshard": { "migrated": "<v>" }` is now the
  record: the sdk version the source was last migrated to, not the pin.
  `writeStamp` changes that one field and keeps key order and indent,
  as `movePins` does.
- A codemod from 0.5.0 on also exports `title`, `pending({project})`
  and `guide`. Pending means: in the stamp's window, or `pending`
  fires. No stamp (every repo today) means only `pending` counts.
- Codemods older than 0.5.0 are never loaded to ask: 0.4.24's imports
  the TypeScript compiler, and the gate runs before every `dev`.
- `updatePins.ts` now imports `./agentFiles.ts` with its extension, so
  Node loads `migrations.ts` straight from the bin, no bundle. The
  codemod listing moved into `codemodFiles`, shared by both.
