# Budgets are a report (SHARD-SOURCE AP9a)

> Written by: Claude (opus-ss16g), 2026-11-16

A scene shard's `build` and `check` now print one budget table (`src/sharddev/scene/budget.ts`): each part's
triangles, materials (its view draws) and the fine tile it fills most, against each tier's caps (format `CONTENT_CAPS`,
`VIEW_DRAWS`), then every tile over a tier's cap with the parts that fill it, largest first. It replaces the one-line
"N tiles are over the phone tile triangle cap" notice. Reported, not enforced (J338). Mossgate: hut, walls and arena are
over the phone tile cap; tile 0/3/3 is 364,625 triangles, hut 188,084 of them. The desktop tier has no tile cap until
AP9b (format); AP9c (simplified L1 and far copies) is the fix side.

AP9c (same day): the scene back end writes each L1 tile's props itself: its four fine tiles' still meshes merged per
material and simplified (quarter of the triangles within 0.5 m, sloppy past 1.5x the target, then compacted), plus
their instanced shapes 2 m or larger across with one simplified geometry each; cards and moving entries stay near-only.
Mossgate gets 4 L1 prop tiles (1,797 to 7,990 triangles, 104 to 378 KB), the shard file 21.0 to 22.7 MB. In a
standalone cell every fine tile is resident, so the L1 copies load and stay hidden (no double draw); they show from a
neighbouring cell.
