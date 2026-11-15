# Mossgate content (meta TEMPLATE-E2E TC-M, J357, J361)

> Written by: Claude (opus-brassgun2), 2026-11-15

Jake ordered both templates filled with content to Signal Dunes' and Sky Reach's level (J357), Mossgate after Brasscap's
gun loop, one named file per system (J361). This journal follows the TC-M rows on `plan/tc-m`.

## TC-M1: the blob strikes, and a mossling pack

- The grey blob carries `template.blob.bump` (8 damage); it had no strike.
- Mosslings: a new hostile species on the grey blob's skin (24 hp, scale 0.5 to 0.6, a 6-damage bite as `chargeDamage`).
  `data/skins.json` gives it the blob's skin with no files of its own; `generators/product.ts` names each skin once in
  the library.
- A pack of 4 (`creatures.groups`, `kind: pack`, the data host's pack recipe) holds a training ground north-east of the
  hut at (6, -30): they shadow at 10 to 15 m, circle at 4 to 7 m, then dash in to bite.
- Greyback stays the elite encounter: an encounter's entity is driven by the engine's elite controller, not a brain row.
- Built locally (`wildshard build`, 14 s): `wildshard content` (sharddev `plan/template-e2e`) reads 4 hostile species,
  7 bodies, 1 group, 3 creature strikes. The `--bar templates` flag is refused by the CLI's argument parser there.

## TC-M2a: enemies to the bar (respawn waits on engine TC-E2)

- Three more grey blobs in the hollow (pursue; two bump, one lane strike). Two sows by the pond graze and ram
  (`ram-grazer`, a 5 m lane charge at 7 m/s, 12 damage, the boar's skin). Two bog wisps circle over the pond and dive
  (`orbit-diver` at 5 m, a 1.6 m sphere, 8 damage; the blob's skin, flying).
- Built: 5 hostile species, 14 bodies, 3 brain kinds (`pursue`, `ram-grazer`, `orbit-diver`), 1 pack.
- A data shard's `creatures.spawns` never respawn yet: meta TC-E2.

## TC-M3: the Warden at the bar

- `behaviour/boss.as` turns slam, sweep (a 6.6 m arc at its scale 3) and, from the second phase, a thrown stone (an 18 m
  wedge); each is told by the ground ring and opens the core after, as the slam did. The strike key is `stone`, not
  `throw`: a reserved word fails the script row's semantic rules.
- A grid data cell's ledger hears only `quest.complete`, so the boss achievement is an untracked quest done on
  `dead:barrow-warden` (10 coins, fact `template.warden`, achievement "Barrow Warden").
- `generators/warden.test.ts` checks the three strike ids, their rows and the achievement; the build reads 3 boss strikes
  and 3 achievements.

- TC-M5a: an old chest by the sign at the fork (layout CHEST). Its prompt runs item scene `template.chest.open` (lantern refill, action 4, per player); a region trigger pays 10 coins once through untracked quest `template.chest`, ledger fact `template.chest` ("Finders keepers"). A sign talk was tried and dropped: a talk figure must name a props panel or model, and the sign is dressing.
- TC-M6 (opus-brassgun3): the Pond Hermit on the pond's north bank, one file per NPC (`data/npcs/hermit.json`, J361;
  `product.ts` merges its dialogue and talk). His talk starts `template.hermit`: drive off the mossling pack (a 0 to 4 count
  over `dead:mossling:1..4`, a marker on the bank and a hint), then report back for 15 coins and fact `template.hermit`.
  His lines follow it: the offer, the waiting line, his thanks. The build's quest graph check passes; the hero gate waits on TC-M8.
- TC-M7a (opus-brassgun3): the three quests chain. The Lamplighter's offer waits on the first adventure
  (`template.complete`), the hermit's on the Lamplighter's (`template.lamp.done`); each says so in a line. Every step of
  the first adventure and the Lamplighter's quest now has a marker and a hint (the first adventure is tracked now, so its
  markers show), and the manifest and card list 11 POIs (the old chest and the hermit join). The ~400 m route (J361) is
  TC-M7b: it needs the hollow to grow, not rows.
