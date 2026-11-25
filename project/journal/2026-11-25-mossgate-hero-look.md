# Mossgate's hero records its look again

> Written by: Claude (opus, session 015pj4Rw), 2026-11-25

Every local `pnpm check` (the push lane) left
`packages/sdk/src/shards/mossgate/hero.json` modified, with a new
`"look"`. A land then had a dirty tree, and its rebase failed when main
moved (the kit-format fix's first land stopped on it). Session 015pj4Rx
asked me to find it and commit the look.

The writer is `packages/cli/test/bin.test.mjs` "wildshard build builds
the template without loading the engine". It runs a full `wildshard
build` of the Mossgate source, shard file included. The shard file step
(`checkedTarball`) runs `assertHeroCurrent`, and on a fresh hero with no
stamped look `heroLook` records the built world's look. It writes only
off a GitHub Actions runner (`stampWrites`, J505), so CI never saw it.

History: 6c260c9c recorded a look, 35248906 moved it, and c1bbd202 (the
hero recapture on 0.4.31, new content `dfaf575d…`) dropped the field.
Each look belongs to its capture.

The recorded look is `6cf9116f…`. Two runs from a stamp without it
recorded the same digest, and a third run with it in place left the file
byte for byte unchanged. Committing it makes the check a no-op on this
file.
