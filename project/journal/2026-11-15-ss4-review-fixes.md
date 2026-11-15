# SHARD-SOURCE stage 4: the review's open findings (opus-ss4d)

- One colour space: a scene's colours are linear (as three holds them);
  the format's material `colour`, `emissive` and moss are sRGB and the
  engine reads them so. `materialEntry` wrote pbr `colour` linear, so
  every tinted surface drew darker and more saturated. Now `srgb01`.
- Mossgate's flat ground was mostly the terrain family: `bakeTerrain`
  defaulted to `toon`, a two-band ramp under a lit PBR scene. The
  compiler now writes `scene.ground`, a PBR entry from
  `world.ground(h, { colourAt, material, detail })`; Mossgate passes the
  cleanroom's roughness 0.97 and its moss map's grain as a detail layer.
- Node materials kept `map` out of their graph: with no colorNode the
  colour is now `meshMap.rgb * colour` (alpha `meshMap.a * opacity` when
  cut or blended), and a graph that doesn't read the mesh map gets no
  `colour` binding (the shardfile's prop rules refused one).
- A graph material on a Sprite or Points, or under a declared sway or
  uvScroll, lost its card or motion silently: now a refusal by path,
  with the fix (a SpriteMaterial / PointsMaterial, or the graph's own
  `vertex.offset`).
