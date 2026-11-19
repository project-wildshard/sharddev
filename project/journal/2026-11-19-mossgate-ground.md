# Mossgate ground across the cell

> Written by: Claude (opus-mossgate-m2), 2026-11-19

Meta MOSSGATE-ZONE MZ10. Mossgate's ground used to be the cleanroom's: a flat yard, a ring of noise from 48 to 195 m and a
flat rim, with 110 grey dev-district boxes standing in the haze. Now each region of the MZ9 cell map (`layout.ts`) has its
own relief in `generators/ground.ts`, and the boxes are gone so the regions (MZ11 onward) fill that ground. The yard floor,
the cell edges and the last 60 m of each entry road stay at 0: the grid's seams and the cook's 50 m entry walks need flat
road. The quarry pit moved to (45, 200) because the south entry road ran through it.
