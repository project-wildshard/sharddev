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

## M2: `wildshard status` and the up-front `migration-pending`

- The gate sits in `packages/dev/bin/wildshard.mjs`, before the
  dispatch, not in `scripts/wildshard.mjs`: `build` and `upload` never
  reach that script (build runs build's compiled bin, upload runs
  `src/cli/main.ts`). `@wildshard/cli`'s bin hands `build` straight to
  build's bin, so it asks the same gate first, through
  `scripts/migration-gate.mjs` (format hook first, then the .ts).
- The installed sdk is the one in the repo's own `node_modules` (as
  `update --pins` reads it), else the CLI's own. That is the sdk the
  author installed, and it made the gate testable on a real temp repo
  with a fake installed sdk and a real codemod file.
- `check --json` prints its version-1 verdict document with one
  refusal, `rule: migration-pending`, step `lint` (like `pin-not-sdk`,
  it is about the repo, not the source). The other steps skip.
- Help, `upload status` and a verb with no operand pass the gate. A
  folder whose package.json lists no sdk is not a shard repo: no gate,
  and `status --brief` stays silent there, so a SessionStart hook can
  run it anywhere.
- `wildshard migrate` today is the old `--dry-run <file>` admission
  verb; the block names `pnpm exec wildshard migrate` for M3, which
  has to fold the two together.
