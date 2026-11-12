# Mossgate Hollow v3: the story's layout (LF1-0)

> Written by: Claude (opus-lf10), 2026-11-11 ~22:45 Cancún

Meta TEMPLATE-E2E-PLAN row LF1-0. Round 1 of the look loop found the
form off the story: all three braziers stood in a row in the yard, and
the moss gate was a wall slab with a moss curtain. The golden targets
(`art/targets/mossgate/`, t1-02 and t1-05 to t1-12) put them elsewhere.

- `data/layout.json` `BRAZIERS`: A at (-6.8, -1.4), just east of the
  gate's south pillar; B at (32.5, 22.5), on the pond's far (east) bank,
  2.5 m south of the stones' line, so the bridge walk along z = 20 does
  not hit it; C at (-6.6, 10.7), outside the arena wall, 3.6 m to the
  left of the gate's axis as you face it. The use points
  (`terrain.sites.braziers`) and the particle anchors (`product.ts`)
  follow the layout, so the field rows did not change; the anchors'
  copies in `clientScripts.json` now say the same places.
- `generators/world.ts` `mossGate`: two chunky 1.1 m square pillars with
  moss caps and plinths, a lintel between them, and across the 2.6 m gap
  five thick stone bars on a sill (the panel). Three vines with leaf
  tufts hang down each pillar's yard face; they are their own static
  piece (`template.mossgate-vines`) so the coarse L1 tiles skip them.
- The dressing moved off A's pad: a boulder, a fern and a mushroom clump.

## The cap: A's flame panel is gone

A panel draws twice in every L0 tile its bounds touch. A's new tile,
0/3/3, was already at 8: the terrain (2), the static props (2), the hut
door (2: it straddles x = 0, the tile edge) and the gate (2). A's flame
panel would make 10, which the tile bake refuses. So A burns particles
only, as B and C have since MH-3, on the same field 102. 0/4/3 drops to
6. LF1-2's emissive flame for A needs those 2 draws: a no-shadow panel
(1 draw, for the flame and the door) or moving the door off the tile edge
would make room.

## Proved

`pnpm build:shards`: 0 tile debt; 0/3/3, 0/3/4 and 0/4/4 at 8 draws,
0/4/3 at 6. In a headless engine preview (recipe in
`2026-11-11-mossgate-v3-sky.md`), MH-2's and MH-3's walks with the moved
use points: see the meta plan row for the numbers. Captures from t1-06's
and t1-10's cameras are in meta's `template-e2e-v3/progress/`
(`t1-06-layout-{before,after}.jpg`, `t1-10-layout-{before,after}.jpg`).
