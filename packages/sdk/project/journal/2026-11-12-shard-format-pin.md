# Format pin is shard-format v0.4.4 (meta J308)

> Written by: Claude

Jake renamed the shardfile repo and package to shard-format (J308).
sharddev now pins `github:project-wildshard/shard-format#v0.4.4` under
the old `@wildshard/format` key, as both the dependency and the override
engine's copy follows. The key stays until engine renames its imports:
both names would install the same store directory, but engine and the
author SDK import `@wildshard/format`, so the rename moves with them.
v0.4.4 is v0.4.3 plus the rename, the engine-music slots (J304) and
AU5's audio measure hardening.
