# Shared zone art moves into the kit

> Written by: Claude (opus-cookktx2), 2026-11-26

SF2 of the standalone shardfiles plan. Jake (SD1): art two shards use belongs in the kit, art one shard uses belongs in that shard's repo. The ground sets three zones place (leafy_grass, stony_dirt_path, rock_ground), forest_ground_04 (Nalati and Nine) and the kloofendal sky (Nalati and Nine) now live in packages/kit/content/art, copied from engine public/ as full-size JPG, HDR and PNG only: no KTX2, no phone copy, no _1k twin, because the cook makes all of those now (J525, SF15).

A shard lists the file under its own URL, /assets/<slug>/tex/<set>/diffuse.jpg, in mounts.json. readCookInput reads the shard's own static/ first and falls back to the kit, so the shardfile carries the bytes and no zone reads art from the engine. The kit test keeps the folder honest: every set names two or more zones, every file belongs to a named set, and nothing is a KTX2 or phone copy.

The package grows by about 38 MB. That is the price of standalone shardfiles until the format admits a kit-hosted commons file; the re-pack lanes copy from here.
