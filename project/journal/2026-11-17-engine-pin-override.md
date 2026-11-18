> Written by: Claude
> State: done, 2026-11-17.

SHARD-SOURCE (opus-ss10l, found by opus-ss10k): `enginePin()` read only the dev package's
declared `@wildshard/engine`, so a shard overriding the engine (Glowfen and Mirror Salt: sdk 0.4.3
with an engine 0.1.39 override) had prepare and dev fetch v0.1.35's clients. A version pin now
yields to the engine installed beside the package (its own node_modules, else the node_modules it
sits in); a commit pin stays, since an engine built from a commit names no commit.
