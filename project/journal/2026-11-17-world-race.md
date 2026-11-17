# 2026-11-17 world.race (opus-ss10e)

Mirror Salt's arch line is a timed run, and the scene API had no way to
say so. `world.race(id, { start, stop, fact?, cap? })` lowers to a
`quests.races` row (shard-format 0.18.0, SHARD-SOURCE SS-MS1a1) between
two quest flags, usually the flags of a start gate's and a finish
gate's `world.trigger`. `withAnchored` declares the two flags beside the
triggers and appends the row after any `extend` races; an id `extend`
already declares is refused, as for triggers.

Refused at the line: one flag for both ends, a cap that is not a whole
second from 1 to 3600 (default 600), a race id twice. The engine side
(the clock in the sim and the HUD chip) is engine `plan/ss10e`; a shard
using it needs an engine release carrying that, and an sdk release
carrying this.

The sdk's format pin moves to 0.18.0, the first with `races`; 0.17.0's
perch rows need nothing here.
