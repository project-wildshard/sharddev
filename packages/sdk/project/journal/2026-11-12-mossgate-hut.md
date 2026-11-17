# Mossgate Hollow's hut and look finish (LF1-7)

> Written by: Claude (opus-lf17), 2026-11-12 ~01:55 Cancún.

- **Hut rows:** a pitched moss roof (two trim slabs, so the trim grid draws shingle courses; a ridge cap; stone gables up
  to the slabs' underside), wood door posts and lintel, a bench left of the door and two hooped barrels right of it
  (wood colliders, clear of the spawn-to-door walk). The door lamp has an iron frame round an emissive glass
  (`template_hut_lamp`, material `mossgate.lamp`: a whole shape in 0/4/3, 1 draw, no shadow).
- **The look finish:** mesh colours by role (`STONE`, `MOSS`, `WOOD`, `IRON`, ... in `generators/world.ts`; the kit's
  trim boxes are moss) so `materials.pbr.measure.tint` [0.85, 0.85, 0] keeps them: two stone tones, moss caps, wood,
  red caps in 0/3/3 for free. Grain 0.35 m, grid [0.35, 0.55, 0.18], a darker olive floor. `look.light`: ao, a warm
  rim, a light pool under the lamp; `grade.bloom`. All of `look.light` and bloom draw only with Settings ▸ Debug ▸ Look
  ▸ "Look light" on (engine LF1-4). Height fog was tried and dropped: it veiled the whole yard.
- **Brazier A's flame:** an emissive panel (`template.flame-a`, `mossgate.flame`) shown by field 102. **Kit:** a props
  panel may now name its own material and set `castShadow: false` (1 draw a tile instead of 2;
  `src/sharddev/bake/props.ts`, test in `props-material-names.test.ts`). The hut door and the flame both use it, so
  0/3/3 stays at 8 draws. Rulers: `build:shards` 0 debt; 0/3/3 8 draws, 296 KB of 300 KB; 0/4/3 7 draws, 282 KB.
- **Bytes:** 0/3/3 has ~4 KB left. A flat-shaded triangle costs about 150 B there, so the roof is two slabs, not
  shingle boxes.
- Rounds: meta `~/.cache/wildshard/plan-artifacts/look-loop/mossgate-hut-r{1,2,3}/`.

## Checks (opus-lf17b, ~02:00 Cancún)

- Headless engine preview of sharddev main, every walk re-run: spawn to the door stops at z −8.5; the gate stops at
  x −8.4 before A and passes to −25.9 after, and after a reload; the pond swims (y −2.95) before B and crosses dry to
  35.3 after; the arena stops 9.9 m out before C and reaches 1.4 m after. A 12-leg orbit walk round the hut (1.25 m off
  the walls, in front of the bench, barrels and lamp post) reached every stop. No console errors.
- **Fix:** the small boulder at (-2.6, 2.6), there since MH-1b, sat on the spawn-to-arena walk; the walk only got past it
  by the harness skipping a stuck waypoint. It moved to (-1.0, 4.0), same tile 0/3/4, and `foliage.test.ts` now keeps
  every dressing collider (boulders, lamp post, bench, barrels) 0.5 m off the walks (red on the old spot).
- **Trap:** `build:shards` now writes `out/_template`. The untracked `src/shards/_template/public/` is a stale build
  from 2026-11-11 23:38 (pre-LF1-5); packing it gives a flat roof and no trees. Pack `out/_template`.
- Shot: meta `template-e2e-v3/progress/t1-07-brazier-a-lit.jpg`; orbit frames in `progress/lf1-7b/`.
