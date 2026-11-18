# 2026-11-17 a vehicle part (opus-ss10h)

SHARD-SOURCE SS-MS2a4, the sdk half of Mirror Salt's land-sail.
`world.part(name, build, { panel, vehicle })` lowers to the engine's
steer vehicle (format 0.19.0 `steer`, 0.21.0 `wind`): a native carry
`channel` mover the player boards with one prompt and leaves with the
other. Both prompts and the landing are in the vehicle's own frame, so
they ride with it; the board prompt reaches past its footprint, the
leave prompt sits at the seat where the rider's eyes are.

Its rest is the base centre of its bounds, not the centre as a track
mover's is: a ground follower sets its height to the floor it finds.
It has no collider (a channel has no body on the page), so its solids
block nobody. The wind is the author's (`toward`, `push`): the look has
no wind direction a shard declares, and Mirror Salt already keeps its
own for its flags.

It needs shard-format 0.21.0 or later (0.20.0 lacks the wind); main pins a newer one.

Format 0.21.0 checks the wind with `someItem`, which the sdk's JSON
Schema bridge could not lower; it now writes `not: { items: { const: 0 } }`.
sharddev dev's platform-families test converts through the engine's
copy of the bridge (fixed on engine main; red here until the sdk pins an
engine release with it).

Review (opus-ss10j, at the land): a heading of ±π rounded to 3.1416, past
the format's angle limit, and a `turn` under the format's 0.005 floor
threw a raw ValiError; the heading is clamped after rounding and `turn`
is refused below 0.005, each with a test that failed first. Left: the
footprint reads the world bounds, so a hull built at an oblique heading
gets a wider landing than its own frame would give.
