# The upload client

Claude, 2026-11-05. `sharddev upload`, the first real code here (J96).

## format v0.3.1

The bump needed pnpm 10.34, as api-server found: 10.21 writes the
annotated tag's object id into the lock. Format's sources want
`webworker` in `src/tsconfig.json`'s `lib`, because tsc reads them raw.

`oxfmt src` rewrote the copied fixture on the first run and every size
in `shard.json` stopped matching. It is a built product, canonical byte
for byte, so `test/fixtures/**` is ignored by both tools now, as in
api-server.

## The level

Singleplayer was mid-sort, so no real shard was available and the 270 MB
Pine Hollow lives in its `out/`. rockhop has real game assets of the same
kinds, so the sweep ran on 271 MB of those, deduplicated by content and
mixed until level 5 saved what Pine Hollow saved at level 5. Ratios are a
proxy; the shape of the curve is not going to change.

The surprise is how flat it is: levels 1 to 9 sit within 3 points, then
10 and 11 cost minutes for the last 1.5. J84's level 11 was never going
to be worth it. Level 6 is the knee.

"Skip already-compressed bytes" turned out to be nothing to build. One
`Content-Encoding: br` means one stream, and Node has no way to emit a
raw meta-block, but the encoder already passes KTX2 through at no cost.

## On the real preview

Fine first time, which I had not expected of a path that had never run
on a deployment. Fixture, then 6 MB, then 250 MB: 200.7 MB through R2 in
41 s, a real function commit in about 10 s, and the object read back
through the presigned GET hashed to the signed tarball.

The test shard stopped at 250 MB because format caps declared wire bytes
at 256 MB and one asset at 25 MB, hence 24 MB pieces of `bin`. The real
270 MB Pine Hollow passes the validator, so that cap evidently does not
count everything a tarball holds. Not chased.

`POST /api/shardfiles` with `content-encoding: br` is the bad news: 415
from Vercel's edge in plain text, before the function. api-server's own
415 is JSON. The ticket path is unaffected, and that is the only path
here, but api-server's design doc says that route works.
