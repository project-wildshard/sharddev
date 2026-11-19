# defineShard takes moves and spots (2026-11-19)

> Written by: Claude (opus-of-cc2)

Meta ONE-FORMAT CC26: Brasscap's Dust Wyrm burrows, relocates under the player, surfaces and leaps onto its mound. Its
decision script needs `actors/moves` and a `world/targets` spot beside `sim/scripts`. TR-12b gave `defineShard` the
`decisions` option; `moves` and `spots` now ride the same options and the same emit, so the Wyrm needs no hand-written
`emitPlatformSections` call (no second way). Test first in `scene/decisions.test.ts`.
