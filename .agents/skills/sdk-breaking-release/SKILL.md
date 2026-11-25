---
name: sdk-breaking-release
description: Ship an sdk change that breaks shard repos as a minor with its migration. Use for "is this breaking" about the sdk, cli or any packages/* export, bin or verb; a removed or renamed export; a moved shard source layout; a stricter default; a red codemod-gate test; or rolling a new minor across the org's shard repos. Not for shard file format changes (engine's breaking-release).
argument-hint: "What is changing? (one line)"
---

# sdk-breaking-release

> Written by: Claude (opus, session 015pj4Rw), 2026-11-25, SDK 0.5.0
> plan M6
> (`project/archive/2026-11-25-opus-2026-11-24-sdk-migrate-static.md`).
> The sdk counterpart of engine `.agents/skills/breaking-release` §4.

The rule (D29; Jake, 2026-11-24: *"0.4.$PATCH is non breaking, and
0.5.0 is for breaking, we bump the minor on every break"*): a patch
never breaks a shard repo; every break is the next minor, `x.Y.0`, and
ships its **migration** in the same release. The six packages share
one version, so the minor moves all of them. Stored shard files are
untouched by an sdk break; only shard repos' source moves.

## 1. Classify, before you change anything

Write the class and one line of reason in the commit body.

| The change | Class |
|---|---|
| A shard repo builds, checks and uploads unchanged on the new sdk | **Patch**: release as usual |
| A repo must change: an export, bin or verb gone or renamed; a layout move; a refusal a passing repo now hits | **Break**: §2 |
| The shard file format, a section, a save or the wire changes | **Not this skill**: engine `breaking-release` |

- *Would a repo green on the last release go red with no edit?* Yes:
  a break.
- A rename keeps the old name working for one release when it can
  (`node scripts/sdk-exports.mjs alias <old> <new>`): then the minor's
  migration rewrites the imports, and a later minor deletes the alias.

## 2. Ship the break

Done when every step's line holds and `pnpm test` is green.

1. **The migration**: `packages/sdk/codemods/<x.Y.0>.mjs`. Exports:
   `title` (one line), `pending({ project })` (why a repo is still in
   the old state, `undefined` once migrated; it must fire on a repo
   that was never stamped), `guide` (`migrate-<x-Y-0>`) and the
   default `({ project, from, to }) => { lines, manual }`. `manual`
   names file and line for each edit no script makes safely. It is
   idempotent: a second run reports nothing. Test it on real git temp
   repos shaped like our shard repos (neighbours:
   `packages/sdk/test/*-codemod.test.ts`). If no repo needs an edit,
   write `codemods/<x.Y.0>.none.json` `{ "reason": "..." }` instead.
2. **The guide**: a `#### migrate-<x-Y-0>` heading under
   `packages/sdk/GUIDE.md` section 7 "Migrations": what changed, why,
   and what to check after.
3. **The changelog**: CHANGELOG.md's `## vX.Y.0` opens with
   `**Breaking:**` and what an author does ("nothing:
   `wildshard upgrade` runs the migration", or the manual step).
4. **The gate**: `pnpm --dir packages/sdk exec vitest run
   test/codemod-gate.test.ts` passes. A codemod for the minor already
   in the tree is what lets a removed export land before the release.
5. **Release** `X.Y.0` on the normal train (`../repo-kit/release.sh
   vX.Y.0 ...`), never a patch number: the gate cannot see the
   release branch (it reuses main's run), so check the version you
   type. Notes go in by `--notes <file>` (one to five bullets, 142
   characters each), never into CHANGELOG.md on main: prepare refuses
   a version whose section is already there. A peer range one package
   holds on another of the six must admit the new minor before the
   cut (`test/tooling/own-peers.test.mjs`); 0.5.0's first branch
   failed packed-install on kit's `^0.3.2 || ^0.4.0`.

## 3. Roll the org's shard repos

1. **Canary**: one repo first (Driftwood for 0.5.0), by hand:
   `pnpm dlx @wildshard/cli upgrade X.Y.0`, do the manual steps, `check
   .`, commit, push, ci green. Done when its built shard file hash is
   unchanged (an sdk break moves source, never the product bytes).
2. **The rest**, as one roll (repo-kit `scripts/roll.mjs`, never repo
   by repo): `node ../repo-kit/scripts/roll.mjs start sdk-X.Y.0
   --repos @<list> --run "pnpm dlx @wildshard/cli upgrade X.Y.0"
   --check "pnpm exec wildshard check ."`, then `status`, fix each
   `red` (its manual steps), then `land`. Done when every repo is
   `landed` and its main ci is green.
   - The `--check` runs what each repo's ci runs, not just `check`:
     `check:shard` and `test:shards` where `package.json` has them,
     and the pre-push gates (a hero stamp hashes the source tree, so
     a layout move makes it stale: capture it again with `wildshard
     dev` and `wildshard hero <source> --base <url>`). The 0.5.1
     roll's `--check` ran only `pnpm check`, and ci found three reds
     after land.
   - A multi-shard repo's files live in `src/shards/<slug>/static/`,
     never `src/static/`: a path rewrite names the source's own
     folder.
   - Mains move during a long roll: fetch before `land`, and after a
     rebase under an uncommitted move, `git reset` so `status` lists
     the paths `start` recorded.
3. Outside authors need nothing from us: every verb refuses with
   `migration-pending` until `wildshard migrate` runs, and their
   SessionStart hook prints the line.
