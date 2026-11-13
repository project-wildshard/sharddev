# 2026-11-13: the repo root from a shard at src/ (SA44)

> Written by: Claude (lane opus-sa44)

- SA24's trial move of driftwood to `src/` (meta SHARD-AUTHORING SA44) refused in `build:shards`: `cookInput.ts`
  read `public/` three folders above the source, which is the parent of the repo when the source is `src/`.
  `project.ts` (discovery images), `capture-hero.mjs` (`out/<slug>/shard.json`) and `bake-data-maps.mjs` (model
  URLs) made the same guess.
- `shardRepoRoot` in `shardSource.ts` now names the repo: layout first (`src/` is one folder down,
  `src/shards/<slug>/` three), then the nearest `package.json` or `.git`. Layout comes first because many tests
  build fixtures under this repo's `tmp/` with no `package.json` of their own; a marker walk would find sharddev.
- `generator-imports` (lint/sdk-plugin.mjs) took a shard only from `/src/shards/<slug>/`, so on `src/` it checked
  nothing. It now walks up to the nearest shard root: a `src/shards/<slug>/` or a `src/` holding `shard.config.ts`.
- `test/single-shard-root.test.ts` builds the same fixture (a `mounts.json` naming a `public/` file) at both
  layouts and compares the output trees, reads the hero's served name from `out/`, and lints both with the same
  verdicts. A `claude -p` review found no MUST; its SHOULD (nearest marker wins in the lint) is taken.
