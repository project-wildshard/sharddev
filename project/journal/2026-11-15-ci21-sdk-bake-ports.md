# CI21 SDK bake ports

> Written by: Codex

> **State:** held on plan/ci21-sd, 2026-11-15.

Eleven SD-BAKE destination files passed 73 focused cases locally; nine
can be committed under this repo’s 1 MiB file cap. Every original
negative control remains, including encoder ordering/allocation refusal,
immutable source hashes, renderer-free kernels and config-safe bundling.
The author placement contract's expectTypeOf assertions also pass a real
tsc project against the declared engine, not just Vitest's stripped code.
J206 is clear, with no MUST-FIX.

Uniform tile production has its two SDK cases. The two engine reader cases
are in engine plan/ci21codexeruntime test/uniform-tile-readiness.test.ts,
with an independent 64-row zero-cost fixture and no SDK import; both pass.
The original four-case engine file remains excluded until both sides can
be published and the disposition/inventory update can name their commits.

Fixtures preserve original bytes and no source link:

- native-support-points.ts: engine test/fixtures copy unchanged.
- storm-roc.glb and sky-goat.glb: shard-sky-reach test/fixtures/sky-rigs
  at 03d234378fa8df9e524a34b18f495ddef8002cd1.
The two phone-oracle files, basis-glb-variant and glb-embedded-basis,
remain blocked. Their recovered original is singleplayer deb62916f4^:
public/assets/gpu/far-reach/rigs/storm-roc-70e5655f.glb, 2,053,504 bytes,
hash beginning 70e5655f. Gzip is still 1,571,480 bytes; no cap change or
chunking is used. They need a MacBook-published immutable fixture artifact
that CI can prepare, then the same byte oracles can join the suite.

Every source case remains represented across the split. There is no new
skip, retirement, deadline or budget change, and no engine inventory
removal before the destination is published.
