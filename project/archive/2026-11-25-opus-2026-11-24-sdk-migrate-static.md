# SDK 0.5.0: breaking changes an author can't miss, first used to drop a shard repo's `public/`

> Written by: Claude (opus, session 015pj4Rw)

> **State:** done, 2026-11-25, every row built (ask A7). M1 to M6, S1 to S3, B1 and SF1 (shard-format
> `0ea842f`). R1: sdk 0.5.0, then 0.5.1 (`engines.node`). R2: Driftwood `69ed5b0` (t16), outside-author journey passed.
> R3/R4: roll `sdk-0.5.1` landed in all 11 (dunes `4af9a46`+`745e98a`, nalati `79ed4b6`, nine-dragon `b4065d1`,
> open-plots `91ce0b6`+`e87570d`, pine-hollow `3d9af38`, sky-reach `69e693a`+`b318ae8`, brasscap `737be3e`+`00dc26c`,
> glowfen `02b4a82`, mirror-salt `2486fc3`, stranger `7a36e63`, showcase `7c0fe6d`+`a27e836`); products byte-identical to
> 0.4.34 but each moved map's tilesHash; Showcase agent-sync `--check` passes, guide at docs/GUIDE.md. F1 `203899e2`,
> F2 `5c2b4332`, F3 `439bcf7c` (a break: sdk 0.6.0 with codemods/0.6.0.mjs), F5 `bb36c8af`; all on npm as 0.6.0.
> F4 `97be3eb2`, on Jake's word ("Yes, delete"). Owner: opus session 015pj4Rx (Jake: "your in charge for 0.5.0 etc and
> finishing this whole plan"); R2 by t16 (015pj4Rw).

## Why

Ask A7. Jake, 2026-11-24:
- *"I'd rather have all the source code of the game zone be in ./src/
  and the generated shardfile output in ./out/ and remove the ./public/
  directory."*
- *"just the move without the rename is the least risky thing to do up &
  down the stack."*
- *"0.4.$PATCH is non breaking, and 0.5.0 is for breaking, we bump the
  minor on every break."*
- *"how do we get the sharddev CLI / tooling out of the box say 'hey you
  installed 0.5.0 but no-one dealt with the breaking change migration so
  now you or claude have to do it' … how do we make it the best devex?"*

Today a shard repo's `public/` is left over from the engine's Vite app.
The build reads `<repo>/public/` for the bytes behind each name a shard
mounts. So `scripts/publish-public.mjs` copies `src/assets/public` back
there, and committed source files (Driftwood: 129 under
`public/assets/{baked,models,sfx,music,gpu,lut,horizon}` plus
`public/programs/`) live outside `src/`.

The only way to move a repo to a new sdk is `update --pins`. Nothing
records what was migrated, so a repo bumped any other way is silently
half-moved, and once its pin says the new version, `update --pins` runs
nothing.

This is an **SDK break** (engine `.agents/skills/breaking-release` §4):
no stored shard file changes, and the names inside a shard stay the
same, so every product is byte-identical.

## Context a fresh executor needs (surveyed 2026-11-24 on main `0bcf032b`)

1. The session plan, the full design:
   `~/.claude/plans/ok-can-you-explain-temporal-brook-of-f3d1fc88-b47c-4617-9153-7aa841a5f00a.md`.
2. Readers of `public/`:
   - `packages/sdk/src/sharddev/cookInput.ts:47` (`publicRoot`);
   - `packages/build/src/sharddev/buildMain.ts:36` and
     `packages/dev/scripts/wildshard.mjs:99` (`imageRoots` `/assets/` →
     `public/assets`);
   - `packages/dev/src/sharddev/dev.ts:79` (`imageRootFile`);
   - `packages/dev/scripts/record-shard-mounts.mjs:18`;
   - `packages/dev/scripts/build-shardfiles.mjs:138`, the map bakes
     `bake-maps.mjs`, `bake-data-maps.mjs:57`, `bake-map-glb.mjs`.
3. Default output `public/shardfiles/<slug>`:
   `packages/build/src/sharddev/project.ts:308`,
   `packages/dev/src/sharddev/checkProject.ts:97,114`,
   `packages/build/src/sharddev/buildVerb.ts:157`,
   `packages/sdk/src/sharddev/performancePolicy.ts:27`, text in
   `packages/dev/src/cli/help.ts:158` and
   `packages/upload/src/sharddev/refusals.ts:177,199`;
   `packages/sdk/src/sharddev/newProject.ts:152-156,205`.
4. Upgrades: `packages/sdk/src/sharddev/updatePins.ts`
   (`codemodsBetween` :196, `applyCodemods` :208),
   `packages/sdk/codemods/0.4.24.mjs` (the newest codemod's shape),
   `packages/sdk/src/sharddev/agentFiles.ts` (`update`),
   `packages/dev/src/sharddev/cli.ts:79`,
   `packages/sdk/skills/wildshard-upgrade/SKILL.md`, refusals in
   `packages/upload/src/sharddev/refusals.ts` (precedent:
   `pin-not-sdk`).
5. `shardRepoRoot`, `shardOutputRoot`, `isRepoSource` in
   `packages/upload/src/sharddev/shardSource.ts:45-68`.
6. `projectManifest.ts:42`: a manifest image must match exactly one
   image root, so roots must not overlap.

## The one layout rule

A mounted file named `/<path>` lives at `<source>/static/<path>`:
`src/static/…` in a single-shard repo, `src/shards/<slug>/static/…` in a
multi-shard one. Today's `…/assets/public/` becomes
`…/static/assets/<slug>/`. `src/assets/` keeps its hash-named blobs.
Build output defaults to `out/<slug>`.

## Rows

| Row | Work | Done when |
|---|---|---|
| **M1** | Migration contract and stamp. `codemods/<v>.mjs` may export `title`, `pending({project})` and `guide` (an anchor). New `packages/sdk/src/sharddev/migrations.ts`: `readStamp`/`writeStamp` (`package.json` `"wildshard": {"migrated": "<v>"}`), and `pendingMigrations(project, sdkRoot, installed)`: every codemod with stamp < v ≤ installed, plus any whose `pending` fires; with no stamp, only those whose `pending` fires. | `node:test` on real temp repos: a stamped repo lists the window; an unstamped repo lists only firing `pending`s; a codemod whose `pending` clears drops out |
| **M2** | `wildshard status [--brief] [dir]`: read-only and offline; prints the installed sdk, the stamp and each pending migration (`--brief`: one line, or nothing). The up-front refusal `migration-pending` in `dev`, `watch`, `build`, `check` (also `--json`) and `upload`: the block in the session plan, pointing at `node_modules/@wildshard/sdk/skills/wildshard-upgrade/SKILL.md`. A refusals.ts entry plus its GUIDE.md anchor. | Tests: a repo with a firing `pending` makes each verb exit 1 with the block; `check --json` has `rule: migration-pending`; a clean repo runs as before |
| **M3** | `wildshard migrate [dir]`. Refuse a dirty tree, sync GUIDE.md and the skills (`agentFiles` update), run each pending migration oldest first, write the stamp, then print the report: what moved and the **manual steps** (a migration returns `{lines, manual}` or a plain `string[]`). It is idempotent. | A test on a real git temp repo: the first run migrates and stamps; a second run prints nothing pending; a dirty tree is refused |
| **M4** | `wildshard upgrade [version]`: pins, `pnpm install`, `migrate`, `check`. `update --pins[=v]` becomes its alias. `updatePins.ts` selects codemods through `pendingMigrations`, so a pin already at v still runs a firing one. Help text updated. | `updatePins` tests pass in the new shape, plus one test: a hand-bumped repo (pin = new version, codemod pending) gets the codemod from `upgrade` |
| **M5** | Agents out of the box. `new` and `update` add a SessionStart hook to the shard repo (`.claude/settings.json` and `.codex/hooks.json`) running `pnpm exec wildshard status --brief`, merged into any existing hooks and never duplicated. Rewrite `skills/wildshard-upgrade/SKILL.md` around `upgrade` and `migrate`. GUIDE.md gets a section on migrating, plus `migrate-0-5-0`. | `newProject-repo` test: the hook is present; `update` on a repo with its own hooks keeps them and adds this one once |
| **M6** | Gates and policy. A sharddev test: `codemods/<v>.mjs` needs `v` = `x.Y.0` (0.4.24 and older exempt), and from 0.5.0 on it must export `title`, `pending` and `guide` with that anchor in `packages/sdk/GUIDE.md`. A minor with no migration needs a `codemods/<v>.none.json` with its reason. `exports.lock.json` losing an export needs a minor bump. CHANGELOG.md header rule; docs/dev.md release section; new skill `.agents/skills/sdk-breaking-release/SKILL.md`, then `pnpm agents:sync`. | Fixture codemods fail the gate (0.6.1.mjs; 0.6.0.mjs without `pending`); the real tree passes |
| **S1** | Part A, the readers: `shardStaticRoot(source)` in `shardSource.ts`; `cookInput.ts`, both `imageRoots`, `record-shard-mounts.mjs` read `static/`. One helper builds the image roots. | New test: a source with only `static/assets/<slug>/x` and `static/assets/baked/y` (no `public/`) cooks both mounts; the existing cook tests pass on `static/` fixtures |
| **S2** | Default output `out/<slug>`: the files in Context 3, `newProject.ts` (no `public/` gitignore lines; add `out/`; README line; new repos get the stamp at their sdk version). | `newProject-repo` and `checkProject` tests expect `out/<slug>`; `grep -rn "public/shardfiles" packages/*/src` lists only tests of the migration |
| **S3** | sharddev's own shards: `pastel-plain` and `ink-cel-valley` move to `static/assets/<slug>/`; delete `packages/sdk/scripts/publish-public.mjs` and its `build:shards` prefix; the map bakes and `build-shardfiles.mjs:138` use `static/assets/<slug>/map/`. | `pnpm build:shards` (from packages/sdk) builds both with product hashes unchanged against main |
| **B1** | `packages/sdk/codemods/0.5.0.mjs` (after M1 and S1). `pending`: `public/assets/` or `scripts/publish-public.mjs` exists. It moves `…/assets/public/` → `…/static/assets/<slug>/` (slug from `publish-public.mjs`'s list, else the identity); each *committed* `public/assets/<folder>` (per `git ls-files`) → `static/assets/<folder>`; `public/programs/` → `static/programs/`. It drops copies and build output, deletes `publish-public.mjs` and its `build:shards` prefix, removes the `public/` gitignore lines, the `public/**` lint ignores and the `ci.yml` watched-path entry, and removes `public/` only when nothing committed is left (else it refuses, naming what is). Manual steps: `scripts/ci21-source-product.mjs`, the `publish.yml` comment. | Tests on real git temp repos shaped like Driftwood (single-shard) and Open Plots (multi-shard): the right files move, `pending` clears, a second run is a no-op |
| **SF1** | shard-format `src/tools/brasscap-export.ts:127`: build into an explicit `out/brasscap-mesa` and read it there. | shard-format's own check passes; the `corpus/exports/brasscap-mesa` export is unchanged |
| **R1** | Release 0.5.0 on the normal train (repo-kit `release.sh`); CHANGELOG `## v0.5.0` opens with **Breaking:**. | `@wildshard/sdk@0.5.0` on npm |
| **R2** | Driftwood: record its product hash on 0.4.x, `wildshard upgrade 0.5.0`, do the manual steps, commit and push. | Product hash identical; `check .` passes from a fresh clone with no `public/`; ci green; the outside-author journey in Verification passes on a scratch copy |
| **R3** | The other 11, in parallel after R2: Dunes, Nalati, Nine Dragon, Open Plots, Pine Hollow, Sky Reach, Showcase (each moves a `public/`); Brasscap, Glowfen, Mirror Salt, Stranger (stamp and gitignore only). Brasscap only after SF1. | Each repo: product hash identical, `check` passes, ci green, no `public/` left |
| **R4** | Ask A8 (`b6214533`): Showcase is on repo-kit's agent-sync. In its R3 upgrade, also run `wildshard update --guide docs/GUIDE.md` and `pnpm agents:sync`, and commit the four `.agents/skills/wildshard*` folders, their `.claude/skills` links and `docs/GUIDE.md`. | In shard-showcase: `node src/scripts/.kit/agent-sync.mjs --check` passes, no root `GUIDE.md`, `package.json` has `"wildshard": { "guide": "docs/GUIDE.md" }` |
| **F1** | t16, R2: `migrate` and `update` write `.agents/hooks.local.json` but leave the repo's agent sync unrun, so a kit repo's own check refuses `.claude/settings.json` and `.codex/hooks.json` as out of date. Run the repo's `agents:sync` when it has one. | An outside kit-layout repo's `pnpm check` passes straight after `wildshard upgrade` |
| **F2** | R3 trial: the 0.5.0 migration leaves old paths in code, tests and map inputs: `public${url}` reads, `'public'` segments in `resolve`/`join`, `'public'.length`, `../../../public/` inputs. The roll's `tmp/r3-roll/fixup.mjs` rules are the list to fold into the migration or its manual scan. | The migration's manual list names every such line in the 11 repos' pre-roll trees |
| **F3** | R3 trial: a map input that names a missing file is dropped without a word (Sky Reach built without a GLB). Refuse it, as a minor if a green repo would go red. | A build whose map input is missing refuses, naming the file |
| **F4** | For Jake (t16): `packages/sdk/public/assets/baked/template-props/` (80 tracked files) has no reader. Delete it on his word. | Gone, or kept with a reader named |
| **F5** | t16, R2 journey: a partial hand bump (`@wildshard/sdk` and `cli` to 0.5.0, `dev` left at 0.4.31) keeps `wildshard` on `@wildshard/dev` 0.4.31, which has no migration gate: `dev` runs, `check` fails on the old layout without naming the migration, and `status` is unknown. Refuse a mixed sdk family (CP18 pin check, or the cli naming the version it expects). | A repo with `sdk` 0.5.0 and `dev` 0.4.x is refused, naming the family pin to move |

Order: M1, S1, S2 and SF1 start together; M2 to M6 follow M1; S3 follows
S1; B1 follows M1 and S1; R1 follows everything in sharddev; R2 follows
R1; R3 follows R2.

## Seams

- Mode 2: plan worktrees landed by `land`. `sdk-migrate` carries M1 to
  M6 (owns `updatePins.ts`, `cli.ts`, the new `migrations.ts`,
  `agentFiles.ts`, the upgrade skill, `codemods/`). `static-root`
  carries S1 to S3 (owns `cookInput.ts`, `shardSource.ts`,
  `buildMain.ts`, `wildshard.mjs`, `record-shard-mounts.mjs`, the output
  paths, `newProject.ts`'s gitignore and README). B1 is on `sdk-migrate`
  after `static-root` lands.
- Shared files: `refusals.ts`, `help.ts`, `GUIDE.md`. S2 touches only
  the `public/shardfiles` lines; M2, M4 and M5 add new entries. A rebase
  settles them.
- Releases go out several times a day (v0.4.30 to v0.4.33 on 11-24). The
  0.4.x train keeps running until R1; R1 must be cut from a main that
  has both worktrees landed.
- Other live plans (`codex-2026-11-08-author-coverage`,
  `opus-2026-11-05-sharddev-import`, `opus-2026-11-12-mossgate-v2`)
  don't touch these files.

## Verification

- Byte-identical: every shard's built product hashes the same before and
  after (S3, R2, R3).
- The outside-author journey, on a scratch copy of Driftwood:
  - a hand `pnpm add @wildshard/sdk@0.5.0`, then `wildshard dev .`,
    refuses with the block;
  - `check --json` has `migration-pending`, and `status --brief` prints
    the line;
  - `migrate` moves everything and stamps, and a second `migrate` is
    silent;
  - `check .` passes on a fresh clone.
- A fresh Claude in that scratch repo, told only "upgrade the sdk", ends
  at `check pass`.
- Tests named in each row; `pnpm test` and the pre-push hooks green on
  each land.

## Sync

- `docs/prd.md`: none. The PRD names no source layout or upgrade flow
  (check at build time; edit it if it does).
- `docs/dev.md`: release section, the minor-on-break rule (M6).
- `docs/decisions.md`: one entry, "0.x minor on every break; migrations
  with `pending()`; `src/static/` layout" (M6).
- `AGENTS.md`: one line under Agent tooling pointing at the
  `sdk-breaking-release` skill (M6).
- `packages/sdk/GUIDE.md`: layout section 2 (`src/static/`), the
  migrating section, `migrate-0-5-0` (M5, S2).

## Open decisions for Jake

None open. Settled in session: `src/static/` (Jake); move only; 0.5.0;
Driftwood first, then the rest in parallel; the name `cookInput` stays.
