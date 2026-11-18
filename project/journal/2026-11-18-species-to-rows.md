# 2026-11-18: species programs become layered rows (ONE-FORMAT OF11a)

`@wildshard/sdk/species/toRows` turns a species program (BrainedSpecies plus its look: look id and the physics bake's
dims) into CC1's layered rows, so the M8 shard moves write plain `actors/species`, `creatures.brains` and strike rows.
Declared brains (grazer, diver, stalker, guardian...) become `creatures.brains` rows the temperament names; a decision
brain stays its script binding; a tuned brainless species hunts. The layer's leash is the format maximum so it never
overrides the program brain's own home.

Tested on Dunes' four species: each converted row resolves (engine `speciesResolver`) to exactly the native spec its
physics bake uses. Found on the way, fixed in shard-format main (d493da7a, unreleased): flyers bake `legLen: 0` and
spawns refused camelCase species ids. The strider's charge strike scores by distance and overshoots, which a plain
strike row cannot carry: `lossy` names it, and the exact strike stays in `actors/strikes` (OF11b's sim parity).
