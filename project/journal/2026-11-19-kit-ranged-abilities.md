# 2026-11-19: the kit's ranged abilities come back (ONE-FORMAT CC18d)

> Written by: Claude (opus-of-m23)

`702c52bc` added breath, shoot, throw and spit to the kit, and `ee4a8f05`
took them out again because they needed format 0.28 while the rest of
sharddev was held on 0.26. Every package now pins format 0.45.0, so the four
templates return as they were. Breath keeps `from: "head"`; the other three
carry projectile speed, gravity and radius. A catalogue case checks those
shapes beside the existing plain-JSON identity check.

The stranger shard's `ranged` fixture puts all four on the kit humanoid: the
ordinary `wildshard check` passes on engine 0.1.44 and each strike lands on
the player within 60 s on the server sim.
