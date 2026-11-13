---
name: wildshard-upgrade
description: Move a Wildshard shard repo to a newer @wildshard/sdk - its pins in package.json, GUIDE.md and the wildshard skills - then build and fix the refusals. Use when asked to upgrade the sdk or its pins, or when `wildshard --version` is older than the release you need.
---

# wildshard-upgrade

`package.json` pins `@wildshard/sdk`, `@wildshard/format`, `@wildshard/engine` and `three` exactly; a `--template
blender` repo pins only the first two, as dev dependencies (`GUIDE.md#2-the-shard-source`). Moving to a newer sdk
moves every pin together, then the shard source must build again on them. `GUIDE.md` at the repo root holds the
facts; a pointer `GUIDE.md#<anchor>` is the guide heading with that anchor.

Run the newest CLI once to move, whatever sdk the repo is on now:

```sh
pnpm --package=@wildshard/sdk@latest dlx wildshard update --pins
```

`wildshard update --pins` does the move in one command (`GUIDE.md#7-wildshard-update`): it moves every pin to the
release, runs `pnpm install`, applies the release's codemods, rewrites the guide and skills, and runs check. An
installed 0.2.4 or older refuses the flag, and 0.2.5 refuses a repo that lists the sdk as `@wildshard/sharddev` or by
a GitHub pin, so start from the line above.

## The steps, in order

1. **Start clean.** Commit your own changes, then `wildshard check .` on the old pins; if it fails, fix that first.
   Done when `git status` is clean and check passes, so any later refusal is the upgrade's.
2. **Move:** `pnpm --package=@wildshard/sdk@latest dlx wildshard update --pins` for npm's latest sdk, or
   `--pins=<version>` in place of `--pins` for one release. Done when it prints a line per pin it moved.
3. **Read its last line.** `on @wildshard/sdk <version>, check pass` means the move is done: go to step 5. A line
   ending `[update-pins] fix: ...` is a refusal: read `GUIDE.md#update-pins` in the guide now in the repo;
   `[update-pins-dirty]` (`GUIDE.md#update-pins-dirty`) means go back to step 1.
4. **Fix each refusal check printed.** It ends `[<rule>] fix: ... (GUIDE.md#<anchor>)`: read that heading under
   `GUIDE.md#6-refusals-and-their-fixes`, make the fix, and run `wildshard check .` again. A budget can tighten
   between releases (`GUIDE.md#3-budgets`); a lint rule can be new. Done at `check pass`.
5. **Reread this skill:** step 2 rewrote it, and the new copy may differ. Done when you have read the new copy.
6. **Commit** `package.json`, `pnpm-lock.yaml`, the guide, the skills, any agent file update added, any codemod edit
   and your fixes together. Done when `git status` is clean.
   A new sdk can change what the shard looks like, so before the next upload follow the `wildshard-goldens` skill.

## Rules

- Move the pins together, never one alone: the sdk is built and tested against the others it names. `--pins` does.
- Fix the shard source to the new rules; do not pin an older piece to dodge a refusal.
- If check fails on a shard source you did not change and the refusal's fix does not apply, go back to the old pins
  and report the message.
