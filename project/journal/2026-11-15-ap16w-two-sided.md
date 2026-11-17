# AP16w: two-sided tile materials (opus-ss16c)

- Probed both back ends' grass cards: watch drew them `DoubleSide`, build drew them `FrontSide`. The shardfile entry
  said `doubleSided: true`, but engine's declared-props variant takes `side` from the tile GLB's own material, and
  `scene/shardfile.ts` wrote every tile GLB material one-sided. So build culled the back faces watch drew.
- Fix: a tile GLB material is double-sided when its scene material is (`glbMaterial`). Built Mossgate and Brasscap now
  draw their foliage cards' back faces as three.js does.
- Drift left (hut-back 0.47/255): not the normal map (a flat normal map on watch's materials changed nothing) and only
  a little the mips (mips off: 0.42). Watch draws plain `MeshStandardMaterial`; build draws the engine's pbr family with
  the look's patches. Pond keeps its old baseline for the firefly noise.
