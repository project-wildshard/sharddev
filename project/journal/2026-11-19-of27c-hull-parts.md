# OF27c: a hull look's rigid parts (opus-of-close)

- `bake/hullLook.ts`: a look variant may carry `parts` (a node of a parts GLB with `_BONE` and `_GLOW`, the hull
  book's `RiggedHullUrls.parts`, Pine's `thrall-extras.glb`). The build adds them to the rig as two primitives rigid on
  their bone (`parts`, `parts.glow`), gives the hull a white colour channel, maps both through the skin binding's
  `materials` (TE-ENG10) and returns look materials: their own vertex colour under the hull's fur sheen and rim, and the
  overgrown glow (linear 0.45, 0.95, 1.1 x 2.6) on the glowing half. No format change was needed.
- A variant table shares one material contract, so parts go on every variant of a look or none: Pine's thralls become
  their own species (with ONE-FORMAT OF23).
- `scene/shardfile.ts` writes a creature's `materials` into `look.materials`.
- Fixtures: Pine's boar phone rig and `thrall-extras.phone.glb` (shard-pine-hollow 1c829c0).
