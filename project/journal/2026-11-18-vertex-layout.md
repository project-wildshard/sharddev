# The vertex layout check (MEMORY-STRUCTURE STR17)

> Written by: Claude (lane mini-memstruct-m2)
>
> **State** · in `wildshard check` on plan/memstruct-m2, 2026-11-18.

WebKit draws WebGL through ANGLE's Metal back end. Metal reads a
vertex attribute in place only when its stride is a multiple of 4, so
ANGLE converts a tightly packed 3-byte channel (an Int8 normal, a
Uint8 colour) or a 6-byte one into a second buffer in the GPU process.
The phone then holds that channel twice.

`staticGlb` writes exactly those layouts when `quantizedChannels` is
on and `meshoptReady` is off. Engine's census of every pin (STR11,
meta `docs/plans/engine-memory/vertex-census-2026-11-18.md`) found
them in two zones: Nine's slabs (Int8 normal and Uint8 colour, 1.13 M
vertices) and Driftwood (Int8 normal, 0.77 M vertices; Uint16 colour
at stride 6, 1.01 M). Every other pin is aligned.

`vertexLayout.ts` reads the built GLBs' JSON (no binary decode),
reports the copied channels on the check's report card and refuses a
copied layout the cook did not already write. The three existing
layouts (packed Int8 normal, Uint8 colour, Uint16 colour) report until
STR16 packs them; any other, such as a stride-6 Int16 position,
refuses. A per-shard allowance was the first try, but sdk lint keeps
shard slugs out of sdk code (no-shard-branch), and the row asks for
new layouts, not new zones, to refuse.
The same reader counts static triangles and vertices, which STR13
puts against the phone budget.

## The phone triangle budget (STR13)

The same reader counts every built GLB's static triangles, each
geometry once, and the report card prints them against 600 k. STR12's
probe set that number: halving Nine's slabs took 616 k resident
triangles off and gave back 50 MB [K] settled, yet the triangles drawn
per frame fell only 78 k. The phone pays for what it holds, so the
budget counts held triangles, not a frame's. 600 k is about 50 MB [K]
at today's layouts and, at the worst view's draw ratio (43% on Nine),
about 260 k on screen, the study's phone-Low frame. Over it the check
warns and the upload still takes it (J424). Pine (1.83 M), Nine
(1.35 M) and Driftwood (1.34 M) are over; the open plots sit at
0.14 to 0.64 M.
