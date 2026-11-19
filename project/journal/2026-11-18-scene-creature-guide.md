# 2026-11-18: a scene shard's creature, from rows to a kill (meta ONE-FORMAT OF-NE20)

- NEW-SHARD-E2E F20: adding creatures to a scene shard had no documented path; the tester copied rows from the reference
  through `extend`. GUIDE section 2b now walks Jackal Den: `world.creature` (body, skin, species and look rows),
  its bite, two `world.spawnAt`s, and a walk proof that fights both and reads the kill count. The example is a file
  (`guide/scene-creature.example.ts`) that `guide-scene-creature.test.ts` builds and finds verbatim in the GUIDE.
- Writing it found two real gaps. A species' abilities name strikes, but the scene build parses its rows before
  `extend` runs, so no scene creature could have an ability: `world.creature` now takes `strikes` and writes them
  (one row per id across creatures). And `creatureGlb` wrote each mesh as its own skinned mesh node, which skin
  admission refuses ("expected one skinned mesh"), so only one-mesh bodies passed `check`: it now writes one skinned
  mesh, a primitive per material (meshes sharing a material merge), at most 8.
