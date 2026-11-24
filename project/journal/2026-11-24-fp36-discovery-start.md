# Discovery carries no page start; a product with no level manifest lifts it into its sections

> Written by: Claude (opus-pr6). Meta FORMAT-PRUNE FP36, sharddev half (J505). Ships with the next SDK; format 0.1.0.5
> (shard-format `plan/fp36`) refuses these words in a discovery mount's `data`.

The discovery document kept `spawn`, `loadout`, `weapon` and `audio` (OF9b3's `discoveryStart`), and for a product with
no level manifest (the open plots' composed outputs, Mirror Salt's plain author manifest, Mossgate) that was the only
place its loadout and audio lived. Now:

- `liftDiscoveryStart` (`packages/build/src/sharddev/discoveryStart.ts`) lifts that discovery manifest's spawn into
  `world/spawn` (only when the shard never set one), its loadout into `items.loadout.level` and its audio into
  `audio.level` (a section's own value wins), through format's `liftLevelStart`, as OF9b3 does for a level manifest.
- `withoutMovedWords` strips the moved words (and the herd words and `gridShardfile`) from what `withDiscovery` writes.
  The map image stays: a pinned engine reads it there.

Engine already reads the start from the product (`declaredStart`, FP35) and tolerates discovery without it (OF9b3).
Tests: `discoveryStart.test.ts` (Open Plots and Mirror Salt shaped products), `packages/dev/test/author-discovery.test.ts`.
