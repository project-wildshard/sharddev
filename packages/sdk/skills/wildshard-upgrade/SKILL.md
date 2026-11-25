---
name: wildshard-upgrade
description: Upgrade a Wildshard shard repo to a newer @wildshard/sdk and run its migrations. Use when asked to upgrade the sdk or migrate, when a command refuses with migration-pending, when a session starts with a `wildshard: ... has not run in this repo` line, or for a breaking change in a new sdk.
---

# wildshard-upgrade

On 0.x a patch (`0.4.x`) never breaks a shard repo; every break bumps the minor (`0.5.0`) and ships a **migration**
that moves the repo, plus manual steps for what no script can change safely. `GUIDE.md` at the repo root holds
the facts (`GUIDE.md#7-upgrading-and-migrations`); a pointer `GUIDE.md#<anchor>` is the guide heading with that anchor.

Pick the branch:

- **Moving to a newer sdk:** `pnpm dlx @wildshard/cli upgrade [version]` (default npm's latest; once installed,
  `pnpm exec wildshard upgrade [version]`). It moves the pins, installs, runs `migrate`, then `check`.
- **The sdk is already installed** (bumped by hand or by a bot) and a command refused with `migration-pending`, or
  `wildshard status --brief` printed a line: `pnpm exec wildshard migrate`.

## The steps, in order

1. **Start clean.** Commit your own changes. Done when `git status` is clean; both verbs refuse a dirty tree
   (`GUIDE.md#update-pins-dirty`).
2. **Run the branch's command.** Done when it ends: `upgrade`'s last line reads `on @wildshard/sdk <version>, check
   pass` or names a refusal; `migrate` prints its report.
3. **Reread this skill and the guide:** the command rewrote both from the new sdk. Done when you have read the new
   `.claude/skills/wildshard-upgrade/SKILL.md` and each `migrate-<version>` heading (`GUIDE.md#migrations`) the
   report names.
4. **Do every manual step.** Under `Manual steps` the report names a file and what to change there. Done when each
   one is made.
5. **Check:** `pnpm exec wildshard check .`. Each refusal ends `[<rule>] fix: ... (GUIDE.md#<anchor>)`: read that
   heading under `GUIDE.md#6-refusals-and-their-fixes`, make the fix, run check again. A budget can tighten between
   releases (`GUIDE.md#3-budgets`); a lint rule can be new. A refusal from `upgrade` itself is
   `GUIDE.md#update-pins`. Done at `check pass`, with `wildshard status` showing `pending migrations: none`.
6. **Commit** `package.json`, `pnpm-lock.yaml`, the guide, the skills, the agent files, every migrated file and your
   fixes together. Done when `git status` is clean. Before the next upload, follow the `wildshard-goldens` skill:
   a new sdk can change how the shard looks.

## Rules

- Move the pins together, never one alone: the sdk is built and tested against the others it names. `upgrade` does.
- Run the migration; never hand-edit the stamp (`package.json` `"wildshard": { "migrated" }`) to silence the
  refusal. Only `migrate` and `new` write it.
- Fix the shard source to the new rules; do not pin an older piece to dodge a refusal.
- If a migration fails, or check fails on source you did not change and the fix does not apply, put the repo back
  with git and report the message with both sdk versions.
