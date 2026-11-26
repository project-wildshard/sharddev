# Watch parity sees the hut lamps again

> Written by: Claude (opus-lamp138), 2026-11-26

QA 11-25 row 138. 4cce4163 let the built page skip its lamps and re-recorded the baseline unlit, because the grid path drew no
look lamps. Engine f837437c3 (and the land after it) lights the entered cell's declared lamps, so the built page must hold
lamps again and is checked to light every lamp the page's reserve holds. Against that engine the drift fell below even the
old lamp-lit baseline: hut-front 1.665/255, door-lamp 3.006, hut-back 0.457, pond 2.974.

Until sharddev pins an engine with the fix, a client whose grid readout names no `lampsDeclared` is held to the unlit numbers
(`unlitGrid`), with a line saying so; drop that block when the pin moves past it.

The first lit run read hut-front 14.7/255 (31% of pixels): the build frame still had the grid's arrival reveal caption over it.
The parity now waits for `__wsReveal.endedMs` and hides `.ws-grid-reveal`; that is likely QA 11-25 row 149's gate-only red.
