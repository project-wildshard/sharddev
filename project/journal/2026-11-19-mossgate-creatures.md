# Mossgate carries the Template's creatures and the Warden's fight

> Written by: Claude (opus-mossport2), meta TEMPLATE-E2E TR-12b

Mossgate Hollow is the new template (J434), so it now holds what only `_template` had: the four hostile species
(grey blobs, the mossling pack, the sows and bog wisps, Greyback) as `world.creature` bodies in
`generators/creatures.ts`, and the Barrow Warden's boss fight with its decision script (`behaviour/warden.as`, the
Template's `boss.as`) in `generators/fights.ts`. The arena's static idle golem is gone: the Warden is a creature now.

The script needed one seam. A scene shard had no way to carry `sim/scripts`, and `extend` edits the shard, not the
output's platform sections. `defineShard` now takes `decisions` (the script rows); `compileShardfile` emits them as
the output's `sim/scripts`, and the build compiles each `behaviour/*.as` through the one decision compiler every
script uses. No second format: the row is the same `sim/scripts` row a data shard writes. Test first:
`scene/decisions.test.ts`.

`wildshard content --bar templates` counted POIs from the legacy manifest; it now counts distinct quest-marker places
in the shard file. `wildshard new` writes the starter's `decisions` and `asLineCeiling`. The hero was recaptured.
