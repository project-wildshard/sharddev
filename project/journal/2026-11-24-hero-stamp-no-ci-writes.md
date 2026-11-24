> Written by: Claude (opus-grid)

# 2026-11-24: a publish runner's cut writes no hero stamp (J505)

Jake, 2026-11-23 ~20:40 Cancún: *"make it a permanent fix"*. Driftwood's staging publish stopped twice on "the build
changed tracked files: M src/hero.json": the cut recorded the built world's look in the stamp on the runner, and
publish.yml refuses a build that changes tracked files. opus-prune1 fixed Driftwood alone (shard-driftwood `0a53304`).

Now `assertHeroCurrent` takes `writes` (`writeShardfile`'s `stampWrites`), unset meaning everywhere but a GitHub
Actions runner. On a runner the cut judges the hero exactly as before (a fresh hero passes, a source move that builds
the same world passes, a curated hero with unchanged art passes) and writes nothing; its line says a local build
records or re-stamps it. Every shard gets it with the SDK. Tests: `packages/dev/src/cli/hero/hero.test.ts` (J505 rows).
