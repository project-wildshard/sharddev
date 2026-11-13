---
name: wildshard-upgrade
description: Move a Wildshard shard repo to a newer @wildshard/sdk - its pins in package.json, GUIDE.md and the wildshard skills - then build and fix the refusals. Use when asked to upgrade the sdk or its pins, or when `wildshard --version` is older than the release you need.
---

# wildshard-upgrade

`package.json` pins `@wildshard/sdk`, `@wildshard/format`, `@wildshard/engine` and `three` exactly; a `--template
blender` repo pins only the first two, as dev dependencies (`GUIDE.md#2-the-shard-source`). Moving to a newer sdk
moves every pin together, then the shard source must build again on them. `GUIDE.md` at the repo root holds the
facts; a pointer `GUIDE.md#<anchor>` is the guide heading with that anchor.

**`wildshard update --pins` is not built yet (SA18).** It will move the pins, install, apply the release's code
changes, rewrite the guide and skills, and run the build (`GUIDE.md#7-wildshard-update`). Until it is built, do the
steps below by hand.

## The steps, in order

1. **Start clean.** Commit your own changes, then `wildshard check .` on the old pins; if it fails, fix that first.
   Done when `git status` is clean and check passes, so any later refusal is the upgrade's.
2. **Read the new pins** from the newer sdk's own `package.json`: its `version` is the `@wildshard/sdk` pin, and its
   `dependencies` hold the `@wildshard/engine`, `@wildshard/format` and `three` specs (engine and format are
   `github:` specs, not numbers). Today the sdk runs from a sharddev checkout, not npm (the guide's opening "Running
   `wildshard` today", `GUIDE.md#the-shard-authors-guide`). Done when you have each spec, copied verbatim.
3. **Edit the pins** in this repo's `package.json` to those exact specs: no `^`, no `~`. Done when every pin matches.
4. **Install:** `pnpm install`. A dependency's install script runs only if `pnpm-workspace.yaml` lists it
   (`GUIDE.md#2-the-shard-source`). Done when install exits 0 and `pnpm-lock.yaml` changed.
5. **Refresh the guide and skills.** Copy the sdk's `GUIDE.md` over this repo's, and each of the sdk's
   `skills/wildshard*/SKILL.md` to `.claude/skills/<same name>/SKILL.md`, adding any this repo lacks
   (`GUIDE.md#7-wildshard-update`). Then reread this skill: the new copy may differ. Done when `git diff` shows only
   those files and the step 3 and 4 files.
6. **Build** with the new sdk's CLI (point the `wildshard` alias at the newer checkout): `wildshard check .`
   (`GUIDE.md#1-the-loop`). Done when `wildshard --version` prints the new sdk version and the last line reads
   `check pass`.
7. **Read each refusal.** It ends `[<rule>] fix: ... (GUIDE.md#<anchor>)`: read that heading under
   `GUIDE.md#6-refusals-and-their-fixes`, in the guide you copied in step 5, make the fix, and run check again. A
   budget can tighten between releases (`GUIDE.md#3-budgets`); a lint rule can be new. Done at `check pass`.
8. **Commit** the pins, the lock file, the guide, the skills and your fixes together. Done when `git status` is clean.
   A new sdk can change what the shard looks like, so before the next upload follow the `wildshard-goldens` skill.

## Rules

- Move the pins together, never one alone: the sdk is built and tested against the others it names.
- Fix the shard source to the new rules; do not pin an older piece to dodge a refusal.
- If check fails on a shard source you did not change and the refusal's fix does not apply, go back to the old pins
  and report the message.
