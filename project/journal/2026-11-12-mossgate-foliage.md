# Mossgate Hollow's foliage (LF1-5)

> Written by: Claude (opus-lf15), 2026-11-12 ~00:00 Cancún.

- **Draws:** the props bake (`src/sharddev/bake/props.ts`) already merges every `static` shape in a tile into one
  primitive. So the trees, tufts and ferns ride the measure stone's static draw and cost bytes, not draws. Instancing
  each kind would have cost a draw per kind per tile, and the yard's tiles 0/3/3, 0/3/4 and 0/4/4 were already at 8. No
  engine change was needed for the merge.
- **Trees:** eight round toy trees (`TREES` in `generators/world.ts`). Each is a six-sided trunk (structure) under an
  80-face crown (trim), with a trunk collider. Two stand left of the hut, one right, and five round the yard and toward
  the arena.
- **Tufts and ferns:** 30 tufts of five three-sided blades and 6 new tent-frond ferns, at the hut's walls, the moss
  gate's wings and pillars and the arena ring's outer foot, plus a few in the open. Tufts and ferns have no colliders.
  The dressing's ten ferns now use the same tent fronds (6 triangles a frond instead of a box's 12), which pays for
  the trees' bytes in 0/3/3.
- **Measure UVs:** every foliage vertex carries one fixed measure point 0.37 m into a 0.74 m face. A leaf takes its
  role's flat colour with no grid line or size label. Its mesh colour is real, so a later `tint` keeps it.
- **Red caps:** the mushroom caps in tile 0/4/3 (x ≥ 0, z < 0) are one whole shape, `template_mushroom_caps`, with
  no shadow. It uses GLB material `mossgate.mushroom-cap`, which `props.materials` binds to an emissive
  `look.materials` entry (LF1-2). That is 1 draw, so 0/4/3 goes from 6 to 7. Every props GLB now names its surface:
  the stone is `measure`, bound to `pbr`. Tile 0/3/3 is at 8 draws, so its caps stay stone boxes. The board names the
  tile: 0/3/3, 8-draw cap.
- **Rulers** (`build:shards`): 0 tile debt. 0/3/3 is at 8 draws and 282 KB of its 300 KB L0 cap. 0/4/3 is at 7 draws
  and 248 KB, 0/3/4 at 8 and 194 KB, 0/4/4 at 8 and 104 KB. The L1 tiles stay under 200 KB, because the coarse tiles
  skip foliage.
- **Proof** (headless engine preview, product pinned): `template-e2e-v3/progress/t1-01-foliage-{before,after}.jpg`
  and `t1-03-foliage-{before,after}.jpg`. All of these walks still behave as before:
  - spawn to the hut door, which ends at z −8.5;
  - the gate, which stops at x −8.4 before A and passes to −26.6 after;
  - the pond, which swims before B and crosses dry to 35.7 after;
  - the arena, which stops 9.9 m out before C and reaches 1.6 m after.
  There were 38 programs at load, after the poses and after the walks, and no console errors.
  `generators/foliage.test.ts` keeps every trunk 1.5 m off those walks and the use points.
