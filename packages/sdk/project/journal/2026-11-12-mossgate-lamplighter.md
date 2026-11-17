# Mossgate Hollow v3: the Lamplighter's quest (MH-5)

> Written by: Claude (opus-mh5b), 2026-11-12 ~02:45 Cancún

Meta TEMPLATE-E2E-PLAN row MH-5, on engine TE-ENG3 (`5fe14d9a`,
`targets.talks`). Rows only; no engine change.

- **Pins:** engine `d1d7374` to `5fe14d9a`, format `f32eae4` to
  `d6980ad` (engine's own format pin, so repo-kit's `local-sdk-pin`
  holds).
- **The Lamplighter** is a `targets.talks` row at `layout.LAMPLIGHTER`
  (2.6, -2.2), feet on the ground (`terrain.sites.lamplighter`), east of
  the spawn-to-hut slabs. No `figure`, so the engine draws its stand-in.
  `foliage.test.ts` keeps it 1.5 m off every proof walk and use point,
  1 m off every tree and dressing collider, and the walk to it clear.
- **"Relight the Hollow"** (`data/quests.json`): the offer's accept sets
  `template.lamp.accepted`, which starts the quest. Steps A, B and C are
  script triggers on `template.brazier-{a,b,c}.lit`, gated on the accept
  (a brazier lit before it still counts once accepted). The Warden step
  reads the engine's `dead:barrow-warden` flag (declared in `flags`, so
  it reads through for every player), not a death trigger: the tag
  `creature.greyBlob` matches the yard blob too. The report choice waits
  on all four and sets `template.lamp.reported`. It pays 25 coins and
  files fact `template.lamplighter` (`data/ledger.json`, an achievement).

## Proved

Headless engine preview (Chromium, mock keychain), Template packed from
`out/_template`: talk, accept, light A, B and C, beat the Warden with the
iron sword in its core windows (two windows, about 10 s), report. Quest
done in 27 s from the offer, 25 coins, no console errors. A reload (one
autosave beat later) has A, B and C lit, the quest done, 25 coins, and
the Lamplighter with nothing more to ask. Script and shots in meta's
`template-e2e-v3/progress/mh5/`, board `progress/t1-09-quest.jpg`.

Seen, not this row's: the page autosaves every 5 s, so a reload within a
beat of the end can lose it; and after a reload the "Quest complete"
banner shows again (no second payment). The sword misses from 2.4 m off
the Warden's centre and lands from 1.6 to 2.0 m.
