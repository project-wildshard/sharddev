# Panel parts: one draw a material, refused past 18 MB

AP16's review left two SHOULDs on panel parts (`scene/shardfile.ts`). A panel is one library GLB, but its merges came
from the tile split, so a material whose triangles crossed a tile edge became one primitive per tile, one draw each. The
panel now joins a material's merges across tiles before it writes primitives: one draw a material.

A tile's GLB is batched into several files at 18 MB, but a panel row names one file (format props `panels[].file`), so a
panel had no batch to fall back on and a big one would only fail at admission (25 MB GLB cap). It is now refused at
compile time by part name, with a fix line.
