# Template hero recapture

- opus-tmplhero: `_template`'s hero (captured 11-12 17:39 Cancún) went
  stale with `01b2290` (pond bowl to a beach), so `wildshard build
  src/shards/_template` refused and CI's `package-products` `_template`
  case was red. Recaptured with `wildshard hero`: no declared camera, so
  the spawn view (the moss-roofed hut down the stone path).
- How the candidate was served, since engine `serve-build.sh --shard`
  now installs pins and never builds a working-tree shard: an engine
  worktree at `fdd00552` (`scripts/worktree.mjs new`), its
  `out/_template` replaced by `wildshard build src/shards/_template <dir>
  --folder-only` from sharddev `08fd9f3`, that product's
  `validation.json` `revision` set to the engine tree's
  `shardfileValidationRevision` (index and source hashes unchanged),
  `WILDSHARD_PREPARATION_ONLY=1 node scripts/build-app.mjs`, served by
  `scripts/preview-server.mjs` on 127.0.0.1:4787 (the stamp's `base`).
  Engine `fdd00552` is newer than our pin `867f3b96`; no render, sky or
  water change between them.
- `docs/dev.md`'s serve step is out of date for the reason above; worth
  a row, not fixed here.
