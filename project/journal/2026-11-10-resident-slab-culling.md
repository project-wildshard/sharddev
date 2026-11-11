# Split a resident cell's slabs on the ground (NB9)

Meta NINE-DRAGON-BENCHMAX NB9. Nine Dragon is the only `ring: 'cell'`
product, and its resident bake packed every slab key in source order
across the whole fragment: 49 chunks whose bounding radius reached
190 m. At the spawn view only 0.20 M of `nine-architecture-plain`'s
0.52 M submitted triangles were in the frustum, and no distance cut
could drop a chunk that spans the fragment.

`residentGroups` now k-d splits a resident key at the centroid median
along the longer ground axis while a group spans more than 62.5 m and
holds more than 256 KB; past the 4 MB cap it splits on the longest
axis, height included. Each group keeps source order; the old byte
flush follows. This reverses G872's "no quadrant or height cuts in a
resident cell", which was about draws: NB9 trades stored chunks for
culled ones, and the engine's phone-tier reach drops the far ones.

Nine's real build: 49 chunks in 1 bank become 119 in 20, every source
triangle kept (the bake's own ordinal and total checks). More than 64
chunks don't fit one format tile entry, so a resident cell past 64
banks each chunk under the fine tile its world box centre stands on;
Nine's generator already gives every bank the full `covers`, and the
engine's SlabLibrary loads several banks per library. Ring products
are unchanged. Codex J206: no MUST-FIX; its SHOULD for an end-to-end
>64-chunk fixture needs ~10 MB of native geometry, so the real Nine
build is that proof and `residentBanks` has a unit test.
