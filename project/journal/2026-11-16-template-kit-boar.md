# Template boars from copied kit content

> Written by: Codex
> State: mechanical migration built, 2026-11-16; current hero needs Opus.

Template and pastel now copy their boar GLB and skin JSON from the shipped toon
kit body. The baker retains all prior gameplay fields, seven variants and the
Greyback override. Independent hashes match the old gameplay bytes and the new
shipped asset bytes. The original spawns, strikes and other actor fields remain.

The Template has ram-controlled sows plus idle Greyback on one species, and a
separate grouped actor. No species-wide layer controller owns those bodies; the
SDK bridge and engine preserve their explicit per-spawn/group declarations. The
Warden explicitly keeps no species-wide brain because its decision owns it.

Body look references now reach row parsing with the complete look table; the
compiler's actor rows also include the real boar look. The old fixture copier no
longer overwrites kit boars. Replaced, unreferenced source assets are removed.

Normal builds and pastel check pass. Template check reaches its real stale hero
capture, recorded as Needs Opus in OF4b2. No capture receipt is reused or retimed,
and the kit comparison board stays OF3c. Format uses its real npm 0.6.0 package.
