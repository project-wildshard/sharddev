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
