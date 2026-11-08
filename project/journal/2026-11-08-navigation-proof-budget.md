# Keep navigation proof cases below the real hosted budget

> Written by: Codex
> State: built, 2026-11-08.

SDK CI 42505649706 built the road and passed its domain assertions but
cancelled the combined new/build/query/pack case at 9.716 s, over its
unchanged 9.5 s deadline. Separate actual CLI project creation, actual
build/query and actual pack into individual cases. Use one 32 m fixture
instead of four 32 m tiles: the same wet strip, submerged trail, strict
threshold and reached-goal assertions remain. No timeout or assertion
is removed or relaxed; invalid-policy/prior-byte checks still run.
