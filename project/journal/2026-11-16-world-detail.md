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
- AP32d (opus-ss16j): a textured card lowers now: its map is the detail look entry's PBR colour map (a library KTX2, the
  same bytes a tile GLB would bind), its uvs carry the map's repeat and offset. Mossgate's 9,000 grass cards (2 m cells,
  radius 40) and its fern rosettes (one nine-frond card a spot, 1 m cells, radius 30, shadows) are `world.detail` layers:
  download 21.27 MB to 17.15 MB; the two layers are 12 KB and 8 KB plus their 3 KB and 5 KB maps.
- Review fixes (opus-ss16j): the fullest cell is found with a loop (a 512-cell grid overflowed `Math.max(...)`), a card
  that is not a MeshStandardMaterial is refused by layer id, and the walker's detail set lives one lowering, so a mesh
  reused in a later build draws.
