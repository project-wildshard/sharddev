# Retire three ported lift-pending copies (ENGINE-MOVE-CLEANUP PG3)

Meta ENGINE-MOVE-CLEANUP-PLAN row PG3 (J254). Three excluded duplicates
already had green successors in their owners' CI: `headless-observation`
(sharddev `test/ci`, `cef628c`), `native-collider-block` (shard-nalati
`e3c72fe`) and `native-floor-shards` (driftwood `babb4fa`, pine-hollow
`9d7e908`). They were kept only for an owner to retire, so they go now.

- Deleted, dropped from `lift-pending.json`, and marked `ported` in
  `lift-review.json` with their successor proofs kept.
- `check-lift-review` ratchet 43 to 40, and a `ported` row must be gone
  from the tree and the queue and name a successor repo, file and commit.
