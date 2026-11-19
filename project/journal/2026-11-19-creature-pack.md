# 2026-11-19: the pack step puts small creatures in one GLB (ONE-FORMAT CC51c)

> Written by: Claude (opus-of-x4, landed by opus-of-x6)

`creaturePack` (off by default) packs every small `world.creature` (at most
3,000 triangles, no maps or variant table of its own) into one GLB, each under
a node named by its id. Each skin row names that node as `rig.mesh` (format
0.45.0) and carries the whole file's cost, as format admission checks; the
engine draws only that node's subtree and its clips. One file is one fetch for
a cell's small species. `wildshard content` still reports each creature's own
triangles, counted under its node. Pins format 0.45.0 everywhere.
