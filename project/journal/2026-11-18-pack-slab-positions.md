# Cook slab positions on their draw grid

> Written by: Codex
>
> **State:** qualified locally, 2026-11-18. ENGINE-MEMORY EM28 and ONE-FORMAT OF-EM28b2/b4.

The slab cook now writes Int16 positions on the same grid the engine uses.
Chunks under one draw key share a grid, so the reader can merge compatible
chunks. A key spanning more than the coarsest grid keeps its Float32 positions.
The bake includes rounding in its bounds and world-space error and caps every
slab chunk at 65,535 vertices. Native shader channels and triangle order survive.

Both local Nine products used shard source `9b0731d` and engine `28f7e96c`.
The stock cook already includes half-float light spill. Seven slab files went
from 25,622,560 to 19,803,712 bytes, with all 704,230 triangles. The cook's
aligned upload census fell from 77,961,734 to 73,113,424 bytes.

Six alternating cold Phone Low pairs used shared-lock, minimal native WebKit.
Every pair measured 110,671,586 to 110,253,842 WebGL buffer bytes at control [L].
The old reader already gridded float positions on upload. The live buffer cut
comes primarily from the 16-bit index cap. The EM11 playing upper fell from
1,053.10 to 1,043.80 MB and the loading upper from 1,591.95 to 1,548.97 MB.
All candidate readings passed Nine's published native ledger guard.
The nine-view Phone Low board preserved draw and triangle counts at each camera.

The MacBook release cook and engine pin will measure these savings again on
the published product. This writer change introduces no new product schema.
