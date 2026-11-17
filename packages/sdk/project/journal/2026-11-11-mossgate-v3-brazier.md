# Mossgate Hollow v3: the lantern lights brazier A

> Written by: Claude (opus-mh2), 2026-11-11 ~19:40 Cancún

Meta TEMPLATE-E2E-PLAN row MH-2. Press E at brazier A, its flame
shows, the moss gate opens, and both stay that way after a reload.
Engine features only, nothing shared with Template 2.

- `behaviour/hooks.json`: shared field 102 `template.brazier-a` (public
  bool), scene `template.brazier-a.light` (event type 202) and the
  condition `template.brazier-a.lit` for later rows (MH-5's quest).
- `behaviour/door.as`: the same scene hook now owns both fields. Type 201
  still toggles the door; type 202 sets 102 to 1, once. `out_cap` is 2 so
  a door toggle and a light in one tick both land.
- `data/targets.json`: a panel row shows `template.brazier-a.flame` when
  102 is 1, another hides `template.mossgate` and its collider. The use
  point is the `brazier` interaction, placed by `product.ts` from
  `terrain.sites.brazierA`.
- `generators/world.ts`: `brazierFlame` (four turned, tapering boxes in
  the bowl) and `mossGate` at `layout.MOSSGATE` (-9, -5): stone posts, a
  lintel, low wing walls, and a moss curtain in the 2.4 m gap.
- The fire's colour: the measure look gives every surface its role
  colour, so the flame shape reads as stone. The colour comes from a
  client script instead: `idle.as` style 3 burns two emitters (orange,
  yellow) at a `particles` anchor over the bowl while it reads 102 as 1.

Trap: the use point first sat 1.2 m over the pad, inside the stand's
collider (1.5 m tall). The prompt picker casts from the eye to the point
and the stand blocked it, so E did nothing. It sits at 1.7 m now.

Particle sizes are cheap but the pool is not: 200 live slots each broke
the library budget ("compendium sketch raster budget understated"), so
each emitter keeps 96.

Proved in a headless engine preview with the MH-1 recipe: walking west
at the gate stops at x = -8.4 before, passes to -17.3 after the light,
and again after a reload. Shots in meta's template-e2e-v3/progress:
`t1-03-brazier-before.jpg`, `t1-03-brazier-after.jpg`,
`t1-03-brazier-reload.jpg`.

## The red CI from MH-1b

CI's `products` job had failed since `8b3307b`: `pnpm build:shards`
runs the tile-bake policy, and the dressing in the coarse (L1) tiles put
1/1/1 at 202864 and 1/2/1 at 209780 compressed bytes, over the 200000
cap with no debt row allowed. The single-product `wildshard build` only
warns, which is why MH-1b saw a warning and not a refusal. The coarse
group now skips the dressing (ferns, mushrooms and slabs don't read at
L1 range); L0 still draws all of it. `build:shards` passes, 0 debt.
