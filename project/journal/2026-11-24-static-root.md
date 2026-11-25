> Written by: Claude (opus, session 015pj4Rw)

# 2026-11-24: shard sources mount from `static/`, not the repo's `public/`

Rows S1 to S3 of `docs/plans/opus-2026-11-24-sdk-migrate-static.md`
(ask A7). Jake wants zone source in `src/`, output in `out/`, no
`public/`, and only a move: a mounted file named `/<path>` now lives at
`<source>/static/<path>`.

S1, the readers. `shardStaticRoot(source)` and
`shardImageRoots(source, folder)` sit beside `shardRepoRoot` in
`shardSource.ts`; the build's mount reader (`cookInput.ts`), both
image-root sites (`buildMain.ts` and `wildshard.mjs`, plus
`bake/near-placeholder.mjs`, which copied them) and
`record-shard-mounts.mjs` read the source's `static/`. The hero's
untracked-input check stops listing `public/`: the build no longer reads
it, and `static/` is under `src/` already. No fallback to `public/`:
repos pin exact sdk versions and migration 0.5.0 (row B1) moves them.
`record-shard-mounts.mjs` now takes a static root per folder, since
there is no one shared tree any more; its "read by two folders is the
engine's" rule stays as it was.

A reader the plan's survey missed: `withRepoFar` (`build/project.ts`,
FORMAT-PRUNE FP40) took a repo bake's far proxy from
`<repo>/public/assets/baked/<slug>/far.*`. Left alone, a migrated repo
would build with no far row, and its product would change. It now reads
`<source>/static/assets/baked/<slug>/`, where migration 0.5.0 puts it.

S2, build output defaults to `out/<slug>` (was `public/shardfiles/`):
the repo's `out/` for a `src/` source, the source folder's own `out/`
for any other, as before with `public/`. `new` writes a `.gitignore`
with `out/` and no `public/` lines. Two follow-ons the survey did not
list: the hero content hash skipped a top-level `public/` (the old
output beside a non-repo source), so it now skips `out/` too, and also
`static/`, so a hero stamped before the move stays current after it (its
files were outside the source in `public/`, never hashed). The dev and
watch watchers ignore `out/` as they ignored `public/`.
