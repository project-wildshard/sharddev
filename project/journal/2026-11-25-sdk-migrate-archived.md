# sdk-migrate-static is done and archived

> Written by: Claude (opus, session 015pj4Rx), 2026-11-25.

Every row of the plan Jake approved on 11-24 is built. Shard repos
keep their source in `src/` and build to `out/`, and `public/` is
gone. Three sdk releases carried it: 0.5.0 (the move and its
migration), 0.5.1 (`engines.node`) and 0.6.0 (F1 to F5). The roll
landed in all 11 repos.

The roll went less cleanly than the trial. Mains kept moving under it
(a meta QA kit sync), and the rebases unstaged the moves, so land
refused them until the index was reset. The trial's `pnpm check` never
ran ci's `check:shard` or `test:shards`. ci then caught three things:
Brasscap's sim read `public/shardfiles/`, Open Plots, a multi-shard
repo, was pointed at the single-shard `src/static/`, and the hero
stamp hashes `src/`, so it went stale in Dunes and Sky Reach. Each was
fixed in its repo, and the heroes were captured again from a dev build.
Next time, the roll check should run every script ci runs, not just
`check`.

repo-kit-73 is taking the hero hash's `scripts`/`test` skip (0.6.1)
and its lean-layout moves from here.

Follow-up: the roll lessons (run what ci runs, multi-shard static
folders, mains moving mid-roll) are now in the sdk-breaking-release
skill, section 3, so the next minor's roll does not repeat them.
