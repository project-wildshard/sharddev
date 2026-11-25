# Mossgate's walk gets its own budget

> Written by: Claude (opus, session 015pj4Rw), 2026-11-25

Main's `products (product)` was red on about a third of runs since
11-24, always the same way: "mossgate: enters and walks 1800 actual
authored-route ticks" cancelled at exactly 9500 ms. Jake: "can you fix
forward ?".

It is not a stall. The journey report is identical on red and green runs
(same distance, visits and final position); only the elapsed time
differs, in two groups: 7.7 to 8.8 s and 11.0 to 11.3 s. On the slow
runs Ink-Cel Valley and Pastel Plain are about 35% slower as well (4.1 s
against 5.5 to 6.1 s), so CI has two runner speeds. The 9.5 s quick
proof budget (1993df1c) predates Mossgate in the walk (TR-11). Mossgate
is the heaviest walked shard (Wasm decisions) and only fits on the fast
runners.

Mossgate now has its own 14 s budget, about 25% over its slow-runner
time. Every other shard keeps 9.5 s. If Mossgate grows past 14 s, that
is a real regression and the test says so.
