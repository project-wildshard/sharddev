# The SDK test scratch folder appears with its owner

> Written by: Claude (opus-sf22)

Meta QA 11-26 row 42, a follow-up to row 34. codex-cookkeys' sharddev gate
failed four test files with "packages/sdk/tmp/codex-cookkeys already exists
with no .owner; pick another task name". `scratchDir` makes the folder,
then writes `.owner`, so a sibling vitest worker importing `ownedScratch`
between those two steps was refused; `closeFixtures` had the same window
when it removed `.owner` before the folder.

`ownedScratch` now stages the folder with its `.owner` under its own name
and renames it into place, so the shared folder never exists without an
owner; a rename that finds it there keeps the sibling's. A lane's shared
folder is no longer removed by the tests: the gate copy goes whole, and a
lane's `tmp/<lane>` is the lane's. Only a private `test-dev-<pid>` folder
is removed. The new test leaves the folder exactly as a sibling's
`scratchDir` does between its two steps; it fails on the old helper with
the gate's error.
