> Written by: Claude
> State: done, 2026-11-17.

SHARD-SOURCE SS-GF0: a scene shard sets state with no script of its own.
`world.interact(..., { sets })` writes a field and `world.part(..., { panel,
shownWhen })` shows a panel by one; the sdk writes the state, hooks, targets
and one generated ABI v0 server module (Brasscap gate.as shape), compiled
through the injected `ctx.compileScript` so the author bundle never imports
the compiler. Glowfen sockets (SS-GF1a2) and its shared shrine (SS-GF2b)
build on it. A player-scope panel shows on the server only until the engine
publishes script-written player fields to their owner (SS-GF1a2).
