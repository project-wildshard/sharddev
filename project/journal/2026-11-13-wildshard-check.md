# wildshard check (SA4)

- Lane opus-sa4, meta SHARD-AUTHORING SA4 (J317: the loop is new, dev,
  check, hero, upload). `wildshard check <project> [output] [--json]` runs
  lint, build (product only), validate, prove and the report card and gives
  one verdict. `--json` keeps stdout to the verdict document; logs go to
  stderr (also the CI-only compiler-bundle timing line).
- Lint runs the SDK's `.oxlintrc.author.json` from the SDK root (its
  jsPlugins resolve engine from the working directory). oxlint is a dev
  dependency, so an installed sdk skips lint with a note; shipping it is
  for SA8/npm. oxlint also skips git-ignored paths (a project under
  `tmp/`), which reads as a skip, never a pass.
- `prove` runs only when the project has `proof.json`: the author proof
  tape needs at least one required quest fact, so a fresh `new` has none.
- The report card is measured inside the build's `admit` hook, so `report`
  reads it back without a second simulation.
- `--version` now prints the chain: `@wildshard/sdk`, `@wildshard/engine`,
  `@wildshard/format`, `three`, one per line.
- Surprise: the cached author compiler (WILDSHARD_SHARDFILE_CACHE) replayed
  a stale bundle after an uncommitted edit to `check.ts`; deleting the cache
  fixed it. Not changed here.
- Timings on this Mac: `new --empty` then check 2.2 s installed; the default
  `new` reference project 10.4 s (build 9.6 s), verdict pass.
