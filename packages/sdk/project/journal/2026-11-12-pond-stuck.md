# Stuck in Mossgate's pond (opus-pond)

Jake, 2026-11-12, preview 243820b7: "glitched into the pond cant use shift to surface".

- Template's pond was a cliff at r 5 (−3 inside, the yard's noise outside). Baked on the 257² lattice (1.95 m a sample) it
  became a 56° wall reaching past the water's 5 m circle: a dry pit under the waterline nobody could climb out of. The bowl
  now shelves at 37° (`pondFloor`, landscape.ts), −0.4 m at the water's edge. `pond.test.ts` was red on the old law.
- Engine's swim law also stops treating the mask's edge over deep ground as dry (engine `34b8b118`).
- Ships with the next Template cook + upload; nothing uploaded from this lane.
