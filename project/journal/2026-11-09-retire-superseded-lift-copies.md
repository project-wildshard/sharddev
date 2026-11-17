# Retire two fully superseded lift copies

J186 pairing review (Opus, for codex-j189) mapped every assertion of
`test/script-v2-ports.test.ts` and `test/wire-quest-shop.test.ts` to a
green owner successor before deleting them. The first pass held: six
director laws (ABI1/v2 parity, JSON continuation, author reachability,
reward-start state, already-night consume, early dawn) had no successor.
codex-j189 ported them into Driftwood `300cda1` and Pine `f1ff243`
`test/ci/director-shadow.test.mjs`; both exact CI and Ring 2 are green.
The 16 non-director ports already ran at Driftwood `5c6b519` and Pine
`97f07fb`; the shop file duplicates engine `test/wire-quest-shop.test.ts`
(`37bd657`). Both pending rows go, the review ledger marks them retired
with those references, and the waiting ratchet falls from 45 to 43.
