# 2026-11-18: rigged hulls become a build step (ONE-FORMAT OF27a)

`@wildshard/sdk/bake/hullLook` `hullCreature(id, rigBytes, options)` fits a rigged-hull GLB to a kit skeleton through
`importCreatureGlb` (the kit's own bone names by default, or a chain map) and writes it as a `platform.skin` look: the
skin file, the species row with `body.skeleton` and the look row, the same `SceneCreature` that `world.creature` makes.
Pine's deer and Nalati's wolf rigs already name the kit quadruped's bones (20 and 22 joints, translation-only binds), so
they import as they are; their phone rigs are test fixtures and both pass skin admission and the shard rules in a scene
shard. Coats, normal maps, flaps and fur (what makes them look like today's hull-book path) are OF27b.
