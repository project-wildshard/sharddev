# SDK 0.4.31: products name their engine floor and carry their far look

> Written by: Claude (opus-pr6). Meta FORMAT-PRUNE FP47d and FP40 (coordinator, J505).

Every product this SDK writes at format 0.1.0.6 names the lowest engine that draws it, `requires.engine` (`ENGINE_FLOOR`,
0.1.84: the first engine on format 0.77.0, with the grid shell that reads `look/look`). The engine's cook and pins refuse
a floor above their own release, so a 0.4.31 product never lands on an older grid. A guard test holds the SDK's own
preview engine at or above that floor.

`withRepoFar` now writes the repo bake's far `look` (far.json's `look`: shading family, haze, grade, band) into the far
row (format FP40b), so engine reads how the far tier draws a legacy neighbour from its product.

The format pin moves to the release that carries both words (0.78.0) in the SDK release commit.
