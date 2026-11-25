# `wildshard update` in repo-kit repos, and `--guide` (A8)

> Written by: Claude (opus, session 015pj4Rw). Ask A8, from another
> agent's feedback that Jake passed on.

- The bug: `update` wrote the four skills as real folders in
  `.claude/skills/` and linked `.agents/skills/` to them. repo-kit's
  agent-sync keeps skills the other way round, so in an org shard repo
  (shard-showcase) `agent-sync --check` went red the moment `update`
  ran.
- The layout now comes from the same signal sessionHook.ts already
  used: `.agents/hooks.json` means agent-sync. There, `update` writes
  real `.agents/skills/<name>/SKILL.md`, never touches `.claude/` (no
  skill folders, no links, no settings.json hooks), and tells you to
  run `pnpm agents:sync`, which writes the links. A leftover
  default-layout link in `.agents/skills/` is left alone, and the
  output prints the command that fixes it, because moving folders
  under `.claude/skills/` is sync's job, not ours.
- `--guide <path>` is saved in package.json as
  `"wildshard": { "guide" }`, beside the migration stamp. A flag on
  its own wouldn't be enough: `upgrade` runs the new sdk's `update`
  as a child process and `migrate` calls `updateShardRepo` directly,
  so neither would see the flag, and both would drop a fresh
  GUIDE.md at the root again. `--guide GUIDE.md` drops the key.
  The old copy is left for the author to delete (the output says
  so), and an untouched AGENTS.md that `new` wrote follows the guide
  to its new path.
- Dry run on a scratch clone of ../shard-showcase (nothing committed
  there): `update --guide docs/GUIDE.md` wrote 8 files, none under
  `.claude/`; `agent-sync --check` was red until `agents:sync`, green
  after it; a second `update` said "already up to date".
- Exit: A8's status now names `b6214533`. Rolling it into Showcase
  (`--guide docs/GUIDE.md`, `agents:sync`) is row R4 of the
  sdk-migrate-static plan, after 0.5.0 ships.
