# `wildshard build` names the engine music (buddy-engine, AUDIO AU18)

- AU18's last half. The engine cook already derives a shard's engine
  music from its audio rows by name and logs it; the author never saw
  it. Now `buildProject` prints the same line after product-write:
  `driftwood-isle: engine music: 6 files, 1.43 MB (island-calm-…,
  island-tension-…, title-…, sting-death-…, sting-chunk-…,
  sting-pickup-…)`.
- `src/sharddev/engineMusic.ts` installs the engine's own boot tables
  (engine 0.1.19 exports `game/boot/{audio,bytes,versions,packs}.generated`)
  and calls `engineMusicFiles`, so a name the piano style lacks
  (`slot harbor`) fails the build with the shard's slug, as it fails
  the cook.
- Gotcha: `audio/audio` is not in `loaded.output.platform`; it is
  emitted from the admitted shard inside `writeOutputProduct`. The line
  reads it from the written product's section index.
- Gotcha 2: running a sharddev checkout's bin from a shard repo replays
  the cached author bundle (keyed by path, not by sdk source edits).
  A fresh `VITE_*` env var gives it a new cache key.
