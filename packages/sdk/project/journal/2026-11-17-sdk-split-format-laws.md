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

SP6c: `placeholderGeometry.ts` with the `farProxy.ts` builder it wraps, and `terrainGeometry.ts`
(`terrainChunkGeometry`, `canopyChannel`), are byte copies of the engine's; their constants come from format's
`contentBounds` (the engine's drawn grid radius is format's `GRID_RADIUS`) and `TERRAIN_RES` is pinned to the engine's
by `placeholder-geometry-port.test.ts`, which also checks both builders give the engine's bytes. `splatGround` keeps one
engine read, `filePolicy` over the engine's own texture table; that is engine boot data and leaves with SP7.

SP7a to SP7c: the build, check and watch phase timers are the sdk's own `diagnosticNow`; the engine music line (AU18)
moved from `buildProject` to check's validate step; and `wildshard build` and `wildshard validate` no longer run the
headless simulation (`admitBuild`, `validateSimulation`). Validate keeps the static half of the performance report and
says check runs the rest; `wildshard check` runs the engine's own full check, the cook's, which re-measures script CPU on
this host (G491). `cli-output.test.ts` proves no simulation starts for build or validate and that check refuses a fresh
over-budget measurement despite a stale receipt.
