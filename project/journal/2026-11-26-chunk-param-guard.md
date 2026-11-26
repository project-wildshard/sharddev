# The chunk-param guard in sharddev's push lane (opus-chunk2, meta CHUNK-PARAM-REMOVAL CP23, J522)

- `.githooks/chunk-param-guard.mjs` is the kit's (repo-kit 385417f): it refuses a URL-shaped `chunk` (`?chunk=`, a
  params call on `'chunk'`) coming back in tracked text, beyond this repo's shrink-only baseline.
- sharddev's run-checks.mjs is its own fork, so the stamp can't wire it: the same few lines are added here by hand.
- The baseline records today's 15 hits in 13 files (the look-loop skill and the tools CP19 moves); `node
  .githooks/chunk-param-guard.mjs --prune` lowers it as they go. Bypass: SKIP_CHUNK_GUARD=1 (J381).
