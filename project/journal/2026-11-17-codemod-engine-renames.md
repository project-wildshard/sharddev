# The split codemod takes dev engine's folder names (opus-sdksplit7, SDK-SPLIT SP13)

- Every shard moved so far (Brasscap, Open Plots, Dunes, Sky Reach) fixed its CI tests by hand after `update --pins`: the
  engine dev pin moves to dev's engine (0.1.35), which renamed `headlessProduct`/`loadHeadlessProduct`,
  `productHeadlessSections` and `builtProduct` to folder names, and the `wildshard` bin is the cli's, not the sdk's.
- `codemods/0.4.1.mjs` now makes those edits (`rewriteEngineRenames`): whole identifiers only, and a sdk `package.json`
  resolve becomes the cli's only in a file that runs `bin/wildshard.mjs`. Nine Dragon, Driftwood, Nalati and Pine
  still have all of them.
- The shards' own `.oxlintrc.author.json` loaded engine's lint plugin directly, so sharddev `ba73597e`'s layer fix (dev
  is a layer package) never ran there and Sky Reach's `@wildshard/dev/bake/mapRest` import stayed refused. The codemod
  points the config at the sdk's `lint/engine-plugin.mjs`, as Brasscap's already was.
