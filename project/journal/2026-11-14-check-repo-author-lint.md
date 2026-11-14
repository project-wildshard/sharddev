# 2026-11-14: `wildshard check` lints npm-installed shard repos (SS3 follow-up)

- The npm sdk ships no `.oxlintrc.author.json`, so `check` skipped lint in every shard repo that installs the sdk from
  npm (found while making shard-brasscap, SS3).
- Shipping sharddev's config would not have been enough: oxlint matches a config's `overrides` against paths under the
  config's own folder, and every wildshard rule sits in the `src/**` overrides. Run from the sdk's folder over a repo's
  absolute path, `Math.random()` passed; the same config copied into the repo flagged it.
- Every live shard repo already carries its own `.oxlintrc.author.json` (jsPlugins under `./node_modules`), which its
  `pnpm lint` runs from the repo root. `check` now runs that one the same way (`authorLint.ts`): the repo's oxlint, else
  the sdk's, cwd the repo root (`shardRepoRoot`, so `src/shards/<slug>` works too), `WILDSHARD_RATCHET_FILE` when the repo
  has `lint/ratchet.json`. Without a repo config it falls back to the sdk's own (the sharddev checkout, as before), and
  without either it skips with a note that names the missing file.
- Proved with this checkout's bin: shard-brasscap lint passes; a scratch copy with `Math.random()` fails on
  `wildshard/no-raw-random-time`. `wildshard new` still writes no author config, so a fresh repo skips lint (a row).
