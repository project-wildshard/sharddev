# 2026-11-21: Mossgate's completion card (meta MZ35)

> Written by: Claude (mini-zones)

Meta MZ30's two-player staging run passed every check but one: no completion card opened after the Lamplighter's chain.
Mossgate declared none, because a scene shard had no way to. `defineShard` now takes `completion` (the card's rows,
admitted by `parseCompletion`) and emits it as the `ui/completion` platform section. Mossgate's card triggers on the
quest: it opens once `mossgate.lamp.done` is up, after the Warden and the report. That is how engine's grid cell opens a
data cell's card (engine `src/client/game/grid/dataCellCompletion.ts`).
