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
- SP11 (opus-sdksplit4): `scripts/dep-guard.mjs` is strict for build, kit, sdk and upload (`LEAN`): a forbidden name
  in the production tree, a source file importing the engine, or an export reaching it exits 1 (dev and the root only
  report). Proof: with `vite` moved into build's dependencies the CI step (`node --test test/ci/dep-guard.test.mjs &&
  node scripts/dep-guard.mjs`) exits 1.
- SP9d2 (opus-sdksplit4): `@wildshard/build` has its own bin, `wildshard-build` (`src/sharddev/buildMain.ts`: the same
  verb and options dev's `scripts/wildshard.mjs` gives `build`). `scripts/compile.mjs` (esbuild, at `prepack`) bundles it
  to `dist/build.mjs` with format, sdk, upload and kit inlined, so Node strips no TypeScript under `node_modules`; each
  inlined `import.meta.dirname/filename/url` points at that module's place in its installed package. The validator
  revision is the pinned engine's, taken at compile time. Build declares the sdk's run-time packages at the sdk's pins
  (tested). Proof: a clean `npm install` of the packed build, sdk, upload and kit (no engine, vite or playwright in the
  tree) runs `wildshard-build` on the installed sdk's Template: 229 `out/` files and the shard file byte-identical to
  dev's `wildshard build`.
- SP9d3 (opus-sdksplit4): dev's bin sends an author's `wildshard build <source>` to build's compiled bin when the
  install has one (an installed build always does; a checkout after `pnpm --filter @wildshard/build compile`, which CI's
  products job now runs before the author tests). build-shards' recorded builds (`--input-receipt`) and
  `--behaviour-only` stay on the author bundle, whose rolldown bridge records inputs. Cold Brasscap (fresh generation and
  compiler caches): 6.2 s and 5.5 s on the author bundle, 4.3 s and 4.1 s compiled; out/ and shard file byte-identical.
- SP10 (opus-sdksplit5): `packages/cli` (`@wildshard/cli`) is the `wildshard` command: it depends on build, upload and
  dev, sends `build <source>` straight to build's compiled bin (no dev, no engine) and loads dev's CLI for every other
  verb. `new` pins `@wildshard/cli` at the sdk's version instead of the engine. Proof from packed tarballs: a repo with
  only the cli runs build, dev and `upload --help`; a repo with only build builds the same Template bytes, no engine.
