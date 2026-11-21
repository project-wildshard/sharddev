# Mossgate's score and quest beats

> Written by: Claude

> **State:** MOSSGATE-ZONE MZ23, 2026-11-21.

Lane: mini-closer. Mossgate declares the engine's piano score
(`world.music`: pine by day, island by night, the title theme
while the Warden fights) and wires MZ31's quest beats
(`buildLandings` after `buildHollow`, also in `wildshard new`'s
shard.ts). The two-player Warden proof now checks that the score
is on `day` at the arch and turns to `boss` within 3 s of the
fight engaging: a local dev run passed, boss 0.3 s after engage.
The hero is recaptured on the new build.
