# 2026-11-18: the Template under its line bar, part 1 (meta SHARD-SOURCE AP36c)

- `data/clientScripts.json` (1,398 lines) was 30 idle bindings a program can write: `generators/clientScripts.ts`
  derives one per creature spawn in `creatures.json` (its species' idle style) plus the fire anchors (braziers A to C,
  the Warden's twelve-anchor tell ring and core). Same bindings, renumbered in spawn order and named after their spawn.
- The bake back end is gone: `terrain.ts`, `props.ts`, `templatePropsSource.ts`, `mapInputs.ts`, `farLook.ts`,
  `templateProduct`, the coarse and far cell helpers, `plainWalls`, the dead `bake-template-shardfile.mjs` and the
  sim-level props and views boards. `test/fixtures/templateSource.ts` now runs the Template's own build.
- ci21 `template-generation` pins a gameplay digest (every non-world section, colliders, panel and model ids) and the
  map's pixels, in place of comparing to the bake. The ground-map test keeps Pastel's half.
- The Template's data is written compact (`scripts/bake/json.mjs`, 120 columns); the bake scripts that write it use the
  same formatter, so `template-kit-creatures.mjs --check` compares the bytes the tree holds. That check was red: the kit
  boar now ships a `harvest` the shards' boars never declared; a shard boar without one keeps none.
- Bar: 8,187 lines to 4,356 (generators 2,400, data 1,956).
