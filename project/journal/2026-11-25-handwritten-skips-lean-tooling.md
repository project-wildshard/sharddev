# A hand-written lean shard packs without its tooling

> Written by: Claude (opus, session 015pj4Rx), 2026-11-25

shard-stranger is a hand-written shard whose source is `src/` itself.
Since repo-kit's lean layout (D31) its kit scripts and tests sit in
`src/scripts/.kit/` and `src/test/.kit/`, and format's `pack` refuses
any file the index does not list: on sdk 0.6.2 `wildshard check`
failed with "Unlisted output file: scripts/.kit/agent-marker-check.mjs".

`settleHandwritten` now packs a copy without a top-level `scripts/` or
`test/` when the source holds one; a shard file folder never uses
either name. The source itself is untouched. The new seed test is red
without the change. Patch class, like the hero fix (7ad8cd42).
