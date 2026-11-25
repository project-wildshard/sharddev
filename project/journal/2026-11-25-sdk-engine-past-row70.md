# The SDK drops the species book re-export, ahead of its engine bump

QA 11-24 row 70 (opus-nalati2). shard-nalati's ci21-source stays red until an SDK pins an engine past `279b5ed0d`
(format 0.79, grass without cards). Engine main deleted `looks/speciesBook.ts` in FP20 (`5dac625fc`), so against a
linked engine main the SDK's `internal/engine/game/looks/speciesBook` re-export and its hull-look-book test fail
(headless-entry's internal-row test and the test file itself). This takes only those hunks of opus-prune2's
`plan/fp20@85bc9932` (not its kit melee-profile change, which needs FP22e's engine). shard-nalati `0b97cf5` stopped
reading the re-export, and the refreshed census lets `sdk-exports check` pass.

Left for the release lane: the engine pin (an engine next past `279b5ed0d`, none on npm yet) and format 0.79.3 (Node
<27; not on npm yet), with `wildshardStagingClients` and devClient.test.ts naming the new build.

Node 26 (QA 11-25 row 69's SDK half, opus-nalati2): every package's `engines.node` moves to `<27` and the 23 files
that passed `--experimental-transform-types` stop (Node 26 refuses it; engine main is strip-only since `66fa7cd9e`).
The removed export makes the next SDK a minor, so `codemods/0.7.0.mjs` (with `test/node26-codemod.test.ts` and GUIDE
`migrate-0-7-0`) moves a shard repo's Node cap, drops the flag from its scripts and names every other file that passes
it. On Node 26.13.1 against a linked engine main: typecheck green, sdk 1411 of 1413 (2 skipped), content green; dev
fails only devClient (a linked engine is no prerelease) and dev-signal (a linked worktree has no
`dist/dev-server/bundle.json`), both the engine pin's to clear.

The pin (opus-nalati2, after engine v0.1.93's npm next went out): `@wildshard/engine` 0.1.93-next.4daadc70 (carries
`279b5ed0d`, `e477966a3` and the strip-only engine) and format 0.79.3 (Node <27) in every package; the dev client map
and devClient.test.ts name build `4daadc70f0`. `pnpm check` green on Node 26.13.1, dev-signal and devClient included.
