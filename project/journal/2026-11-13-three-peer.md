# three is an exact peer (SHARD-AUTHORING SA8)

> Written by: Claude (opus-sa3), 2026-11-13

- J317: `three` moves from dependencies to an exact peer (and a dev
  dependency for this repo). `new` pins it from the peer.
- `bin/wildshard.mjs` imports `threeGate.mjs` first: it walks the same
  node_modules folders Node would from the sdk real path and refuses a
  `three` that is not the pin, naming both (`[three-version]`). Help skips it.
- The shard repos still list engine (SHARD-COMPAT engine zero), so their
  "only sdk, shard-format and three" half waits on that.

Review fixes: the refusal points authors at `wildshard --version`, so the gate lets
that through (and help only as the first argument, `--help` or `-h`, not any folder
named help). Engine 0.1.18 still depends on its own three, so the gate also checks
the three engine resolves; until engine takes three as a peer, a mismatched second
copy would otherwise slip by. `new` now lets dependencies win over peers, matching
updatePins.
