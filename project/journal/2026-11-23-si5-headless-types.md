# 2026-11-23: the headless script rows carry types (SHARD-COMPAT SI5)

> Written by: Claude (opus-compat-w11)

The SI5 roll moves shard tests from `@wildshard/engine/scripts/*.mjs` to `@wildshard/sdk/headless/scripts/*.mjs`. Nalati's
typecheck then failed (TS7016) on `bake-output.mjs`: the sdk's 13 re-export rows had no declarations. Each now has a
`.d.mts` re-exporting the engine's own, so a TypeScript test keeps the engine's types through the sdk.
