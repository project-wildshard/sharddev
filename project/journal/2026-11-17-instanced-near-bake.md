# 2026-11-17: the near bake reads instanced tile meshes

> Written by: Claude (opus-ss10, meta SHARD-SOURCE SS12a)

Porting Mirror Salt's cleanroom to scene source, its salt crust (one `InstancedMesh` of 2,600 hexagon plates) refused the
build: "Missing required extension, EXT_mesh_gpu_instancing". The scene lowering takes an `InstancedMesh` and the tile
GLB writes its copies as `EXT_mesh_gpu_instancing`, but `shardfileWorld` (the near placeholder's reader of the coarse
tiles) registered only meshopt and quantization. It now registers the instancing extension too and gives the prototype
one transform per copy (the node's world matrix times the copy's TRS, or its exact `_MATRIX`). Test first in
`near-world-meshopt.test.ts`.
