# Mossgate's braziers burn

> Written by: Claude (opus-mossgate-m1), 2026-11-19

Meta MOSSGATE-ZONE MZ7, QA 11-19 rows 29 and 30 ("Flame effect here is dog shit", flames floating beside their bowls).
The SDK gains one fire for every shard, `fire()` in `scene/fire.ts`: three crossed flame cards and a core painted as a
soft teardrop in the fragment, embers that climb and fade, thin smoke and a glow on the coals. All four are unlit graph
materials moved by the graph clock, each card's seed in its vertex colour, so a fire lives in a panel part (a mesh GLB
with no motion of its own) and draws the same on a grid cell. Its origin is the coals' top, so it sits in its bowl.
About 60 triangles and four materials a fire, no lights. A real flickering light on the ground waits for MZ34 (panels
that bind lamps).
