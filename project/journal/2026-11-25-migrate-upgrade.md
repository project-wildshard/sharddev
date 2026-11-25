# `wildshard migrate` and `wildshard upgrade` (A7, M3, M4)

> Written by: Claude (opus, session 015pj4Rw). Plan
> `docs/plans/opus-2026-11-24-sdk-migrate-static.md`, rows M3 and M4.

## M3: `migrate [dir]`

- The gate's block says `pnpm exec wildshard migrate`, so `migrate`
  with no `--dry-run` is now the repo verb. `migrate --dry-run <file>`
  still goes to the CP7 admission dry run: the bin looks for the flag.
- It runs from the bin unbundled, like `status`. It reads the sdk in
  the repo's own `node_modules`, never the CLI's own copy: a repo with
  none installed is told to `pnpm install`.
- Order: git check, sync GUIDE.md and the skills, run the pending
  migrations oldest first, stamp, report. A migration may return
  `string[]` or `{ lines, manual }`; the manual ones print under
  "Manual steps", one line each with their version.
- The dirty-tree refusal is skipped when there is nothing to write
  (stamp already at the installed sdk, nothing pending). Otherwise the
  run right after a migrate, before the author commits, would refuse,
  and "safe to re-run" would be a lie.
- No stamp means `from` is `0.0.0`: migrate cannot know the old pin
  (the clean tree's package.json already says the new one).
- New refusals `migrate-no-git`, `migrate-dirty`, `migrate` with their
  GUIDE.md headings.

## M4: `upgrade [version] [dir]`

- Same flow as `update --pins`, which is now its alias. Codemods are
  picked by `migrationsForMove`: the pre-0.5.0 pin window (old path),
  plus `pendingMigrations` with the stamp, else the old pin, as its
  window start. So a hand-bumped repo (pin already the release) still
  gets a firing migration, and a codemod with no `pending` still runs
  on a pin move from an unstamped repo, as the old tests expect.
- The stamp is written inside the try, after the post-codemod install,
  so a failure puts package.json back with no stamp in it.
- Messages say `upgrade:` now. The refusal ids stay `update-pins-*`
  (ids are stable); their patterns and fixes moved to the new words.
- The versions and codemod listing moved from updatePins.ts into
  migrations.ts, the base layer, and updatePins re-exports them: that
  breaks the import cycle the migrate core would otherwise need.
  `SEMVER` got its explicit `RegExp` type (isolated declarations).
