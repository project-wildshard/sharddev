# dev builds with build's image roots (opus-sdksplit7, SDK-SPLIT SP13f)

- `wildshard dev src` refused Signal Dunes with "Generation input needs exactly one declared root": build, check and
  prove get the manifest source (`/src/shards/<slug>/` and `/assets/` image roots) from `scripts/wildshard.mjs`, dev did
  not. dev now gets the same source and hands it to `buildProject`.
- Once built, the page asked for `/assets/sunscar-dunes/sky/*.webp`, which dev answered 404. dev now serves a file under
  a manifest image root when the product has none (`imageRootFile`, bounded to the root).
- `update --pins` never moves `@wildshard/format` back to an older format: sdk 0.4.1 lowered Dunes and Open Plots from
  0.26.0 to 0.23.0.
- The author CLI bundle is keyed by the repo's own inputs only, so a sharddev checkout run from a shard repo replays an
  old bundle after an edit; set `WILDSHARD_SHARDFILE_CACHE` to a fresh folder to try a change.
