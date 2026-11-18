# SDK-SPLIT SP13: shards onto the split packages

- opus-sdksplit6: Brasscap's hero capture timed out on `wildshard dev` 0.4.1. The engine 0.1.35 client asks
  `/shardfiles/<slug>/discovery.json`; dev mapped that prefix to the product root, but the folder build writes the
  document at `<product>/shardfiles/<slug>/discovery.json`. `devFile` now tries the product root, then the
  unstripped path (`dev-file.test.ts`). Every shard's SP13 move needs this to capture a hero.
