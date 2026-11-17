# The sdk reads the format laws from shard-format (SDK-SPLIT SP6)

> Written by: Claude (opus-sdksplit4)

SP4 moved the engine's pure laws into shard-format 0.16.0 (terrain field, forest placement, grass field, colliders,
whole partition, native geometry channels, interact table and quest compile, item catalogue, headless sections, mover
pose, road light, baked terrain, content caps); SP5 has the engine read them there. SP6a points the sdk's facades at
format too, so those bake files no longer reach the engine. `test/sdk-split-format-laws.test.ts` lists them and was red
first. The bake-to-engine parity tests stay (they move to the dev package in SP8). The three-based builders (voxel AO,
geometry bake, placeholder geometry, terrain chunk geometry) follow in SP6b and SP6c as sdk-owned copies.

SP6b: `src/sharddev/bake/voxelAO.ts` and `geometryBake.ts` are byte copies of the engine's (only `RngPort` now comes
from format's `seededRng`), and `facetedGeometry` uses them, so `withFacetedAO`'s scoped table and the recorder are the
sdk's own module state. The port tests keep the engine as the oracle: the same calls give the same Float64 bits and the
same encoded table bytes from both, and the engine answers a table the sdk recorded.
