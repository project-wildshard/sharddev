# 2026-11-18: the Template on scene source (meta SHARD-SOURCE AP36a)

- `_template` was the last first-party shard on the props bake: `buildTemplateWorld` and `buildCellFill` handed 22
  pieces to `templatePropsSource.ts`, which merged them into one `measure` surface and hand-listed coarse and far skips.
  `generators/scene.ts` now hands the same pieces to `world.part` (kebab names; the switchable ones keep their panel
  ids), and `generators/generate.ts` runs the scene with `templateRows` as its extend.
- The look had to survive: the bake wrote every static mesh white with its colour in the vertices, drawn by look entry
  `pbr` (procedural moss, grain and mottle). `LookMaterial` (sdk) lets a scene mesh name that entry whole; `intoLook`
  bakes each mesh's colour into its vertex colours as the bake did, so the stone is one entry and one draw a tile.
  Flames, lamp glass, caps and the tell use their emissive entries the same way.
- Colliders stay the authored rows (`templateColliders`), so surfaces and the ramp's treads are unchanged; a section
  diff against the bake build: every gameplay section, collision, terrain, edge, spawn and water are identical. The
  download fell from 14.3 MB to 10.2 MB. The hero was recaptured; beside rev 7 it is the same frame.
- The old bake modules (`terrain.ts`, `props.ts`, `templatePropsSource.ts`, `templateProduct`) stay for the test
  fixtures until AP36c's line bar removes them.
