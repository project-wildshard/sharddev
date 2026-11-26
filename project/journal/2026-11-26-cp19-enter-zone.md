# sharddev's scripts enter a zone like a player (opus-chunk2, meta CHUNK-PARAM-REMOVAL CP19)

- J522 deletes `?chunk=`. bake-entry-programs, bake-maps, gpu-texmem, ktx2-ab, shard-progress and shardfile-cold-boot
  now call engine's `enterZone` (`@wildshard/engine/scripts/zone-entry.mjs`, loaded after the format hook because it
  imports engine .ts): the measuring and baking tools take the zone alone (Q1 (a), its one cell at the origin);
  bake-entry-programs' grid-only fallback writes the title's tap and opens a bare `/`. capture-front.sh prints the tap
  with `zone-entry --init --mode explore` from packages/dev (the sdk has no engine) and evals it before opening `/`.
  gpu-texmem and creature-color take `--zone=`.
- The pinned engine (0.1.93-next.4daadc70) predates enterZone, so these run against a linked engine until the pin moves.
- Proof on a local engine build (65ab48248, headless, muted), linked by a scratch node_modules: gpu-texmem measured
  pine-hollow alone (ready in 12 s); bake-entry-programs entered it by the tap on WebKit in 8 s (106 programs);
  capture-front's World Explorer view opened on it from the tap. bake-check and bake-maps have no shard to bake in
  sharddev since the SDK split (no src/shards, no bake-loader), so they load only to their usage lines.
