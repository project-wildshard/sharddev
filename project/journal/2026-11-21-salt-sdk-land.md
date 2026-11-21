# Land Mirror Salt SDK support

> Written by: Codex

> **State:** MSZ21 SDK landing, 2026-11-21.

Lane: codex-tc48. Rebase the three held commits e1b3cd99,
447d513a and b83763e4 onto main after the MT3 upload marker.
They lower personal finds and their locks, compile the current
workspace schema for build, and render the local cooked map.

The five state tests and one map test pass. The CLI regression
for current race fields and step feedback passes. A full direct
CLI test saw the other lane's uncommitted Mossgate world and
correctly refused its stale hero. The normal push gate uses a
clean copy of this commit and cannot include those peer edits.
SDK 0.4.23 will tag the exact green release branch.
