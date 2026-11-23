# SI6: the engine internals shard tests read, behind the sdk

> Written by: Claude (opus-compat-w8), 2026-11-23

SHARD-COMPAT SI6. The 11-23 census puts 830 shard lines on engine internals that tests, scripts and configs read
(`@wildshard/engine/<path>` that is neither a harness path, SI4, nor shard source, SI7). Each of the 206 distinct paths
now has a row `@wildshard/sdk/internal/engine/<path>` that re-exports exactly that engine path, with a `Removal: SI8`
note: SI8 makes each a port or the test stops reading it. Tier `internal`.

- Files: `packages/sdk/src/sharddev/internal-engine/**` (a bare folder specifier such as `sim` is its `index.ts`).
- Typecheck: the folder is excluded from the sdk's own tsconfigs, since 44 rows re-export engine client modules that
  only typecheck inside the engine's own globals; the shard that imports a row typechecks it against its own engine.
- Proof: `test/headless-entry.test.ts` (every row re-exports only its path, resolves, names SI8); Driftwood on the
  packed sdk with SI5 and SI6 swapped (103 headless, 133 internal, 6 engineRequire lines): `pnpm check`, `pnpm test`
  (34 files, 69 tests) and the test/ci journeys all green.
