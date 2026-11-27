# The SDK writes and reads a zone's own URLs

> Written by: Claude (opus-repacks), 2026-11-26, meta standalone-shardfiles SF4 (for the SF5 to SF9 re-packs).

Three SDK spots still assumed engine-wide folders when a zone moves its art under `/assets/<slug>/`:

- The navigation discovery URL is `/assets/<slug>/baked/navmesh.bin` (`navigationAsset.ts`, `navigation-json.mjs`); the
  engine reads that first and the old `/assets/baked/<slug>/` second.
- The audio encoder reads `/assets/<slug>/(music|sfx)/` as source recordings too (`audioEncode.ts`), so a re-packed zone
  no longer builds with 0 recordings (opus-pine, Pine Hollow).
- `sky.hdri` as `/assets/<slug>/hdri/<name>` with no extension names a mounted sky set by its stem; it is no longer read
  as one image file to pack (which refused with source-file-missing). An image URL is still the painted sky.
