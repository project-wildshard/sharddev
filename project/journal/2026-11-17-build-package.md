# The build package (SDK-SPLIT SP9c)

- `@wildshard/build` (`packages/build`, private until SP12) takes `project.ts` and `synth.ts` with their tests. Dev's
  CLI, check, dev server and watch import `@wildshard/build/project` and `/synth`; the sdk drops both exports (no shard
  repo imports them) and gains the internal exports the build reaches it by.
- The build verbs stay in dev's CLI until SP10's `packages/cli`; `projectGeneration` and `bundle` stay in the sdk,
  which shard sources and the compiler identity import. The shard file writer is upload's already.
- Tests that need the engine as an oracle (`decision-product`, `author-discovery`) moved to dev; build's own suite has
  no engine. The generation cache proof runs from `packages/build` in CI. dep-guard: build's tree holds no engine,
  vite, playwright, happy-dom or vitest in production.
- SP9d1 (opus-sdksplit4): the `build` verb itself moved to `packages/build/src/sharddev/buildVerb.ts` (`runBuild`, the
  static report, the shard file refusal); dev's CLI hands its `build` branch there. Build keeps byte copies of the
  engine's `shard-outputs.mjs` and `decision-legacy-lines.mjs` (node and valibot only) in `packages/build/scripts/`,
  and dev's scripts import those. The Template's 229 `out/` files and shard file are byte-identical before and after.
