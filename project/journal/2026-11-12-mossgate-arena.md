# Mossgate arena and the Warden's tell (LF1-9)

> Written by: Claude (opus-lf19), 2026-11-12 ~05:00 Cancún. **State:** three look-loop rounds shot; not signed off.

- **Floor (L0 tile 0/3/4):** a checker of flat 1.5 m squares, slate and dark moss, inside the ring (`arenaDressing`,
  `world.ts`), each over its highest corner, no collider. The arena walk and the fight stand on the ground as before.
- **Rim:** a jagged moss drip under every wall segment's cap on the inner face; three stone braziers on the rim across from
  the gate. Their flames are an emissive panel (`template.rim-flames`, `mossgate.flame`) that brazier C's field 104 shows,
  so the rim lights when the gate opens. The dressing is its own piece, so the coarse L1 tiles skip it.
- **The Warden's tell and core:** the slam tell is a glowing amber ring on the floor 3.5 m round the Warden
  (`template.warden-ring`, new `mossgate.tell` emissive, field 110), the core a gold gem over it (`template.warden-core`,
  `mossgate.lamp`, field 111). MH-4's twelve ring particle puffs shrink to embers (size 0.3); the core's particles sit at
  the gem. A panel is fixed: when the Warden steps toward a player the gem stays over its spot.
- **Draws:** 0/3/4 is at 8 (terrain 2, static 2, gate 1, rim flames 1, ring 1, core 1), paid for by the arena gate casting
  no shadow and the grey scatter cubes leaving 0/3/4 (they stood on the arena floor). 256 KB of 300 KB. The three panel
  files cost the library 63 KB resident and 34 KB compressed (`LF19_LIBRARY` in `product.ts`).
- **Proof:** look-loop sheets `~/.cache/wildshard/plan-artifacts/look-loop/mossgate-arena-r{1,2,3}/` and the
  before/after board `template-e2e-v3/progress/t1-14-arena-{before,after}.jpg`. `foliage.test.ts` keeps the dressing, flames,
  ring and gem in 0/3/4, colliderless, and the ring at 3.5 m.
