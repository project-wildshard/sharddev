# A shard repo's agents hear about a pending migration (A7, M5)

> Written by: Claude (opus, session 015pj4Rw). Plan
> `docs/plans/opus-2026-11-24-sdk-migrate-static.md`, row M5.

- Jake, 2026-11-24: how does an outside author's Claude know to
  "upgrade and migrate"? `new` and `update` now give the repo a
  SessionStart hook running `wildshard status --brief`: one line
  while a migration is pending, silence otherwise.
- Two shapes. A plain repo gets it straight in `.claude/settings.json`
  (`hooks` key; other keys kept) and `.codex/hooks.json`. Our org's
  shard repos generate those two files with repo-kit's agent-sync, so
  writing there would be erased, and `agent-sync --check` would call
  them stale. There it goes in `.agents/hooks.local.json` (the repo's
  own spec; the kit's `hooks.json` is replaced on every stamp), with
  a script `.agents/hooks/wildshard-status.sh`, because a spec entry
  names a script, not a command, and parity refuses inline commands.
  update's output then says to run `pnpm agents:sync`.
- Merge rule: the first handler whose command holds
  `wildshard status --brief` becomes ours (an older spelling updates
  in place), later copies go, the repo's own hooks stay. A file that
  is not valid JSON is left byte for byte and named in the output.
- The command is `pnpm exec wildshard status --brief 2>/dev/null ||
  true`: before `pnpm install` pnpm can't find `wildshard` and
  exits 254, and a hook must never fail a session start. `status
  --brief` itself now says nothing when the repo has no
  `node_modules` (no installed sdk to ask; the CLI's own would guess).
- The test runs this repo's copy of agent-sync on the result, so the
  spec entry is proved to render for both tools.
- `new` also stamps the repo at its sdk's version: its source is that
  sdk's layout, so nothing is pending on day one.
