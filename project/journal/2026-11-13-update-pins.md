# 2026-11-13: `wildshard update --pins` (SHARD-AUTHORING SA18)

> Written by: Claude (lane opus-sa18)

- `update --pins[=<version>] [dir]` (`src/sharddev/updatePins.ts`): `pnpm view` the release (default `latest`),
  move every listed pin (sdk, engine, format, three, and `engines.node`) keeping each field and the file's indent,
  `pnpm install`, check the installed sdk and three, apply the new sdk's `codemods/<v>.mjs` for old < v <= new, then
  spawn the new sdk's own `update` and `check`. `--pins=` only: `--pins 0.2.4` would read `0.2.4` as the folder, so
  that refuses with a hint.
- The codemod hook: `codemods/` ships in `files`; a codemod default-exports `({ project, from, to })` and returns its
  change lines. `codemods/0.2.5.mjs` is a no-op that keeps the shape on file (0.2.5 is the release that brings
  `--pins`; a later codemod for 0.2.5 edits that file). Tested with fixture codemods for order and range.
- Found on the way: `scripts/wildshard.mjs`'s author bundle cache did not key on which sdk compiles. Receipts skip
  node_modules and this file is byte-identical across releases, so after a move with an unchanged shard-format the
  new sdk replayed the old sdk's bundle (my first proof ran 0.2.3's bundle from the checkout CLI and said "unknown
  wildshard command"). The recipe now adds the sdk's realpath and version.
- `claude -p` review, MUSTs taken: a failure before the codemods finish restores package.json and the lock file and
  reinstalls the old sdk (a rerun used to start from the new installed sdk and skip codemods); `from` is the exact pin
  and must match the install; every failure is `update --pins: ...` so it maps to `update-pins`, whose GUIDE heading
  lists each case. SHOULDs taken: `engines.node`, indent, numeric prerelease order, `--pins <v>` hint. Not taken:
  refusing on a dirty git tree (the skill and guide say start clean; no codemod ships yet).
- Proof: `pnpm --package=@wildshard/sdk@0.2.3 dlx wildshard new` in `tmp/opus-sa18`, `pnpm install`, check pass on
  0.2.3; this checkout's `update --pins=0.2.4`: sdk 0.2.3 -> 0.2.4, format v0.4.6 -> v0.4.8, guide, upgrade skill and
  agent files rewritten by 0.2.4's `update`, `check pass`; `src/` untouched. A second run: pins already match, check
  pass.
