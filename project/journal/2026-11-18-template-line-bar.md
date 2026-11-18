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
- The Warden's skin program moves to `sources/warden.ts`: it made the committed GLB and is not part of the build
  (`generators/` is what `wildshard build` runs).
- Bar: 8,187 lines to 4,089 (generators 2,133, data 1,956), half the Template before the port. The plan's 2,926 was
  half of the 11-13 tree; the TC-M rows, OF4's creatures and M4.10's Warden and look have been added since.
- Fix forward (main CI's ci21 suite): the Template's `data/map.json` inputs name exactly the SDK files its
  generators now reach (96, from 81 after the bake left), and `lint/shard-layout.json` allows a `sources/` folder.
- Main's products job had been red since the scene port (`10aad0ff`): the scene Template's far (LOD 1) tiles carry 4
  to 6 draws where the bake's carried none. `lint/tile-bake-debt.json` records the twelve as exact `_template` rows;
  the far tiles' draws are a look follow-up, not a gameplay change.
