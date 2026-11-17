# 2026-11-12: `wildshard prepare` passes the Name prompt; mounts follow the table

Meta SENTRY-TRIAGE S12, found by S10 while preparing Pine Hollow
revision 2 (`WILDSHARD-GAME-89`).

Engine main asks "What should we call you?" after PLAY (MP2.4), and the
prompt leaves SHARD SELECT inert, so the recorder timed out on every
shard. Its seed had `firstPlayDone` but not `nameAsked`. The seed now
lives in `scripts/preparation-seed.mjs` and takes engine's own
`NAME_ASKED` fixture, so the key follows engine.

`record-shard-mounts.mjs` read a section URL's tier variants, never the
hashed stand-in the product's KTX2 table maps it to. Pine's table maps
`creatures/*.phone.rigged.glb` and `life/birds.glb` to hashed files no
variant spells, so `mounts.json` left them out and production 404'd
them. The recorder now mounts every target the product's
`discovery.json` `native.ktx2` names, every group and tier, and warns
for one missing from `public/`. It also takes `--root=<tree>` and
tolerates a tree with no legacy boot packs or audio folders, as a shard
repo is. On Pine at shard-pine-hollow `6f69b83` the table's 175 targets
are all on disk and all already mounted, so the rule adds nothing there.
