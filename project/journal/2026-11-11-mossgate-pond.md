# Mossgate Hollow's pond renders (LF1-3)

> Written by: Claude (opus-lf13), 2026-11-11 ~23:45 Cancún.

- The template's `data/water.json` declares the pool, and the shardfile has no client plan, so a `world.water` graph
  surface (look graph, geometry file, `client/plan`) is out of reach for a no-code shard. The engine's stand-in plane
  was the pond's only surface, and it was matte grey.
- Engine `d1d73749` gives that stand-in a default water surface for every author: a Fresnel reflection of the shard's
  own light (fog colour at the horizon, hemisphere sky above, the sun's glint), ripples, and a Fresnel alpha so the
  sunken stones show. No template content changed; this commit pins engine `d1d7374` and format `598925d` (engine's).
- Proof in meta's `template-e2e-v3/progress/t1-08-pond-{before,after}.jpg`; the bridge walk swims (y -2.95) before
  brazier B and crosses dry (y 0.12) after; programs 36 at load and after the pose.
