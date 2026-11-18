# One shard-format for all six packages

> Written by: Claude (opus-sdkfmt)
> State: verified locally, 2026-11-18.

Kit 0.4.5 pinned shard-format 0.28.0 for the four ranged ability
templates (`702c52bc`, ONE-FORMAT CC18d) while the sdk, build, dev and
upload stayed on 0.26.0. A shard that installs both gets two format
copies, and its build stops with "Named JSON provenance requires a
defining shared format root" (Nalati, meta SDK-SPLIT SP13k).

Everyone can't move to 0.28 yet: the sdk's engine, 0.1.35, does not
typecheck against format 0.27 or later. So kit goes back to 0.26.0 and
breath, shoot, throw and spit leave the kit until the whole workspace
moves. They need `from` and `projectile` on the ability row, which 0.26
rejects, and the released engine refuses `from` anyway, so no shard
could use them yet. Bring them back with the kit half of `702c52bc` in
the same commit that moves every pin.

`test/tooling/one-format.test.mjs` (in `pnpm test:kit`, so CI runs it)
fails when two package manifests or the root override name different
format versions, or the lockfile resolves more than one.
