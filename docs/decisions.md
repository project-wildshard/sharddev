# sharddev: decisions

Living doc. Decisions that bind this repo, newest last. Cross-repo decisions
(J-numbers) are Jake's, from `Raynos/project-wildshard-meta` `docs/plans/MULTI-REPO-SAGA/decisions/`;
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
  Replaced for plan work by J240/J290 (2026-11-12): a plan may use
  `.worktrees/<slug>` on `plan/<slug>`, pushed and landed only by
  `land`; everything else still commits on `main`.
- **D28**: 2026-11-05: lint is the strictest of greenroom and
  wildshard-singleplayer (every oxlint category denied, type-aware, warnings
  denied, unused disable directives are errors, `import/no-nodejs-modules`
  outside Node-side folders). Imported code may arrive under a shrink-only
  ratchet (Jake, 2026-11-05).
- **D29**: 2026-11-24: on 0.x the sdk bumps the minor on every break
  and never breaks in a patch (Jake, 2026-11-24: *"0.4.$PATCH is non
  breaking, and 0.5.0 is for breaking, we bump the minor on every
  break."*). Each minor ships a migration (`codemods/<v>.mjs` with
  `title`, `pending()` and a GUIDE.md `migrate-<v>` heading) or a
  `codemods/<v>.none.json` saying why none is needed. A shard repo's
  `package.json` stamp (`"wildshard": { "migrated" }`) and each
  migration's `pending()` tell the CLI what has not run, and every
  verb refuses (`migration-pending`) until `wildshard migrate` does.
  First used for 0.5.0: a shard's mounted files move to
  `src/static/`. Gate: `packages/sdk/test/codemod-gate.test.ts`;
  procedure: `.agents/skills/sdk-breaking-release`. Plan
  `docs/plans/opus-2026-11-24-sdk-migrate-static.md`.
