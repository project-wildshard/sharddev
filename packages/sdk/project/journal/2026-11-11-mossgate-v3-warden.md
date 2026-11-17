# Mossgate Hollow v3: the sword and the Barrow Warden

> Written by: Claude (opus-mh4b), 2026-11-11 ~21:40 Cancún

Meta TEMPLATE-E2E-PLAN row MH-4, on engine TE-ENG1 (`9e4bf0d6`): a
decision writes a scene shared field with `Do.field(0, …)` and gates
hits with `Do.encounter(4, guard)`. Rows and the decision only; nothing
shared with Template 2.

- **Engine pin** moves from `80d5cc0d` past `9e4bf0d6` (TE-ENG1) to
  the data-cell fix below.
- **The Warden** replaces the big blob: spawn `barrow-warden`, grey-blob
  variant `warden` (Barrow Warden, 420 hp, scale 2.2), its encounter,
  boss panel and map pins renamed. Phase two starts at 0.6 (252 hp,
  the end of the second full combo), with a faster beat.
- **Shared fields** 110 `template.warden-tell` and 111
  `template.warden-core` (public bools, `behaviour/hooks.json`).
- **`behaviour/boss.as`**: every beat the slam raises the tell, shuts
  the guard and starts `template.warden.slam` on the nearest player.
  When the windup ends (`open`, 1.2 s) the tell drops, the core opens,
  and the guard goes to 2 (melee only) for 3 s (`shut`). The Warden
  never moves, so the visuals at the arena's centre stay on it. Three
  traps found in the sim:
  - the fight's start resets the guard to open after `onStart`, so an
    `arm` timer shuts it 0.1 s later;
  - a phase change stops and restarts the decision, so `onStart`
    resumes from the Warden's health (`hpShare` over 0.6, the second
    phase's `at`) rather than phase 0 (a reset replayed the threshold
    beat forever);
  - a strike's point radius scales with the actor (2.2), so the slam's
    1.6 is 3.5 m in the world, matching the ring.
- **The ring and core are particles, not panels.** Arena tile 0/3/4 is
  at the 8-draw cap and a panel adds 2. `clientScripts.json` has twelve
  ring anchors 3.5 m round (-18, 16) reading 110, and a gold core over
  the Warden reading 111. `MH4_LIBRARY_RESIDENT` in `product.ts` is
  60 000 (the sketch check passes at 45 000, refuses at 30 000).
- `generators/boss.ts` compiles with the shard's state rows, so the
  decision's `fields` resolve.

## An engine bug the browser found

In a page (and a room) a data shard opens through engine's
`openDataCell`, which never passed the product's sections to the sim:
no decision ran, and the boss fell back to its native phase chase. The
sim-level test passed, the browser did not. Fixed in engine (same
lane, `test/data-cell-decisions.test.ts`, red before): the cell hands
its sections over. Codex review: a MUST (pin the fix, not `9e4bf0d6`)
and a SHOULD (resume at 0.6, not 0.5), both applied.

## Proved

A headless engine preview (recipe in `2026-11-11-mossgate-v3-sky.md`,
engine worktree on the fix). The ring rises 1.2 s before each slam;
the player dodges by moving after it rises. Sword combos in the window
take 56 to 84; a sword combo with the core shut, and a non-melee hit
in the window, take nothing. Seven windows beat it (two spent on the
whip and the non-melee probe), no console errors. The whip is melee
too, so it lands in the window: the guard is melee-only, not
sword-only. Shots in meta's template-e2e-v3/progress: `t1-05-warden.jpg`
(ring, core, beaten) and its three parts.
