# DEV-SPEED DS11 in sharddev: plan worktrees are invisible

Jake, J221: a worktree per plan, at `<repo>/.worktrees/<plan>`, "but fix all
the repo tools". Plan: meta `docs/plans/DEV-SPEED-PLAN.md`, row DS11. Engine
did it first (engine `03d4d79`); this is sharddev's copy, so lanes can make
worktrees here.

Measured with the new guard, `test/tooling/worktree-guard.test.mjs`, which
plants a worktree holding a lint error, failing tests, an `index.html` and a
secret-shaped string under `.worktrees/`. Before: Git, both oxlint configs and
oxfmt all saw it (the old ignore was `.claude/worktrees/`). Vitest's include,
the `node --test` globs and Vite's `**/*.html` crawl (a dot folder) did not.
After `/.worktrees/` in `.gitignore`, all seven checks pass.

Also: `sharddev dev` stamped and watched a shard repo's whole tree, so a plan
worktree inside it would have rebuilt the canonical project on every edit
there; `.worktrees` joins its ignored names. The markdown hook and its test
are engine's DS11 copies (a worktree's file is checked against that
worktree). `scripts/worktree-ignore.mjs` is engine's file, byte-identical.

Left: build-shardfiles' `treeHashes` comes from the engine pin, which skips
`.worktrees` only from engine `03d4d79`; only injected (test) builders use
it, and the next engine pin bump carries the fix.
