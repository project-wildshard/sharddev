# 2026-11-16: Mossgate's lift and ledge cache

TEMPLATE-E2E TC-M4b (opus-brassgun8). A plank lift in the yard's north-east corner rides up and down all the time beside a
stone ledge; the cache on the ledge pays 15 coins once. The lift is the template's first mover (`generators/lift.ts`), drawn
as its own panel; the ledge is a panel on a never-set field, because tile 0/4/4 had no bake debt room for static bytes and
only two spare draws (both panels are shadowless). The content bar passes now. Riding it in a grid cell needs engine TC-E5b.
