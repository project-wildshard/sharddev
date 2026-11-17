# Plain `wildshard prepare` serves the candidate's mounts (S12f)

SHARD-SIZE S12f found that `wildshard prepare <folder>` with no
`--base` timed out on sdk 0.2.12. Before that, someone had served the
discovery file by hand, and the page loaded Driftwood instead of the
prepared shard.

## Cause

A built product keeps its mounted files (what its boot reads first:
`/shardfiles/<slug>/discovery.json`, and the public files it owns)
under `mounts/<url>`, or in a blob when a blob already has the same
bytes. `cook.json` lists every one with its URL and path. The SA43
preview mapped `/shardfiles/<slug>/x` to `<product>/x` and everything
else to the client first, so the candidate's discovery answered 404.
The headless page stopped at "The game failed to start at step
'modules' (Error: Discovery of far-reach answered 404)", and the
recorder waited until its 300 s timeout.

## Fix

`scripts/preparation-preview.mjs` reads the candidate's `cook.json`
and serves each mount at its URL from the path the table names,
before anything else. The candidate owns those URLs. The same
`inside()` guard applies, so a path outside the product answers 404.

I tested on Sky's built `far-reach`. Through the fixed preview the
headless page enters Far Reach (the keeper, the floating islands), not
Driftwood. The Driftwood boot was the catalogue's fallback once the
candidate's discovery was missing. Plain `wildshard prepare` on a copy
of the product passed in 7 s: 86 programs, fence 172, engine
v0.1.18's preparation client.

`test/preparation-preview.test.ts` gained a case: discovery under
`mounts/`, a mount kept as a blob that wins over the client's file of
the same URL, and a `../` path refused. It fails without the fix.
