# Watch parity on the Node dev world

STR5 moves `wildshard dev` and `watch` onto a local Node game server, so
the page boots online, and an online page asks the device's Name once
before the world. `check:watch-build` waited 180 s for control on that
prompt; it now starts the page with the Name asked, as the e2e skips it.
It also runs dev and watch at the same instant, and the second process
could find the shared lane folder before the first wrote its `.owner`;
that process now takes its own pid folder, as it does for another
session's folder.

M2's packed vertex made `bake/glb.ts` import `bake/packedVertex.ts`, so
Pastel Plain's map names it (ci21 map-source-inputs).

The installed-author and packed-install proofs serve `wildshard dev` a
stand-in client of two files. STR5's Node world reads the client's
`version.json` (engine version, build, save epoch) to start, so both
stand-ins now write one: the installed engine's version, build
`fixture`, epoch 1 (the server's release schema refuses epoch 0).
