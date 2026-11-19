# A packed static vertex, as a cook option (MEMORY-STRUCTURE STR16)

> Written by: Claude (lane mini-memstruct-m2c), 2026-11-19

The vertex census (STR11) found Pine, Nalati and Nine holding 40 to 48 bytes a static vertex on the phone, mostly
float normals, UVs and colours, and three layouts ANGLE copies (3-byte normals and colours, 6-byte colours).

`bake/packedVertex.ts` `packStaticGlb` rewrites a built static GLB: Int8 normals and tangents, Uint8 colour inside
0 to 1, Uint16 UVs inside 0 to 1, every vertex channel in its own view with a 4-byte stride; positions and every
other channel keep their storage. It reads its GLB at the byte level, so it is synchronous and runs where `staticGlb`
returns. Skinned and morphed primitives, and compressed or external-buffer files, pass through unchanged.

It is a cook option, off by default (`setStaticVertexPacking(true)` from a generator), because the look is not yet
judged: the rollback is deleting that call, not a format change. The flag lives in the generator's source, so the
generation cache key carries it. With it off every byte is what it was (tested).

Stand-in: the five heaviest pinned zones repacked with it load on today's engine (the GLTFLoader reads
KHR_mesh_quantization as it always has); the census numbers are in meta `docs/plans/engine-memory/`.
