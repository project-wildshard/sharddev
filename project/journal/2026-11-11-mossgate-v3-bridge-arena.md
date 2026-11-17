# Mossgate Hollow v3: braziers B and C, the moss bridge and the arena

> Written by: Claude (opus-mh3), 2026-11-11 ~20:05 Cancún

Meta TEMPLATE-E2E-PLAN row MH-3. The same row shape as brazier A
(MH-2): E at a brazier sends a scene event, `door.as` sets its shared
field once, and target rows switch a panel and its collider.

- `behaviour/hooks.json`: shared fields 103 `template.brazier-b` and 104
  `template.brazier-c` (public bools), scenes 203 and 204, conditions
  `template.brazier-b.lit` and `-c.lit` for MH-5's quest.
- `behaviour/door.as`: events 202 to 204 set fields 102 to 104, each
  once; `out_cap` is 4 (a door toggle and three lights in one tick).
- `data/targets.json`: `braziers` holds the three use points (placed by
  `product.ts` from `terrain.sites.braziers`). Field 103 shows the panel
  `template.pond-stones` and turns its colliders on; field 104 hides
  `template.arena-gate` and turns its collider off.
- `generators/world.ts`: `pondStones` puts five stone pillars across the
  pool at `layout.POND` (radius 5, bed -3, water at 0). The raised set
  (tops 0.1 m over the water, colliders, starts off) is the panel; a
  thinner sunken set 1.4 m under is static with no collider, so the
  raised panel covers it. `arenaRing` is a 3.2 m ring of twenty wall
  segments at `layout.ARENA` with the segment facing spawn left out,
  posts and a lintel round the gap, and bars as the gate panel.
- B and C's fire is particles only (`clientScripts.json` entities 5
  and 6, reading 103 and 104), with no flame panel.

## Two caps decided the layout

A panel draws twice (opaque and shadow) in every L0 tile its bounds
touch, and the tile-bake policy refuses more than 8 draws with no debt
row. Tile 0/4/3 (the braziers) was already at 8 with A's flame, so B and
C have no flame panel. Tile 0/3/3 (the moss gate, round the old boss at
-15, -20) was also at 8, so the arena moved to (-18, 16), in tile 0/3/4,
which had two draws to spare. The big blob and its encounter arena moved
with it (`creatures.json`, `encounters.json`, `layout.BOSS`, and the map
pins in `card.json` and `manifest.json`), so C opens the boss's arena. The sunken stones are static for the same reason:
two pond panels put 0/4/4 at 10.

The two particle pools cost the resident library budget about 100 000
bytes (the compendium sketch check refuses at 75 000), named
`MH3_LIBRARY_RESIDENT` in `product.ts`.

## Proved

`pnpm build:shards` passes the tile bake (0 debt). In a headless engine
preview with the MH-1 recipe, walking east along z = 20 from the west
bank:

- before B, the walk ends swimming at y = -2.95 in the pool;
- after E at B, it crosses dry to x = 35.8 (lowest y -0.23, the bank);
- before C, a walk at the arena stops at the gate, 9.9 m from the centre;
- after E at C, it goes in to 1.75 m from the centre.

No console errors. Shots in meta's template-e2e-v3/progress:
`t1-04-bridge.jpg`, `t1-04-arena.jpg`, `t1-04-arena-before.jpg` and
`t1-04-braziers.jpg`.
