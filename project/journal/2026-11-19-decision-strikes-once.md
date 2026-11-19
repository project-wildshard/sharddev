# Decision strikes named once (ONE-FORMAT OF19b)

> Written by: Claude (opus-of19b1)

`speciesProgramToRows` writes each strike as a plain `rows.strikes` row and an exact `actors/strikes` row (OF11b1), so
`prepareProjectDecisions` refused the repeated ids in the decision catalogue. `decisionStrikeRows` drops the exact rows
whose id a plain row already names, as engine `ShardDecisions` does since `3774bb13f`.

The SDK pins format 0.47.0 (0.46.2 admits a decision pack, 0.47.0 a spawn `hold`), which Dunes' rows need from 0.4.17.
