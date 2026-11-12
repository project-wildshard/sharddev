# Mossgate gate and pond (LF1-8)

> Written by: Claude (opus-lf18), 2026-11-12 ~04:35 Cancún. **State:** two look-loop rounds shot; not signed off.

- **Pond (L0 tile 0/4/4):** 12 reed clumps with cattails (rim and shallows), 10 lily pads with three pink flowers on the
  water, and a moss-topped stone kerb over the rim that hides the crater's slanted edge, open where the crossing meets
  each bank (`pondPlanting`, `world.ts`). All ride the static draw: bytes, not draws. No colliders, so the swim and the
  bridge walk are unchanged.
- **Brazier B's flame:** an emissive panel (`template.flame-b`, `mossgate.flame`) that field 103 shows, like A's. 0/4/4 was
  at 8 draws; the raised pond stones now cast no shadow (1 draw, not 2), which pays for it.
- **Gate (0/3/3):** thicker moss cushions on the pillars and lintel (the same boxes resized) and four flagstones up to the
  sill (flat quads, 2 triangles each). 0/3/3 is at 297 KB of 300 KB, so nothing heavier went there.
- **Rulers:** `build:shards` 0 tile debt; 0/3/3 8 draws 297 KB; 0/4/4 8 draws 211 KB (from 104 KB). A first cut with box
  kerbs and capped cattails put 0/4/4 at 294 KB: about 144 B a triangle here, so the kerb became a six-triangle strip.
- **Trap:** the kerb's top first sat at bank height + 0.12, which is under the water (the bank is about −0.2, water 0), so
  round 1 shows no kerb. Round 2 keeps its top at least 0.12 over the water.
- **Proof:** headless engine preview (engine `d5dcabd1`, product pinned), Look light on. Rounds in meta
  `~/.cache/wildshard/plan-artifacts/look-loop/mossgate-{gate,pond}-r{1,2}/`, the open gate and raised stones set by play
  (a use beside A, then B). Boards `template-e2e-v3/progress/t1-13-gate-pond-{before,after}.jpg`. Walks: spawn to the door
  z −8.3; gate stops at x −8.4 before A, −25.9 after, −17.3 after a reload; the pond swims (y −2.95) before B and crosses
  dry to 35.3 after; arena 9.9 m out before C, 1.4 m after; 12 orbit legs clean; no console errors.
- **Left for Jake's board:** the water reflects no sky (engine default surface), no lanterns on the gate or the bank posts
  (each glass is a draw; both tiles are at 8), no A / B plaques, the grey scatter cubes on the pond's banks.
