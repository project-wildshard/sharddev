# Mossgate ground across the cell

> Written by: Claude (opus-mossgate-m2), 2026-11-19

Meta MOSSGATE-ZONE MZ10. Mossgate's ground used to be the cleanroom's: a flat yard, a ring of noise from 48 to 195 m and a
flat rim, with 110 grey dev-district boxes standing in the haze. Now each region of the MZ9 cell map (`layout.ts`) has its
own relief in `generators/ground.ts`, and the boxes are gone so the regions (MZ11 onward) fill that ground. The yard floor,
the cell edges and the last 60 m of each entry road stay at 0: the grid's seams and the cook's 50 m entry walks need flat
road. The quarry pit moved to (45, 200) because the south entry road ran through it.

MZ12, Mossling Meadow: the region's first content, in its own file (`generators/meadow.ts`). The den pack moved from
(36, -98) to the den at (-20, -150), a second pack ranges at the Standing Stones, the den and the stones are region
triggers, and the hoard behind the den's mound is the meadow's find, paying a small side quest. A walk proof on a dev page
(meta `project/evidence/mossgate-zone/mz12-meadow.walk.mjs`) walks there from the spawn and is bitten by the pack.
`fight` in a walk proof could not do it: it fights a species kind until none is left anywhere, and the mossling's kind is
the grey blob's.

MZ13, Greyback's Thicket (`generators/thicket.ts`): Greyback's camp moved from beside the yard (22, -22) to the clearing at
(140, -140), with three sows round its rim and two more in the Sow Wallow; 150 low-poly trees with trunk colliders fill
the region clear of the places and roads, and a lore sign at the clearing's edge reads as a talk. A walk proof shows the
camp engage on approach: a sow's ram (12) and Greyback's charge (25) land within seconds of the clearing.

MZ14, the Bog (`generators/bog.ts`): Wisp Mere's dark water with reeds and drowned trees, three wisps of a new species
(`mere.wisp`: a species' temperament names one brain, so the mere's orbit needs its own) circling it, and the Sunken
Shrine with a drowned chest. The chest is shared like the yard's, so its quest pays each player who stands at it once it
is open. The bog's floor came up about a metre: with the mere's water near y -2.8 the wisps never got down to a walker
(they hold about 0.5 to 1 m and never climbed back to their orbit), and at the pond's level they dive and hit.
