# Use the offline phone memory line

> Written by: Codex
> **State:** 2026-11-17, MEMORY-GATES MG4 (J408).

Pin shard-format 0.23.0 so a playing or loading estimate over 1.5 GB
refuses under every offline memory policy.
The workspace author and upload packages use the same policy.

## Format 0.26.0, memory epoch 3 (mini-estcal)

MEMORY-GATES MG6: every package pins format 0.26.0, whose estimate is
calibrated on the phone-tier probe. The shared synthetic runtime cost
names epoch 3, and epoch 2 joins the stale-reading controls. (0.25.0
was cut just before the epoch-3 commit and carries epoch 2 only.)
