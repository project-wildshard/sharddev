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
- The other half of "bright": the ambient key was the HemisphereLight's
  intensity x pi, and the engine sets its hemisphere to the key as is
  (`dataLook.ts`), so every scene's fill was three times its cleanroom's.
  Now the light's own number. Board: before, after, cleanroom at spawn,
  pond and arena.

Review round (one `claude -p`, no MUST): the ground material's map,
emissive, transparency or side is refused by path instead of dropped;
`watch` builds a new shell when the ground's surface changes (it is in the
shell key); whether a graph reads the mesh map is read from its nodes, not
from its JSON text.
