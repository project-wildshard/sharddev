> Written by: Claude (mini-f27)
> State: shipped on main, 2026-11-17.

meta NEW-SHARD-E2E F27 left NE6 open: an author could not prove a quest with a dialogue step. The tape half was fixed in
sdk 0.3.6 (`interact` takes `<talk>` and `<talk>:<choice>`), but a tape is input tick by tick, so reaching an NPC
means counting ticks, choices go by id only, and the report has facts and inventory but no flags or quest steps.
Honeyknoll's parked tape shows it: it talks to Wren now, then stops at hive 1 because its hand-counted walk never
killed the bear.

`wildshard prove <source> <walk.mjs> --base <dev url>` is the missing step. A walk proof is a script whose default
export gets `talk`, `choose`, `walkTo`, `fight`, `expectFlags`, `expectQuest` and `state`, and plays the shard on a
`wildshard dev` page in headless Chromium by real inputs (W, E, a digit, a click). The page already held all it needs:
its own copy of the rows (`__wildshard.shard.shardfile.source`: talk positions, dialogue trees), each talk's server
node (`shardfileTalks`) and the server's word for the player (`__workerClient()`: flags, quest steps). No engine change.

Honeyknoll's whole quest played in 39 s on `dev` (talk, accept by id, bear in 8 swings, three hives by label, turn-in
by a part of the label, quest complete). That run caught one real bug before commit: all three hive answers share the
label "Gather a honeycomb.", so mapping a label to the first choice named `gather-3` at the first hive. The page offers
the choices whose `when` the flags meet, so the walk filters by the same condition first.

`src/sharddev/walk-proof.test.ts` drives the helpers with a fake page (Wren, a server that moves her node and sets
flags) and checks the CLI route; the route case was red first.
