# New-shard friction (meta NEW-SHARD-E2E, SHARD-SOURCE SS-NE rows)

The Mac mini built Honeyknoll from npm 0.3.2 as an outside author. These are its non-blocker rough edges (opus-ssne1).

- `new` printed nothing; it now prints the folder it made and the next command (F8).
- `executeBundle` used vm's `USE_MAIN_CONTEXT_DEFAULT_LOADER`, which printed an ExperimentalWarning on every check.
  The loader stays (a `new Function` import fails inside vitest's vm: "A dynamic import callback was not
  specified"); `process.emitWarning` drops that one warning while the loader runs (F9).
- `synth` only takes the older `export const scene` form; its refusal now says so and that `defineShard` needs no
  synth (F12). Help and GUIDE name `@wildshard/sdk/scene/shard` only (F11).
- The entry-road refusal names the edge, the point and the height. Scene shards also check the 8 m road's width
  (format's `entryways.ts` rule), which otherwise only said "entryway openings must meet road height" (F13).
- A scene shard's player had no weapon; the scene back end now writes the Template's iron sword as `items` before
  `extend`, which may replace it (F23).
- `wildshard grid` reads the public `/api/catalogue.json?channel=` and prints taken and free cells (F29).
- GUIDE section 2b is the scene shard: one worked example, coordinates and yaw, the entry-road rule, the `world`
  calls (F10). The header names sdk 0.3.x and npm works (F2). The manifest-root refusal says a scene shard needs no
  manifest.json; hero on a scene shard is F28's (F14).
- prove's help, the GUIDE and the tape refusal now carry the tape's shape. A stand-still tape on a scene shard fails
  `traveler pose changed on restore` in engine 0.1.24: an engine issue, F27's owner told.
