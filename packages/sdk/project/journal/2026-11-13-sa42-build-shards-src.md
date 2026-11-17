# SA42: build-shards reads the single-shard src/

- Engine pin 867f3b96 -> 6f26d0ea (engine main, SA42's engine half:
  shard-outputs owns the layout; built-product and map-hash follow).
- `scripts/build-shardfiles.mjs` lists folders with
  `shardSourceFolders(root, ['shard.config.ts'])` and finds each one's
  source with `shardSourceDir`, so a repo with `src/shard.config.ts`
  builds one product named by its slug; `src/shards/<folder>/` as before.
- `test/build-shards-layout.test.ts`: both layouts, through a fake
  builder; the single-shard case fails on the old code.
- Built in a plan worktree: another lane had sharddev's shared checkout
  dirty, and the pin bump reinstalls node_modules.
- Review SHOULDs left: a repo with both layouts and one slug builds only
  `src/` (engine should refuse); generationCache names every single-shard
  repo's folder `src`.
