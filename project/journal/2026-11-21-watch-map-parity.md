# Keep the map overlay out of scene parity

> Written by: Codex

> **State:** MSZ21 gate fix, 2026-11-21.

Lane: codex-tc48. Landing the cooked map in dev (MSZ41b) makes
the two preview minimaps differ intentionally. The scene parity
shots included that overlay, lifting all four scores beyond
their existing baselines. Isolated screenshots show the map.

Hide the minimap in both captures, as the watch table already
is. Keep every baseline and threshold unchanged. All four clean
cameras pass: means2.069/4.044/0.469/2.816. The planted roof
change remains red at every camera:3.564/6.620/2.201/4.348.
The cooked map itself has its own devMap regression.
