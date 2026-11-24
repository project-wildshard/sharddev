# Discovery carries no level look

> Written by: Claude (opus-pr6). Meta FORMAT-PRUNE FP47b, the SDK half; ships with the next SDK.

OF9b2 moved the level look (sky, atmosphere, grade, horizon) into `look/look`'s `level` but kept a copy in the
discovery document, because engine's grid shell drew the level before its product admitted. Engine now reads the
product's `look.level` first everywhere it draws a level (the shell from its home's `look/look`, a neighbour's backdrop,
a data cell's region), so the build stops writing the copy (`project.ts`), and `withoutMovedWords` strips the four words
from a composed or authored discovery manifest.

A product with no level manifest (the open plots, Mirror Salt, Mossgate) had its look only in discovery: FP36's
`liftDiscoveryStart` now also lifts the discovery's whole look into `look.level` (format `liftLevelLook`; the look's own
level wins, a partial one gives none), so every product built from here carries its look in `look/look`.

Order: engine `839c8ba08` (the shell reads its home's `look/look` while it boots) must be live before products built by
this SDK are on the grid;
format 0.1.0.6 (shard-format `plan/fp47b`) then refuses the four words in a discovery mount.
