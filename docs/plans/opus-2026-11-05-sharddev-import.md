# sharddev: import from singleplayer

Status: draft 2026-11-05: waits on F4; engine moved with a dev build exposed (P3). `wildshard pack` landed ahead of it.

One-page runbook for bringing this repo's code over from
`Raynos/project-wildshard-singleplayer`. The why and the full plan live in `Raynos/project-wildshard-meta`:
`docs/multi-repo/MULTI-REPO-PLAN.md`, `P1-IN-TREE.md`, `MOVES.md` (phase P4).
Live cross-repo status: `docs/multi-repo/STATE.md` there.

## What comes in

From `Raynos/project-wildshard-singleplayer@727236c625` (paths may move before the import; re-check them then):

- src/sdk/cli.ts (minus validate) and the in-tree sharddev package from P1 F4
- `src/sdk/bake/`
- `scripts/build-shardfiles.mjs`
- `scripts/shardfile-cache.mjs`
- `src/engine/explore/`
- `drafts/`
- `scripts/docs/author-project`

## Before the import

- F4
- engine moved with a dev build exposed (P3)

## Steps (MOVES.md, the standard move)

| # | Step | Done when |
|---|---|---|
| 1 | Freeze: tell the singleplayer lanes, pause commits to the moving paths, record the SHA | The SHA is in this plan |
| 2 | Import commit: copy the paths at that SHA into this repo; the message names the SHA and paths (J12) | One commit, nothing else in it |
| 3 | Binaries over 1 MB go to R2 by hash (J13) | The pre-commit size cap passes without `ALLOW_BIG` |
| 4 | Green: `pnpm check` and CI pass; imported code that fails the strict lint goes under a shrink-only ratchet (D28) | CI green on `main` |
| 5 | Release `v0.1.0` with built `dist/` on a tag-only commit (J23) | The tag installs as a git dependency |
| 6 | Switch: singleplayer uses this repo (git dependency or deploy) instead of its own copy | Singleplayer CI green |
| 7 | Delete the paths from singleplayer in one commit naming this repo and tag | Gone from singleplayer |
| 8 | Unfreeze; record the move in the meta repo's `STATE.md`; set this plan to finished | STATE.md says moved |

Rollback: until step 7 singleplayer still has everything, so drop the import commit.

## Follow-ups from `wildshard pack` (2026-11-05)

| # | Row | Done when |
|---|---|---|
| S1 | The shard half of C0, singleplayer's rows: shard-owned `/assets` files become product files, so `pack` has a standalone product to read. Waits on DOWNLOAD (J137) | A packed tarball boots cold with no shard-owned `/assets` read |
| S2 | D5's optional author data (`fence-reads.json`, `packs-set.json`, `public/programs/<slug>.json`): format has to list them first, or the validator refuses them as unlisted files | `pack` carries them, with a format tag; a missing one costs seconds, never a refused cook |
