# 2026-11-17 engine folder names (opus-ss10f)

Engine 0.1.35 carries SHARD-SOURCE SA25a: `product` left the engine's
exports (J317). `host/headlessProduct` is `host/headlessFolder`,
`game/shardfile/shardProduct` is `shardFolder`, and 38 names a consumer
imports moved the same way (`loadHeadlessProduct` to
`loadHeadlessFolder`, `captureProductInputs` to `captureFolderInputs`).

The sdk and dev packages pin engine 0.1.35, and their 55 files that
import those names take the new ones, moved by the same codemod a shard
repo gets. A handful name them inside strings the codemod does not read
(a child script, the CI21 integrity record, a retired engine path) and
were moved by hand. Rebuilt over SDK-SPLIT's packages/dev move.

`codemods/0.4.0-folder.mjs` is that codemod. It is named as a
prerelease of 0.4.0, because SDK-SPLIT's kit move already owns
`0.4.0.mjs`, and `update --pins` runs every `<v>.mjs` with
from < v <= to, oldest first: a move to 0.4.0 runs the folder rename,
then the kit move. Only files that import from `@wildshard/engine`
change, and only the names each one imports from it, so a shard's own
`createShardProduct` keeps its name.
