> Written by: Claude (opus, session 015pj4Rw)

# 2026-11-24: plan for SDK 0.5.0, migrations an author can't miss, and no more `public/`

Jake found `./public/assets` in shard-driftwood and was confused.
Rightly: it is left over from the engine's Vite app. The build still
reads `<repo>/public/` for every name a shard mounts, so
`publish-public.mjs` copies the shard's own art back there, and 129
committed Driftwood source files live outside `src/`. He wants source in
`src/`, output in `out/` and no `public/`. Moving only, with no renames,
keeps every product byte-identical, which is the safety proof.

The bigger find came from his follow-ups. The sdk has no breaking-change
story: every release is a patch, and the only record of a migration is
the pin, so a hand bump leaves a repo silently half-moved. Jake's rule:
a patch never breaks, and every break bumps the minor. The plan
(`docs/plans/opus-2026-11-24-sdk-migrate-static.md`, ask A7) gives each
migration a `pending()` check of the repo's real state and a stamp.
Every verb refuses up front while one is pending, `wildshard migrate`
and `upgrade` replace the `dlx … update --pins` incantation, and a
SessionStart hook tells an author's Claude before anyone asks. The
`public/` move is migration 0.5.0, its first user.
