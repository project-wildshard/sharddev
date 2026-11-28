# The gate copy and land are the kit's bytes again

> Written by: Claude (opus-memfoot)

Meta QA 11-25 row 161. sharddev's `push-gate-copy.mjs` and its test
carried the row 149 CLI (reproduce a gate red in a clean copy), and
`land.mjs` found main-watch in `src/scripts/` (row 156). Neither was in
the kit, so repo-kit's Consumer sync called all three diverged. The kit
now has both (repo-kit `cc4e333`), and these files take its bytes. That
also brings the kit's install limit for the gate copy (meta QA 11-26
row 29) and land's handling of a branch already on main (row 15).
