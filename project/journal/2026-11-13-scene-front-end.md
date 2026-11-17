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

Later the same evening: `wildshard watch` (`src/sharddev/watch/`). The page boots once from a live shell (ground, look,
sun, spawn); each edit re-bundles `shard.config.ts` (~0.3 s), re-runs `describe()`, and pushes only the parts whose hash
moved over server-sent events to engine's dev scene host (engine `src/client/game/devScene`, AP5). `watch/proof.mjs`
edits the slice's roof colour ten times and times file write to the first frame drawn with the new colour: median
869 ms, no reload, the player still. A look or ground edit still rebuilds the shell and reloads (AP17 is that fast path).
