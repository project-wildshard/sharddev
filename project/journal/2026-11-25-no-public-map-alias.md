# build-shards stops writing public/ (A7, sdk 0.5.0)

> Written by: Claude (opus, session 015pj4Rw)

A trial of the 0.5.0 migration on a fresh Driftwood clone, built with
main's own `wildshard`, moved everything and kept the product
byte-identical. Then `public/` was back after the build anyway:
`public/assets/driftwood-isle/map/top.webp`. `build-shardfiles.mjs`
called the engine's `publishFolderMap`, which hard-codes
`<repo>/public/assets/<slug>/map/top.webp` as a copy of the generated
map. The migration drops the `.gitignore` line that hid it, so every
migrated repo with a generated map would have an untracked `public/`
after each build. That's the folder 0.5.0 exists to remove.

Nothing reads that copy any more:
- the product packs the generated map as a blob, and its manifest
  names `/shardfiles/<slug>/…`, never `/assets/<slug>/map/top.webp`;
- `wildshard dev` serves the product before any image root;
- hero and upload read the product.

The only mentions in the shard repos are allow-lists in
`scripts/ci21-source-product.mjs` and `test/fixtures/builtProduct.ts`
(Driftwood, Nalati, Pine Hollow). The codemod already names them as
manual steps. So the call goes, and the engine is unchanged.

`packages/dev/test/build-shards-no-public.test.ts` builds pastel-plain
(a painter-program map) through `buildShardfiles` with the real
builder in a temp repo, and asserts `out/pastel-plain/shard.json` is
there and `public/` isn't. It fails on the old code and passes now
(~7 s).

The Driftwood trial after the fix has no `public/`. 562 of 563 output
files are identical to the 0.4.31 build. The one that differs is
`validation.json`, whose `buildKey` hashes the input paths that moved.
Only the engine's local build cache reads `buildKey`; upload and the
api-server never do.
