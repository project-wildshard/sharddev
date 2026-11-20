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

MZ15, the Old Quarry (`generators/quarry.ts`): Gritmaw, a smaller sandstone cut of the Warden's golem body, stands on the
pit's floor as the Hollow's second elite, with its own decision script (`behaviour/gritmaw.as`): each beat its ring of grit
rises (a shared field and a panel), it strikes, and the ring falls. It never turns, so its slam lands in front (up the haul
path, where a walker arrives) and its quake all round. Four grey blobs keep a camp on the west floor. The Spoil Cut
(`ground.ts` `CUT`), a 5.5 m trench, crosses the haul path, which spans it on a timber bridge. A collider keeps only a yaw:
any tilt turns into its world bounding box, which made the first sloped deck and its rails one block the walker could not
climb. The deck is drawn sloped and its collider is twelve level steps of under 0.2 m.

MZ16, Lookout Ridge and the roads (`generators/ridge.ts`, `generators/places.ts`): on the ridge's level top, 15 m up, the
Lookout: a dry-stone dais with steps up its east face, a parapet, a turf watch roof and an unlit beacon stack, and by the
steps a view stone that reads as a talk naming what you see. Cairns mark the climb; wind-bent pines and boulders stand on
the slopes. All twelve places are region triggers raising `mossgate.place.<id>` (`places.ts` raises the yard's two and the
Downs' two until MZ17 gives the Downs a file), and every road has a fingerpost at each end, its arm painted with the name
of the place at the far end (one atlas texture; the canvas font gained an apostrophe). The format has no named place, and
a new field would wait on ONE-FORMAT's pin, so the places reach the full map as the markers of one untracked quest, "The
lay of the Hollow", which pays when all twelve are found. Engine `30eab98a8` makes an untracked quest pin nothing in the
view (its markers stay on the map); until that engine reaches a page, its twelve pins show there.

MZ17, the Barrow Downs (`generators/downs.ts`): the barrow ring, the Warden's arena, left the yard (it stood just past the
east gap at (25.5, -2)) for the Downs' level crown at (160, 45), about 4 m up, off the east entry road it would have
blocked. `world.ts`'s arena takes its heights over that ground (`arenaBase`), the rim braziers and the relit trail follow
it (the trail now runs back along the Downs road, a stone every 5 m), and every road to the ring meets 10 m west of its
arch, between six pairs of standing stones. Four burial mounds with stone doorways stand round it and the Old Cairn on the
far rise; the ring and the cairn are region triggers. Fingerposts that land on one spot share a post, an arm per name. A
probe found the Warden's strikes land on no one, here or in the yard before the move (2.6 m from it, hp 100 for 15 s
while its tell and core cycle): left for MZ20, the real boss.

MZ18 and MZ19 (code in; the row's walk proof is still owed): the Lamplighter's chain now sends you through the old rite. The Pond Hermit gives it; you read it at the Standing Stones, carry it to the Sunken Shrine, light a new beacon on the Lookout, then hear the last of it from the Quarrymaster, the Hollow's third talker, at the Old Quarry. Then the Warden, and back to the Lamplighter. Each rite trigger rises only after the one before it. Every camp got a small side quest and a ledger row. The headless walk of the whole chain still stops at its first talk: the box-name check fails on two equal-looking names ("The Lamplighter").
