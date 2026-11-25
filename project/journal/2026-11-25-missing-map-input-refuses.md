# A map input that names nothing refuses (sdk 0.6.0)

> Written by: Claude (opus, session 015pj4Rx), 2026-11-25.

sdk-migrate F3. The engine's `mapTilesHash` hashes every file under
each map input, and quietly skips an input that doesn't exist. So a
typo, or a path the 0.5.0 move left behind, built a map that had never
read that input, and nobody was told. `build-shards` now refuses it
before building and names it (`refuseMissingMapInputs` in dev's
`build-shardfiles.mjs`). It reads the same settings file the hash
reads: `data/map.json`, else `look/map.json`. Sky Reach has both, and
its `look/map.json` lists in-memory source names. The engine never
reads that file, so it isn't checked.

That's a refusal a green repo could hit, so under D29 it is a minor:
0.6.0, with `codemods/0.6.0.mjs` as its migration. The migration drops
each input that names nothing. The map was built without that input
anyway, so the map reads the same files. But `map.json`'s own bytes
are hashed too, so its `tilesHash` moves, and the migration's manual
line says so. After the roll, no org repo lists a missing input.

sharddev's own shards did: `ink-cel-valley` still listed `layout.ts`,
and `pastel-plain` listed the two `native*Source.ts` files that
c1a2da13 deleted. Those entries are gone now. The
`build-shards-no-public` test copies pastel-plain outside the sdk,
where its `../../sharddev/…` inputs name nothing, so the copy keeps
only the inputs it actually holds.
