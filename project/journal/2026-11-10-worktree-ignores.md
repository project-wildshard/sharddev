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

J206 Codex review, nine MUSTs, all fixed. The guard plants with
`mkdtempSync` under a `.worktrees/` that must be a plain folder of this
checkout, and removes only what it made. It now runs the kit's own secrets
and size checks (`checkBlob`) on the planted secret and a 1 MB+ file forced
into a scratch index, as a positive control. oxfmt must run with empty
stderr and list something; every `node --test` must name globs (Node's
default discovery walks every folder) and each must find files; a tool the
repo uses must be installed, never skipped. `sharddev dev` watches each
top-level folder except the ignored ones (a root recursive watch walks
`.worktrees/` on Linux); Vitest watch mode ignores `.worktrees/`;
build-shardfiles drops worktree paths from the pinned engine's
`treeHashes`. The markdown hook resolves the path physically first, so
`.worktrees/p/../../x.md` neither picks a worktree nor leaves the repo.

Not yet a worktree repo: `.githooks/check-index.mjs` still refuses a commit
in a linked worktree (D27). DS6's relaxation, `worktree.mjs` and
`land.mjs` come before sharddev lanes move to worktrees.
