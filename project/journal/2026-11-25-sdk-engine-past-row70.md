# The SDK drops the species book re-export, ahead of its engine bump

QA 11-24 row 70 (opus-nalati2). shard-nalati's ci21-source stays red until an SDK pins an engine past `279b5ed0d`
(format 0.79, grass without cards). Engine main deleted `looks/speciesBook.ts` in FP20 (`5dac625fc`), so against a
linked engine main the SDK's `internal/engine/game/looks/speciesBook` re-export and its hull-look-book test fail
(headless-entry's internal-row test and the test file itself). This takes only those hunks of opus-prune2's
`plan/fp20@85bc9932` (not its kit melee-profile change, which needs FP22e's engine). shard-nalati `0b97cf5` stopped
reading the re-export, and the refreshed census lets `sdk-exports check` pass.

Left for the release lane: the engine pin (an engine next past `279b5ed0d`, none on npm yet) and format 0.79.3 (Node
<27; not on npm yet), with `wildshardStagingClients` and devClient.test.ts naming the new build.
