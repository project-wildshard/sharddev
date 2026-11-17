# 2026-11-15: the ABI-v0 script prelude (SHARD-SOURCE AP27)

> Written by: Claude

- `src/sharddev/as/prelude.ts` is `wildshard.ts`, a virtual source `compileScript` adds to every ABI-v0 compile unless
  the shard supplies its own. AssemblyScript reads only imported files, so a script that never imports it compiles to the
  same bytes (tested on `items.as`).
- It names ABI v0's input row (tick, dt, command, entity, actor, role, state counts, shared then player values), the
  event rows (count at slot 32, six slots each from 33) and the six command ops (field 1, spawn 2, event 3, position 4,
  shared 5, player 6), from engine `src/server/engine/script/lane.ts`, `src/shared/engine/script/state.ts` and
  `effects.ts`. Reads and writes assert their bounds (`env.abort`, which the host already provides).
- The Template's `door.as` is rewritten on it, with no `load`/`store` at a literal address; 2000 random shared states and
  event lists gave the old and new door the same commands. The unused `ticks` witness at 30000 went.
- Out of scope: pastel-plain and ink-cel-valley keep their own `door.as`; the prelude's out_cap is 4.
- Also on this branch, from the plan/ap16 review: panel ids may not start `scene.` (they would clash with part colliders),
  a panel part may not move, `template-skins.mjs` starts from an empty list when `skins.json` is missing, and the sunk pond
  slabs keep no collider (MG10 swims across before brazier B). The Template's hero is captured again (content a3f16dec).
