# sharddev: decisions

Living doc. Decisions that bind this repo, newest last. Cross-repo decisions
(J-numbers) are Jake's, from `Raynos/project-wildshard-meta` `docs/multi-repo/MULTI-REPO-PLAN.md`;
this repo's own decisions are D-numbers.

## Cross-repo (J)

- **J7**: `shardfile` holds spec + validator. The bake/build CLI goes to `sharddev`
- **J8**: `sharddev` runs the engine's client build against its server build. It also holds the explorers, the arena and the drafts tool
- **J21**: The **author SDK** (what shard generators import) lives in **`sharddev`**, which re-exports what it needs from `engine`

## This repo (D)

- **D25**: 2026-11-04: a commit of 30+ changed lines stages a
  `project/journal/` entry (from greenroom; `.githooks/pre-commit`).
- **D27**: 2026-11-04: main only: no branches, no worktrees, every
  agent commits on `main` by pathspec (from greenroom).
- **D28**: 2026-11-05: lint is the strictest of greenroom and
  wildshard-singleplayer (every oxlint category denied, type-aware, warnings
  denied, unused disable directives are errors, `import/no-nodejs-modules`
  outside Node-side folders). Imported code may arrive under a shrink-only
  ratchet (Jake, 2026-11-05).
