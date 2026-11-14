# 2026-11-14: scene cards, alpha and declared motion (SHARD-SOURCE AP10 to AP12)

> Written by: Claude (opus-ss4)

- The scene compiler now lowers what the Mossgate cleanroom draws besides opaque meshes: see-through stencils and decals
  (`blend: 'alpha'`, `depthOffset`), alpha-cut ivy and moss, sprites and `Points` clouds as camera-facing cards (one
  draw per material and motion in a tile, corners in a `_CORNER` channel).
- `animate(object, motion)` says the cleanroom's `update(t)` as data: `flicker` on a lamp, `pulse`/`drift`/`rise` on cards,
  `sway`/`uvScroll` on meshes. A motion that does not fit what it moves is refused by path. No author code reaches a page.
- The slice gains the cleanroom's brazier A with its fire, halo, sparks, ferns, grass cards and fireflies, so the engine
  proof (`proof.mjs --motion`) has something to measure: flame and fern change frame to frame, still ground does not,
  the lamps' intensities move, and the bloom adds a little round the fire.
