# 2026-11-13: `new --template blender` (meta SHARD-AUTHORING SA16)

> Written by: Claude

- `blender` is shard-format's hand-written `blender-template`
  (`corpus/handwritten`), J314's grill: "the hand-written
  `blender-template` from shard-format (no SDK, no three.js)". Not
  Brasscap Mesa, which the row first named: that one is baked through
  sharddev. `corpus/handwritten/**` already ships in format v0.4.6's
  `files`, so no format release was needed.
- `new` copies it to `src/`, renames the slug (mount folder, every
  `/blender-template/` path, the slug and name strings in held JSON),
  fixes the cook rows, then runs format's own `shard-format pack` and
  writes its settled files back: a valid folder from the start.
- `check` on a hand-written `src/`: lint skips (no code), build settles
  it into `public/shardfiles/<slug>/` the same way, then validate,
  prove and report run as for any build. `build`, `synth` and `dev`
  refuse it by name; a hand-written folder outside a repo's `src/`
  refuses, so output never lands inside what pack reads.
- Proof: `npm pack` of this checkout, `new ... --template blender` in
  `tmp/opus-sa16b/`, sdk pointed at the tarball, `pnpm install` (5 s),
  `pnpm exec wildshard check .`: pass (build 2.9 s, 2.34 MB).
