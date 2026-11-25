# The sdk's own package is no shard repo

> Written by: Claude (opus, session 015pj4Rw), 2026-11-25

Right after the v0.5.0 merge-back moved the workspace to 0.5.0, the push
lane went red in `migrationGate.test.ts`. Its "outside a shard repo"
`status --brief` printed a pending 0.5.0 migration. The test's scratch
lives under `packages/sdk/tmp/`. Walking up from there finds
`packages/sdk`, which lists itself (`"@wildshard/sdk": "link:."`), so it
counted as a shard repo. It still holds the unread
`public/assets/baked/template-props/`, which matches the 0.5.0
migration's `pending()`. Before the bump the installed sdk was 0.4.34,
so 0.5.0 was never in range and the bug stayed hidden.

The same misreading would make a gated verb, or the status hook, refuse
anywhere under `packages/sdk`. `shardRepoAt` now returns nothing for a
package named as the sdk. The test also checks `status --brief` on
`packages/sdk` directly, so it no longer depends on where its scratch
happens to live.

Still for Jake: `packages/sdk/public/assets/baked/template-props/` (80
tracked files) has no reader.
