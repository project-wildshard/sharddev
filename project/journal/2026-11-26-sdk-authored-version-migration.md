# 2026-11-26 — Migrate the authored shard version

RL2 rejects a previously accepted upload if its authored header omitted
shardVersion. Class: breaking SDK minor under D29. The migration fills an
absent header field from its owning package, and reports an explicit
disagreement for the author to resolve before rebuilding.
