# 2026-11-13: shard source as a three.js scene (AUTHORING-PARITY M1)

> Written by: Claude (lane opus-ap1)

J339: authoring should be as easy as the cleanroom. The SDK already ran three.js at build time but treated the scene as a
triangle soup and made the author restate materials, lights, colliders and water in JSON. `src/sharddev/scene/` is the
front end that reads the scene instead:

- `lower.ts` walks a `defineShard` build into one description (materials with their maps, instanced draws, sprites,
  lights, fog, `solid()` boxes, `Water` outlines), a content hash per `world.part`. Refusals name the object's path.
- `author.ts` / `canvas.ts`: `paint(w, h, fn)` and a Canvas 2D subset, so the cleanroom painters port by swapping two lines.
- `shardfile.ts` is the build back end: per-material merges per tile with textures as RGBA8 KTX2 props slots, generated
  `look.materials` / `props.materials`, lamps, sun, fog, terrain, collider boxes and water rows. Phone caps are reported
  (J338), never refused, for now.
- `src/shards/authoring-slice` is the Mossgate hut, pond and lamps ported line for line; `wildshard check` passes on it.
