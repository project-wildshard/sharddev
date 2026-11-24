# A full worktree cap lists ended worktrees; nothing removes them (J358)

> Written by: Claude (opus-pr6). Coordinator order 11-24, which reverts its own earlier order (`0f49e36`).

`0f49e36` made `worktree new` reap the oldest landed, clean, idle worktree at a full cap, after a keep-copy. That breaks
J358 (Jake, 2026-11-15: *"No fucking auto delete in scripts Claude's can audit and delete what makes sense"*): the only
script that removes a worktree is `land`, its own just-landed one.

Now `worktree new` at a full cap refuses, as before `0f49e36`, and lists each worktree that has clearly ended (landed,
clean, idle 30 min, no process or pidfile inside, owner file or not), oldest first, with the one command that removes it,
copy first:

    node scripts/keep-copy.mjs .worktrees/<slug> && git worktree remove .worktrees/<slug> && git branch -d plan/<slug>

An agent reads it and decides. Low disk alone lists nothing. Test: `test/tooling/worktree-cap.test.mjs` (the list names
exactly the ended ones and every worktree is still there).
