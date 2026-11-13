---
name: wildshard
description: The loop's order for a Wildshard shard repo (a repo with src/shard.config.ts and GUIDE.md, made by `wildshard new`), one GUIDE.md pointer per step. Use before any `wildshard` command or edit to its shard source - changing data, generators, behaviour scripts, assets or card; walking or checking it; fixing a refusal; capturing the hero; uploading to staging or production; sharing it.
---

# wildshard

This repo is a **shard source**. `wildshard check` builds it into one **shard file**, and `wildshard upload` sends
that file to a channel. `GUIDE.md` at the repo root is the author's manual: it holds each fact or names the command
that prints it. This skill holds only the order of the steps. A pointer `GUIDE.md#<anchor>` is the guide heading with
that anchor. Before your first command or edit, read the guide's opening "Words" paragraph and sections 1 and 2.

## When to reach it

Any work in this repo: load it before you run a `wildshard` command or edit the shard source.

## The loop, in order

Run each step from the project folder. Read the step's section first: it says what works today, and what to do
instead where a step is not built yet.

1. **new**: `wildshard new <dir>` started this repo. `GUIDE.md#1-the-loop`; every flag in `GUIDE.md#every-verb`.
2. **dev**: walk the shard on your machine. Not built yet (SA15): `GUIDE.md#walking-your-shard` says how to walk it
   today, and `GUIDE.md#4-what-reloads-under-dev` how `dev` will behave. Done when you have walked it, or know which
   way in needs the Wildshard team.
3. **check**: `wildshard check .` after every change. `GUIDE.md#1-the-loop`; what it measures in
   `GUIDE.md#3-budgets`. Done when the last line reads `check pass`.
4. **hero**: capture a new hero after your last change to the world. `GUIDE.md#the-hero`, then step 1 of
   `GUIDE.md#uploading`. Done at that step's "Done when".
5. **prepare**: commit, check again after the hero, prepare the built folder, then build its shard file.
   `GUIDE.md#uploading` steps 2 to 4, in order. Done when each of those steps meets its "Done when".
6. **upload --channel staging**: `GUIDE.md#uploading` steps 5 and 6, in order; what each channel moves in
   `GUIDE.md#5-channels-and-the-grid`. Done when upload prints the version and what moved.
7. **upload --channel prod**: the next version, after staging. `GUIDE.md#5-channels-and-the-grid`. Done as step 6.
8. **share**: the per-shard link is not built yet (SA36, SA37). `GUIDE.md#5-channels-and-the-grid` says how to share
   today. Done when you have shared what it names.

## When a command refuses

A refusal ends with `[<rule>] fix: ... (GUIDE.md#<anchor>)`. Read that heading, under
`GUIDE.md#6-refusals-and-their-fixes`, make the fix it names, then run the command that refused again until it
passes.

## Rules

- Take every number, flag and URL from the guide, `wildshard <verb> --help` or `wildshard check . --json`, the live
  sources; this skill carries none.
- Run `wildshard check .` as the loop's check: it runs build, validate and prove for you. Run `wildshard build
  <folder>` only after prepare (`GUIDE.md#1-the-loop`).
- After the sdk moves to a newer version, follow `GUIDE.md#7-wildshard-update`.
