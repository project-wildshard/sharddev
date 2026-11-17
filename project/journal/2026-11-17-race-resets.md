# 2026-11-17 world.race resets (opus-ss10f)

A race's finish lowered only its start and stop flags, so Mirror Salt's
middle gate flags stayed up after a first run and a second run could
skip the arches. Format 0.19.0 gives a race row `resets`, and the engine
lowers them at a finish and a lapse (SHARD-SOURCE SS-MS1c).

`world.race(id, { start, stop, resets })` names them: 1 to 64 flags,
each once, never the race's own start or stop. `withAnchored` declares
any the shard did not. The format pin moves to 0.19.0 (root override,
sdk and upload). `race.test.ts` failed first on the format refusing
the key.
