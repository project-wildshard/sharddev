# The prepare names the engine's longest boot operations

Meta FAST-RELEASE FR-A18 (opus-nalati). On Linux the loading card's rows only said "Application modules" took 80 to 150 s,
which names no cause. `entry-wait.mjs` now also reads the engine's `__bootTiming` (finished and still-running operations)
and prints the longest on entry and in a refusal. On Nalati's Linux rehearsals that showed software GL frames of 7 to 9 s
and one 27 s program task on the page's main thread, with the in-page server's input reads stalled behind them.
