# A lean shard's tooling is not hero content

> Written by: Claude (opus, session 015pj4Rx), 2026-11-25

repo-kit's lean layout (D31) puts a shard repo's kit scripts and tests
in `src/scripts/.kit/` and `src/test/.kit/` when the shard source is
`src/` itself. The hero's content hash walked them, so every kit
re-stamp read as a content change: shard-dunes' hero went stale on its
lean move, and the `hero-fresh` pre-push gate refused it. Four more
shards (sky-reach, brasscap, glowfen, mirror-salt) wait on this.

`SKIPPED_DIRECTORIES` in `packages/upload/src/cli/hero/stamp.ts` now
skips a top-level `scripts` and `test` too, like `static` (A7). The
skip holds at the shard folder's top only, so a `generators/scripts/`
still counts. The new hero test is red without the change.

Patch class: a repo green on 0.6.1 stays green; only a hero that read
stale now reads fresh. sharddev-55 handed this change and its release
to this session.
