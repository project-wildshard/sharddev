# The SDK owns `generator-imports` (opus-sa6)

Meta SHARD-AUTHORING SA6 (J170, J317).

- The rule lived in engine's lint plugin (`lint/shard-imports.mjs`), so a
  shard repo only saw a change after an engine pin bump. It now lives in
  `lint/sdk-plugin.mjs`, plugin `wildshard-sdk`, which
  `.oxlintrc.author.json` loads beside engine's. A shard repo loads it from
  `node_modules/@wildshard/sharddev/lint/sdk-plugin.mjs`, so it moves with
  the sharddev pin.
- Generators, `data/`, `quests/` and `shard.config.ts` may now import the
  shard format (`@wildshard/format` or `@wildshard/shard-format`), valibot
  (the language the format's schemas are written in, so a generator can
  parse with them) and Node built-ins (J170: `node:*`).
- No ratchet: `wildshard-sdk/generator-imports` is a plain error, and every
  shard repo pays its hits to zero by hand. Engine's own
  `wildshard/generator-imports` is no longer switched on here; it can be
  deleted from engine once no shard repo config names it.

## The generator GLB codec (opus-sa6b)

- Open Plots' `tiledPlot.mjs` was the last generator over the rule: it
  imported gltf-transform and meshoptimizer to read its landmark GLBs and
  write its world. `src/sharddev/bake/generatorGlb.ts`
  (`@wildshard/sdk/bake/generatorGlb`) now does that: `newGlbDocument`,
  `readGlb` (every extension, meshopt decoded) and `writeGlb` (written as
  it stands, the same bytes the generator wrote before).

## Generators get a denylist (opus-gendeny)

Meta SHARD-AUTHORING SA38 (J319: "generators … are arbitrary node.js
code … only validate and lint that they don't cheat").

- In `generators/` the rule now refuses only the cheats: `@wildshard/engine`
  (host too), sdk subpaths outside `package.json` `exports`, another
  shard's source (path, `file:` URL or `@wildshard/shard-*` package), and a
  second `three` (`three/src`, `three/build`, `require('three')`).
  Everything else passes. `data/`, `quests/`, `shard.config.ts` keep the
  allowlist, minus `engine/host`.
- Shard repos stay on their pin: their generators import
  `@wildshard/engine/host/immutable` and `/shardfile`, which the new rule
  refuses; they move to `@wildshard/sdk/immutable` and
  `@wildshard/format/shardSchema` with the pin bump.
- Not visible to a lint, left for later: `#` imports, tsconfig `paths`,
  `createRequire`, an aliased `three`, `three/webgpu`.
