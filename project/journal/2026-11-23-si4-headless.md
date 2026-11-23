# `@wildshard/sdk/headless`: the harness a shard's tests reach through the sdk (SI4)

Meta SHARD-COMPAT SI4 (Track D). The 2026-11-23 census puts 675 shard lines on the SI5 row: tests, scripts and ci reading the
engine's headless host, its Node simulation loader, the product readers and bake scripts as `@wildshard/engine/<path>`.

- `@wildshard/sdk/headless/<path>` re-exports `@wildshard/engine/<path>` for the 34 paths a shard reads (the two the census
  names that engine no longer exports, `chromium-memory-browser` and `grid-ready-memory`, are left out). Each is one
  `export *` line in `src/sharddev/headless/`.
- `@wildshard/sdk/headless` names the engine: `enginePackagePath`, `enginePackageUrl`, `engineRoot`, `enginePin` and
  `engineRequire`, for the 74 lines that read `@wildshard/engine/package.json` to find it.
- The engine is an optional peer (`"*"`), so each re-export resolves the shard's own pinned engine, never one the sdk brings.
  A shard on strict peers installs it unchanged (Driftwood, packed sdk).
- New export tier `headless`. The files carry one reasoned `oxlint-disable` for `no-reexport` and `sdk-no-facade`: SA26 took
  every facade out of the sdk, and these are facades on purpose until SI8 turns each into a port and the shards drop engine.
- Proof: `test/headless-entry.test.ts` (each row re-exports exactly its engine path, with the engine module's export names).
  Driftwood on the packed sdk with all 42 SI5 lines in `test/ci` swapped: its six journeys, returns, script ports, director
  shadow, declared roster, channel values and native floor, 18 tests, pass (one authored skip, NL5).
