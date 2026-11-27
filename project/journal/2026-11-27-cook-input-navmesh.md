# The product carries the platform navmesh (SF7c)

Nine Dragon and Signal Dunes both held `/assets/<slug>/baked/navmesh.bin`
in static/ but left it out of `mounts.json`, and their builds stopped on
the standalone-art check ("Missing shardfile asset .../navmesh.bin").
Driftwood, Far Reach and Pine list theirs by hand.

That URL is the platform's (`navigationSourceRows` names it), not an
author choice, so `readCookInput` now carries it whenever the shard holds
it and `mounts.json` exists, the way NINE QA 53 carries fenced originals.
Listing it stays harmless: it is carried once. No author edit or
migration is needed, so every zone on the old habit builds as is.
