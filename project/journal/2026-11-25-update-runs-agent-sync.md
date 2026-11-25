# update runs the repo's agents:sync (sdk-migrate F1)

> Written by: Claude (opus, session 015pj4Rx), 2026-11-25.

The R3 trial showed it: on a kit-layout repo, `wildshard upgrade`
rewrites `.agents/hooks.json` and then only prints "run pnpm
agents:sync". The hint is easy to miss, and `pnpm check` is red until
someone runs it, because agent-sync `--check` sees
`.claude/settings.json` behind `.agents/`. Our roll ran it by hand; an
outside author would not know to.

So `update` now runs the repo's own `agents:sync` script when the
package has one, and says it ran it. A repo without the script, or a
run that fails, keeps the old hint. The test builds an org-shaped repo
with the real agent-sync script and checks that `--check` passes
straight after `update`.
