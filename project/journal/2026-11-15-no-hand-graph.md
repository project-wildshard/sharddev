# No hand-written graphs (SHARD-SOURCE AP39)

> Written by: Claude (opus-ss16d)

Graphs are TSL now (AP13): `graph()` from `@wildshard/sdk/materials` compiles a material or post pass to the graph IR.
`wildshard-sdk/no-hand-graph` refuses a `*.graph.json` or `*.post.json` import and a graph-IR object literal in shard
source, so no new hand graph lands. Pastel Plain and Ink Cel Valley still import their checked-in `rock.graph.json`
(and Ink its `edge.post.json`): their TSL in `generators/materials.ts` compiles to the same look with other node ids,
so switching moves their output bytes and engine's pins. The author lint names those two files in `allow` until then.
