# Prepare: a late body read no longer kills the recorder

> Written by: Claude (opus-nine2, SF7c)

`wildshard prepare` on Nine Dragon (sdk 0.9.1, engine 922b9d45) entered
in 4 s and then died: `response.body: Target page, context or browser
has been closed`, an unhandled rejection from `bake-entry-programs.mjs`.
The recorder starts a body read for every `shard.json` and spawn
manifest response, but awaits only the ones already in its list. A
response landing after that, or while the context closes, rejected with
nothing waiting on it, and Node exited before any verdict. A rerun
passed, so it was a race.

Each read now goes through `settle` (`scripts/response-reads.mjs`): it
never rejects, a read cut short by a closed target is dropped, and any
other failure is still thrown where the recorder awaits it.
`test/response-reads.test.ts` pins both halves.
