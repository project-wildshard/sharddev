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

The dev and watch e2e run the packed outside author's Template and assert
player control without a server worker. Watch checks both control replies,
then the new release serial and the edited quest visible in play.

The dev tarball grew from 264,292 to 4,088,832 bytes compressed
(+3,824,540 bytes). Both e2e passed with the local v0.1.46 candidate
installed from its npm tarball, the matching client provisioned, and
non-loopback traffic denied.

Using that same v0.1.46 dev client on both paths and the same authored
Template, the worker and Node edit-to-play samples were 342 and 354 ms
for ground, 328 and 341 ms for colliders, and 7,526 and 8,108 ms for
gameplay. The Node differences were +3.5%, +4.0% and +7.7%.
Playwright observed a server worker only on the worker path.

The dev package declares the socket service's exact PGlite extension peers,
as engine does. A fresh strict pnpm install passed without peer exceptions.
The author world opens its database with core PGlite.

Watch leaves its signed release endpoint available until an in-flight
rebuild finishes during shutdown, then closes the world and the page.
