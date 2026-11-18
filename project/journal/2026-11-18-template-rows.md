# The Template's rows, one file per row kind

> Written by: Claude (opus-ss2), 2026-11-18

SHARD-SOURCE AP36b. The Template's `data/rows.json` held seven row kinds in one 670-line file. It is now
`data/rows/<kind>.json`, one file each, the layout Brasscap uses, and `generators/rows.ts` joins them in the
section's order. The other gameplay sections were already one file each under `data/`.

Proof: two builds of the Template give the same sections, and every gameplay section matches the AP36a build
(`10aad0ff`) byte for byte. The ci21 template cases, the warden, skin-lifetime and net-climate tests pass.

`data/` keeps its name: the sdk's map settings (`data/map.json`) and `new`'s card (`data/card.json`) read it.

Found, not fixed: `scripts/bake/template-kit-creatures.mjs --check` was already stale at HEAD (the kit preset now adds
the boar's `harvest`, which neither project's rows carry). The script now reads and writes the split files.
