# STR5 and STR6. The author world runs in Node

`wildshard dev` and `wildshard watch` start the dedicated author server on
loopback. They stamp a local signed release into the client and use the
server bundled with the engine package. Packing the dev package copies that
bundle. The author folder stays the server's input and its hashes are checked.

Watch keeps the existing scene stream for ground and collider edits, which
the online client forwards to the Node control channel. Gameplay changes
rebuild the shell and replace the server process, keeping the loopback
socket address and the session's database. A failed replacement can reopen
the previous build.

The dev and watch E2E run the packed outside author's starter and assert
player control without a server worker. Watch checks both control replies,
then the new release serial and the edited quest visible in play.

The dev tarball grew from 264,042 to 4,102,009 bytes compressed
(+3,837,967 bytes). This compares sharddev main `e512107` to the Node
author package built with the local engine archive from `0a1cc721`.
Both packed e2e passed after provisioning its matching dev client
and denying non-loopback traffic. Engine, SDK and kit used format 0.41.1.

With the same client and authored Template on both paths, worker and
Node edit-to-play measured 459 and 493 ms for ground, 432 and 458 ms
for colliders, and 9,393 and 10,028 ms for gameplay. The Node deltas
were +7.4%, +6.0% and +6.8%. Only the worker path started a server worker.

The dev package declares the socket service's exact PGlite extension peers,
as engine does. A fresh strict pnpm install passed without peer exceptions.
The author world opens its database with core PGlite.

Watch leaves its signed release endpoint available until an in-flight
rebuild finishes during shutdown, then closes the world and the page.

Both packed offline E2E tests also passed with engine `c7d87608` and
format 0.43.0 on sharddev 0.4.11. Repeating the proof on sharddev
`3cbcec3` with the local engine archive and dev client built from
`1847f5c5` passed both offline E2E tests with format 0.44.0.
The three SDK parity files now import the format laws the engine uses.
Their 13 cases passed against both the current 0.1.44 workspace pin and
the local archive.

The published dev 0.4.12 tarball is 264,042 bytes compressed. The
0.44.0 candidate is 4,033,466 bytes, an increase of 3,769,424 bytes
for the 15 server and launcher files. The plan's registry pin awaits
the compatible engine archive and matching client.

On that same paired 0.44.0 build, worker and Node edit-to-play took
437 and 425 ms for ground, 422 and 426 ms for colliders, and 9,137 and
8,694 ms for gameplay. Only the worker path started a server worker.

The engine retired the old author bake implementations in `1c9ab9d3`.
The SDK's geometry, voxel AO, placeholder and meadow parity tests
continue to compare with those independent implementations through a
test-only alias to engine 0.1.44. RNG and terrain tests use the same
format modules as the current engine.

After J434 changed the starter to Mossgate, both packed offline E2E
tests passed again on sharddev `cbc6a95`. The matching engine source
`161063f3` uses format 0.45.0 and the archive includes the exact wire
pin from `f773a958`. The watch test changes ground, one hut collider
and the starter's quest objective.
