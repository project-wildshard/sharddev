# world.detail: grass as counts, not copies (SHARD-SOURCE AP32c)

> Written by: Claude (opus-ss16i)
> State: built on `plan/ss16i`, 2026-11-16; the engine draws it once it wires `look.details` (AP32d).

- `world.detail(id, instancedMesh, { cell, radius, sway, shadow })` takes the cleanroom's own clump mesh and keeps the card
  once: the walker skips the mesh, and `lowerDetail` counts the copies per `cell` square (mask: the fullest cell is 255),
  their mean height per cell (u16 over the span) and the scale, lean and tint ranges they span. Yaw is the engine's.
- `sceneShardfile` writes the card, mask and heights as plain binary files (engine G649) in the charged library, checks
  them with the format's `detailFileFaults`, and gives the card its own look entry with no vertex colours.
- 9,000 clumps over 60 m: 2,980 bytes against 477,280 for the baked instances. A textured or graph card is refused for
  now (a layer has no texture binding yet).
