# Mossgate respawns and the content bar (TEMPLATE-E2E TC-M2b, TC-M7a)

> Written by: Claude (opus-brassgun5)

J361: Mossgate's enemies come back. The mossling pack respawns 45 s after a death and the grey blobs 60 s after, by the
`respawn` field on their spawn rows (shard-format 0.5.8); engine TC-E2 revives the body at its spawn. The sows, the
wisps, the Greyback and the Warden stay dead.

`wildshard content --bar templates` read Mossgate and Brasscap short on NPCs, pickups and creature strikes because it only
counted quest-host NPCs, `items.pickups`, and spawn-row strikes. A talk is an NPC, a prompt whose scene hands over or
refills an item (the rack's sword, the chest's oil) is a placed pickup, and a brain's own strike (the sow's ram, the
wisp's dive) counts for its species. Both templates now fall short only on movers, which wait on engine TC-E5b.

The counter change is its own commit: `src/cli/content.ts` with a case in `src/cli/content.test.ts`.

## TC-M7b: the route grows

J361 asked for about 400 m of route. The mossling pack (the Pond Hermit's quest) leaves the bank south of the yard for a
meadow past the south loop road, `layout.MEADOW` (36, -98), with a map POI; its spawns keep their offsets round the new
group home and the quest marker follows. In chain order (rack, hut, blob, the Lamplighter's braziers and the Warden, then
the hermit and the pack and back) the stations are 412 m apart in straight lines, before the yard and pond-garden walls
add their detours (`generators/route.test.ts`). The sword rack, inside 25 m of spawn since TC-M5b, gets the POI the yard
test asks for.

## TC-M4a: a lever and a second gate

Mossgate's lever (J361's "a lever that opens a second door") stands just inside the yard's south wall, `layout.LEVER`
(8.5, -16.6). Its prompt's scene (event 205) reaches `behaviour/door.as`, which flips shared field 105
(`template.south-gate.open`); a plank gate in a new gap of the south wall is a panel with a collider that stand while the
field is 0, so the lever opens the short way out to the south road and the mossling meadow. The field is declared in id
order (after 104) because the script reads shared fields by place. An engine-side run on the built product pulled the
lever twice (gate 0, 1, 0) and the hut door still toggled on its own. The lift and its ledge wait on engine TC-E5b.
