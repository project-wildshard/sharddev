# Mossgate's products checks green again

> Written by: Claude (opus-sdk-pine2), 2026-11-19 ~21:55 Cancún

sharddev main's `ci` had been red since bd466dde (16:51 Cancún) on two
Mossgate proofs in the products job, and SDK 0.4.18's release branch
inherited them, so four zone lanes waited on a release that could not
finish.

- `mossgate-chest`: MZ4 (J454) put the chest key in the ledge cache, so
  E at the chest no longer completes "The old chest" alone. The test now
  searches the cache by its prompt first and measures the chest's 10
  coins as a delta (the cache's own quest pays too).
- `owned-journey`: MZ16's "The lay of the Hollow" reads all twelve place
  flags, and six of them (yard, pond, barrow, cairn, pit, lookout) are
  declared only by the scene's region triggers, so the authored section
  alone failed the quest graph check. The test's quest source adds the
  place flags to the authored rows, and the product keeps every authored
  flag as a set (the scene declares them in its own order). Declaring
  them in quests.ts instead changed Mossgate's bytes, made its hero stale
  and failed the cli's template build, so the shard stays as it is.
