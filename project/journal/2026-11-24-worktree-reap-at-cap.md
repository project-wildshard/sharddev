# A full worktree cap reaps a landed, clean, idle worktree

> Written by: Claude (opus-pr6). Coordinator order 11-24 (J505), engine `738764b36`'s pattern (Build-max C4).

sharddev stood at 13 worktrees against the cap of 6, and `worktree new` only refused. Its `reap` is an inventory (J358):
it named three landed, clean worktrees "live" because an owner session was present, and five more "unknown" because
they had no `.owner`, and removed none. A lane needing a worktree stopped.

`files/scripts/worktree.mjs` now does what engine's has done since 11-21: on a full cap, `new` first reaps the oldest
plan worktree that is landed (tip on origin/main), clean (no tracked or untracked change), idle 30 min, with no process
or pidfile inside, after a keep-copy, then its local branch, until one more fits. An owner file, or none, keeps nothing.
Unlanded or dirty worktrees always stay; low disk still refuses. `reap` itself stays an inventory.

Test: `test/tooling/worktree-cap.test.mjs` (an owned, idle, parked worktree goes; unlanded, dirty and fresher ones stay;
fresh parked ones still refuse with the oldest named).
