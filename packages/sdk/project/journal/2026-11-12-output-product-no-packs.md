# 2026-11-12: build products hold no packs

Meta SHARD-SIZE S5 (BUILD-MAX-APPROACH SD-5).

`writeOutputProduct` packed the sections, schemas and small files a
second time into `blobs/pack/*.pack` and listed them in `shard.json`
`packs` (iPhone downloads I5). Engine cooks its own packs from the raw
upload, `wildshard pack` already left `blobs/pack/` out of the tarball,
and engine's client reads `index.packs` only when it is there. So the
packs were a second copy of every small file in every `out/` folder,
read by nobody once uploaded.

The writer now emits no packs and no `packs` row, and still clears a
`blobs/pack/` an older writer left in the folder. The pack-only tests
went with it, and `entryDemandUrls` lost its pack-range branch: no
product names a pack for a crawl to expand.

Measured with the local sharddev linked into two shards
(`pnpm build:shards`): Sunscar Dunes 18.5 MB to 10.6 MB (7.8 MB of
packs to 0), Pine Hollow 440.4 MB to 330.6 MB (109.7 MB to 0).

Two things the proof ran into, left for their owners. The author
compiler cache keys skip `node_modules`, so a linked sharddev edit
replays the old bundle; a fresh `VITE_*` env value forces a rebuild.
The J196 link left each shard's `node_modules/three` pointing at
engine's old `.pnpm` copy while sharddev uses the global store, so
`instanceof` fails in the GLB bake ("GLB textures must be external KTX2
declarations"); repointing `three` at sharddev's copy fixes the build.
