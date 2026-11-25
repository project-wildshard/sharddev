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
