# Keep the authored version through the cook

Both the draft writer and the preparation writer include the authored
shard version in cook.json. A versioned Driftwood pack had omitted it,
so the cook inserted the value and changed the descriptor hash its own
browser expected. The SDK proof now opens the prepared archive through
the cook and checks both serialized digests.
