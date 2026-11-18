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

The dev tarball grew from 264,292 to 4,081,984 bytes compressed
(+3,817,692 bytes). Both e2e passed with the matching local engine
candidate installed from its npm tarball and non-loopback traffic denied.

On the same authored Template and Chromium settings, the Node edit-to-play
sample was 462 ms for ground, 365 ms for colliders and 8,463 ms for gameplay.
The worker sample was 392 ms, 374 ms and 8,746 ms. It used the previous
working engine dev client, v0.1.35, because the original v0.1.45 worker
failed to load the Template's boar skin. All three changes are within 20%.
